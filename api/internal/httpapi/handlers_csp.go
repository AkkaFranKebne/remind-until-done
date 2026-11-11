package httpapi

import (
	"encoding/json"
	"mime"
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

// POST /api/v1/csp-reports: the browser itself sends these, not our web app (design doc 7.1).
//
// web/firebase.json sends a Content-Security-Policy-Report-Only header: the browser blocks
// nothing, but for everything the page loads or runs that the policy doesn't list, it posts a
// report here. Each report becomes one WARN log line "csp violation". After about a week with
// none, the policy is switched on (M7, decision 86).
//
// No sign-in: browsers send reports without our token. So anyone can post here; the answer is
// always the same, nothing is stored, the body is small, and one shared limit per instance keeps
// a flood from filling the logs.
func (a *API) cspReport(w http.ResponseWriter, r *http.Request) {
	if !a.allow(w, r, "csp-reports") {
		return
	}
	mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	switch mediaType {
	case "application/csp-report", "application/reports+json", "application/json":
	default:
		writeError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "send a CSP report")
		return
	}
	var raw json.RawMessage
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, cspBodyLimit)).Decode(&raw); err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "body must be a CSP report")
		return
	}
	reports, ok := parseCSPReports(raw)
	if !ok {
		writeError(w, http.StatusBadRequest, "validation_failed", "body must be a CSP report")
		return
	}
	for _, rep := range reports {
		a.log.WarnContext(r.Context(), "csp violation",
			"directive", rep.directive,
			"blocked", rep.blocked,
			"page", rep.page,
			"source", rep.source,
			"line", rep.line,
			"disposition", rep.disposition,
		)
	}
	w.WriteHeader(http.StatusNoContent)
}

const (
	cspBodyLimit  = 16 << 10 // a report is under 1 KB; browsers batch a few
	cspMaxReports = 10       // log at most this many from one body
)

type cspReport struct {
	directive, blocked, page, source, disposition string
	line                                          int
}

// Two formats exist. Old (report-uri, Safari and Firefox): {"csp-report": {"violated-directive": ...}}.
// New (report-to, Chrome): [{"type": "csp-violation", "body": {"effectiveDirective": ...}}].
type oldCSPReport struct {
	Report *struct {
		DocumentURI        string `json:"document-uri"`
		ViolatedDirective  string `json:"violated-directive"`
		EffectiveDirective string `json:"effective-directive"`
		BlockedURI         string `json:"blocked-uri"`
		SourceFile         string `json:"source-file"`
		LineNumber         int    `json:"line-number"`
		Disposition        string `json:"disposition"`
	} `json:"csp-report"`
}

type newCSPReport struct {
	Type string `json:"type"`
	Body struct {
		DocumentURL        string `json:"documentURL"`
		EffectiveDirective string `json:"effectiveDirective"`
		BlockedURL         string `json:"blockedURL"`
		SourceFile         string `json:"sourceFile"`
		LineNumber         int    `json:"lineNumber"`
		Disposition        string `json:"disposition"`
	} `json:"body"`
}

// parseCSPReports reads either format and keeps only short, safe parts of each field (see
// shortURL). ok is false when the body is neither format.
func parseCSPReports(raw json.RawMessage) (reports []cspReport, ok bool) {
	var old oldCSPReport
	if json.Unmarshal(raw, &old) == nil && old.Report != nil {
		o := old.Report
		directive := o.EffectiveDirective
		if directive == "" {
			directive, _, _ = strings.Cut(o.ViolatedDirective, " ")
		}
		return []cspReport{{
			directive: keyword(directive), blocked: shortURL(o.BlockedURI), page: pagePath(o.DocumentURI),
			source: shortURL(o.SourceFile), line: o.LineNumber, disposition: keyword(o.Disposition),
		}}, true
	}
	var batch []newCSPReport
	if json.Unmarshal(raw, &batch) != nil {
		return nil, false
	}
	for _, n := range batch {
		if n.Type != "csp-violation" {
			continue
		}
		if len(reports) == cspMaxReports {
			break
		}
		b := n.Body
		reports = append(reports, cspReport{
			directive: keyword(b.EffectiveDirective), blocked: shortURL(b.BlockedURL), page: pagePath(b.DocumentURL),
			source: shortURL(b.SourceFile), line: b.LineNumber, disposition: keyword(b.Disposition),
		})
	}
	return reports, true
}

var keywordChars = regexp.MustCompile(`^[a-z0-9-]{1,40}$`)

// keyword keeps a directive name or a word like "inline", "eval", "report"; anything else
// becomes "other", so a made-up report can't write arbitrary text into the logs.
func keyword(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	if s == "" {
		return ""
	}
	if keywordChars.MatchString(s) {
		return s
	}
	return "other"
}

// shortURL keeps the origin and path of a web address, never its query or fragment (they can
// hold tokens, like Google's sign-in redirect does). "data:..." and "blob:..." become just the
// scheme; words like "inline" or "eval" stay as they are.
func shortURL(s string) string {
	u, err := url.Parse(strings.TrimSpace(s))
	if err != nil {
		return "other"
	}
	if (u.Scheme == "https" || u.Scheme == "http" || u.Scheme == "wss") && u.Host != "" {
		return truncate(u.Scheme+"://"+u.Host+u.EscapedPath(), 200)
	}
	if u.Scheme != "" {
		return keyword(u.Scheme)
	}
	return keyword(s)
}

// pagePath is the page the report came from: the path only, since the origin is always ours.
func pagePath(s string) string {
	u, err := url.Parse(strings.TrimSpace(s))
	if err != nil || u.Host == "" {
		return "other"
	}
	return truncate(u.EscapedPath(), 200)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
