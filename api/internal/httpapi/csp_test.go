package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/logging"
)

func postCSP(t *testing.T, limit RateLimiter, contentType, body string) (*httptest.ResponseRecorder, []map[string]any) {
	t.Helper()
	logs := &bytes.Buffer{}
	h := New(logging.New(logs), Deps{DB: fakeDB{}, Limit: limit}).Router()
	req := httptest.NewRequest("POST", "/api/v1/csp-reports", strings.NewReader(body))
	req.Header.Set("Content-Type", contentType)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var lines []map[string]any
	for _, l := range strings.Split(strings.TrimSpace(logs.String()), "\n") {
		var m map[string]any
		if json.Unmarshal([]byte(l), &m) == nil && m["message"] == "csp violation" {
			lines = append(lines, m)
		}
	}
	return rec, lines
}

func TestCSPReportOldFormatIsLoggedWithoutQueries(t *testing.T) {
	body := `{"csp-report":{"document-uri":"https://rud-dev-4f7k2.web.app/reminders/1?token=secret",
		"violated-directive":"script-src-elem 'self'","blocked-uri":"https://evil.example/x.js?k=secret#f",
		"source-file":"https://rud-dev-4f7k2.web.app/assets/index.js","line-number":12,"disposition":"report"}}`
	rec, lines := postCSP(t, nil, "application/csp-report", body)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d %s, want 204", rec.Code, rec.Body)
	}
	if len(lines) != 1 {
		t.Fatalf("got %d csp lines, want 1", len(lines))
	}
	l := lines[0]
	want := map[string]any{
		"directive": "script-src-elem", "blocked": "https://evil.example", "page": "/reminders/1",
		"source": "https://rud-dev-4f7k2.web.app/assets/index.js", "line": float64(12), "disposition": "report",
		"severity": "WARNING",
	}
	for k, v := range want {
		if l[k] != v {
			t.Errorf("%s = %v, want %v", k, l[k], v)
		}
	}
	if raw, _ := json.Marshal(l); strings.Contains(string(raw), "secret") {
		t.Errorf("a query or fragment reached the log: %s", raw)
	}
}

func TestCSPReportNewFormatKeepsOnlyViolations(t *testing.T) {
	body := `[{"type":"csp-violation","body":{"documentURL":"https://rud-dev-4f7k2.web.app/","effectiveDirective":"style-src-elem",
		"blockedURL":"inline","disposition":"report"}},
		{"type":"deprecation","body":{}},
		{"type":"csp-violation","body":{"documentURL":"https://rud-dev-4f7k2.web.app/","effectiveDirective":"img-src",
		"blockedURL":"data:image/png;base64,AAAA","disposition":"report"}}]`
	rec, lines := postCSP(t, nil, "application/reports+json", body)
	if rec.Code != http.StatusNoContent || len(lines) != 2 {
		t.Fatalf("status %d, %d lines; want 204 and 2", rec.Code, len(lines))
	}
	if lines[0]["blocked"] != "inline" || lines[1]["blocked"] != "data" || lines[1]["directive"] != "img-src" {
		t.Errorf("lines = %v", lines)
	}
}

// Safari (WebKit) posts one object, not a list, as application/csp-report; numbers are numbers.
func TestCSPReportSafariSingleObject(t *testing.T) {
	body := `{"type":"csp-violation","url":"https://rud-dev-4f7k2.web.app/login?next=%2Fr%2F1",
		"body":{"documentURL":"https://rud-dev-4f7k2.web.app/login?next=%2Fr%2F1","disposition":"enforce","referrer":"",
		"effectiveDirective":"connect-src","blockedURL":"https://example.com/x?k=secret","originalPolicy":"default-src 'self'",
		"statusCode":200,"sample":"","sourceFile":"https://rud-dev-4f7k2.web.app/assets/index.js","lineNumber":3,"columnNumber":9}}`
	rec, lines := postCSP(t, nil, "application/csp-report", body)
	if rec.Code != http.StatusNoContent || len(lines) != 1 {
		t.Fatalf("status %d %s, %d lines; want 204 and 1", rec.Code, rec.Body, len(lines))
	}
	l := lines[0]
	if l["directive"] != "connect-src" || l["blocked"] != "https://example.com" || l["page"] != "/login" ||
		l["disposition"] != "enforce" || l["line"] != float64(3) {
		t.Errorf("line = %v", l)
	}
	if raw, _ := json.Marshal(l); strings.Contains(string(raw), "secret") {
		t.Errorf("a query reached the log: %s", raw)
	}
}

