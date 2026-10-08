package httpapi

import (
	"net/http"
	"strings"
	"time"
)

// logRequests writes one log line per request.
//
// Cloud Run adds an X-Cloud-Trace-Context header ("TRACE_ID/SPAN_ID;o=1").
// The trace id is logged as request_id so all lines of one request can be found together.
func (a *API) logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)

		requestID, _, _ := strings.Cut(r.Header.Get("X-Cloud-Trace-Context"), "/")
		a.log.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"duration_ms", time.Since(start).Milliseconds(),
			"request_id", requestID,
		)
	})
}

// statusRecorder remembers the status code a handler wrote.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}
