package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/logging"
)

// fakeDB answers Ping with err (nil = the database is fine).
type fakeDB struct{ err error }

func (f fakeDB) Ping(context.Context) error { return f.err }

func newTestRouter(logs io.Writer) http.Handler {
	return New(logging.New(logs), fakeDB{}).Router()
}

// getHealthz starts an API like main does (database check first), then calls /healthz.
func getHealthz(t *testing.T, db Pinger) (*httptest.ResponseRecorder, map[string]string) {
	t.Helper()
	api := New(logging.New(io.Discard), db)
	api.health.retryWait = 0
	api.CheckDatabase(context.Background())
	rec := httptest.NewRecorder()
	api.Router().ServeHTTP(rec, httptest.NewRequest("GET", "/api/v1/healthz", nil))
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("body is not JSON: %v", err)
	}
	return rec, body
}

func TestHealthz(t *testing.T) {
	rec, body := getHealthz(t, fakeDB{})

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
	if body["status"] != "ok" || body["database"] != "ok" {
		t.Errorf("body = %v, want status ok and database ok", body)
	}
}

func TestHealthzStaysUpWhenDatabaseIsDown(t *testing.T) {
	rec, body := getHealthz(t, fakeDB{err: errors.New("connection refused")})

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (liveness must not depend on the database)", rec.Code)
	}
	if body["status"] != "ok" || body["database"] != "unavailable" {
		t.Errorf("body = %v, want status ok and database unavailable", body)
	}
}

func TestUnknownRouteReturnsJSONError(t *testing.T) {
	rec := httptest.NewRecorder()
	newTestRouter(io.Discard).ServeHTTP(rec, httptest.NewRequest("GET", "/api/v1/nope", nil))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	var body struct {
		Error struct{ Code, Message string } `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("body is not JSON: %v", err)
	}
	if body.Error.Code != "not_found" {
		t.Errorf("error.code = %q, want not_found", body.Error.Code)
	}
}

func TestRequestsAreLogged(t *testing.T) {
	var logs bytes.Buffer
	req := httptest.NewRequest("GET", "/api/v1/nope", nil)
	req.Header.Set("X-Cloud-Trace-Context", "abc123/456;o=1")
	newTestRouter(&logs).ServeHTTP(httptest.NewRecorder(), req)

	var line map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(logs.String())), &line); err != nil {
		t.Fatalf("log is not one JSON line: %v\n%s", err, logs.String())
	}
	want := map[string]any{"path": "/api/v1/nope", "status": float64(404), "request_id": "abc123", "severity": slog.LevelInfo.String()}
	for k, v := range want {
		if line[k] != v {
			t.Errorf("log %s = %v, want %v", k, line[k], v)
		}
	}
}