// Safari with report-uri only: the old format with "type" and "url" around it.
func TestCSPReportSafariReportURI(t *testing.T) {
	body := `{"type":"csp-violation","url":"https://rud-dev-4f7k2.web.app/",
		"csp-report":{"document-uri":"https://rud-dev-4f7k2.web.app/","referrer":"","violated-directive":"script-src",
		"effective-directive":"script-src","original-policy":"default-src 'self'","blocked-uri":"inline","status-code":0}}`
	rec, lines := postCSP(t, nil, "application/csp-report", body)
	if rec.Code != http.StatusNoContent || len(lines) != 1 || lines[0]["directive"] != "script-src" || lines[0]["blocked"] != "inline" {
		t.Errorf("status %d, lines %v", rec.Code, lines)
	}
}

// One object of another report type (a deprecation): accepted, nothing logged.
func TestCSPReportSingleOtherTypeIsSkipped(t *testing.T) {
	rec, lines := postCSP(t, nil, "application/reports+json", `{"type":"deprecation","body":{}}`)
	if rec.Code != http.StatusNoContent || len(lines) != 0 {
		t.Errorf("status %d, %d lines; want 204 and none", rec.Code, len(lines))
	}
}

func TestCSPReportOddValuesBecomeOther(t *testing.T) {
	body := `{"csp-report":{"document-uri":"not a url","violated-directive":"<script>alert(1)</script>","blocked-uri":"%%%"}}`
	_, lines := postCSP(t, nil, "application/csp-report", body)
	if len(lines) != 1 || lines[0]["directive"] != "other" || lines[0]["blocked"] != "other" || lines[0]["page"] != "other" {
		t.Errorf("lines = %v", lines)
	}
}

func TestCSPReportCapsTheBatch(t *testing.T) {
	one := `{"type":"csp-violation","body":{"documentURL":"https://a.example/","effectiveDirective":"img-src","blockedURL":"data:"}}`
	body := "[" + strings.TrimSuffix(strings.Repeat(one+",", 15), ",") + "]"
	_, lines := postCSP(t, nil, "application/reports+json", body)
	if len(lines) != cspMaxReports {
		t.Errorf("got %d lines, want %d", len(lines), cspMaxReports)
	}
}

func TestCSPReportRefusesOtherBodies(t *testing.T) {
	cases := []struct{ name, contentType, body string }{
		{"wrong type", "text/plain", `{"csp-report":{}}`},
		{"not json", "application/csp-report", `hello`},
		{"neither format", "application/json", `{"a":1}`},
		{"too big", "application/reports+json", "[" + strings.Repeat(" ", cspBodyLimit) + "]"},
	}
	for _, c := range cases {
		rec, lines := postCSP(t, nil, c.contentType, c.body)
		if rec.Code < 400 || len(lines) != 0 {
			t.Errorf("%s: status %d, %d lines; want 4xx and none", c.name, rec.Code, len(lines))
		}
	}
}

func TestCSPReportHasOneSharedLimit(t *testing.T) {
	limit := &fakeLimit{full: map[string]bool{"csp-reports": true}}
	rec, lines := postCSP(t, limit, "application/csp-report", `{"csp-report":{"violated-directive":"img-src"}}`)
	if rec.Code != http.StatusTooManyRequests || len(lines) != 0 || rec.Header().Get("Retry-After") == "" {
		t.Errorf("status %d, %d lines; want 429 and none", rec.Code, len(lines))
	}
}
