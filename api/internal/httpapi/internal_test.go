package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/logging"
)

// fakeInvoker accepts only the token "good".
type fakeInvoker struct{}

func (fakeInvoker) Verify(_ context.Context, token string) error {
	if token != "good" {
		return errors.New("not the invoker")
	}
	return nil
}

// callInternal sends a request to /internal/* and returns the status and the error code.
func callInternal(t *testing.T, invoker InvokerVerifier, method, path, authHeader string) (int, string, string) {
	t.Helper()
	var logs bytes.Buffer
	api := New(logging.New(&logs), Deps{DB: fakeDB{}, Tokens: fakeTokens{}, Invoker: invoker})
	req := httptest.NewRequest(method, path, strings.NewReader("{}"))
	if authHeader != "" {
		req.Header.Set("Authorization", authHeader)
	}
	rec := httptest.NewRecorder()
	api.Router().ServeHTTP(rec, req)
	var body struct {
		Error struct{ Code string } `json:"error"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	return rec.Code, body.Error.Code, logs.String()
}

func TestInternalRefusesCallersWithoutTheInvokerToken(t *testing.T) {
	tests := []struct {
		name       string
		invoker    InvokerVerifier
		authHeader string
	}{
		{"no token", fakeInvoker{}, ""},
		{"not a Bearer token", fakeInvoker{}, "Basic good"},
		{"empty Bearer", fakeInvoker{}, "Bearer "},
		{"a token that fails the check", fakeInvoker{}, "Bearer someone-elses-token"},
		{"no verifier set: refuse everything", nil, "Bearer good"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			status, code, logs := callInternal(t, tt.invoker, "POST", "/internal/tasks/fire", tt.authHeader)
			if status != http.StatusUnauthorized || code != "unauthorized" {
				t.Errorf("status = %d, code = %q, want 401 unauthorized", status, code)
			}
			if strings.Contains(logs, "someone-elses-token") {
				t.Error("the token was logged")
			}
		})
	}
}

func TestInternalLetsTheInvokerThrough(t *testing.T) {
	// No internal route matches yet, so a caller who passes the check gets 404.
	status, code, _ := callInternal(t, fakeInvoker{}, "POST", "/internal/nope", "Bearer good")
	if status != http.StatusNotFound || code != "not_found" {
		t.Errorf("status = %d, code = %q, want 404 not_found after the check", status, code)
	}
}

func TestEveryInternalRouteNeedsTheInvokerToken(t *testing.T) {
	for _, r := range New(nil, Deps{DB: fakeDB{}}).internalRoutes() {
		t.Run(r.method+" "+r.path, func(t *testing.T) {
			status, _, _ := callInternal(t, fakeInvoker{}, r.method, "/internal"+r.path, "")
			if status != http.StatusUnauthorized {
				t.Errorf("status = %d without a token, want 401", status)
			}
		})
	}
}

func TestPublicRoutesDontAcceptTheInvokerToken(t *testing.T) {
	// The invoker's token is no sign-in: /api/v1 still needs a Firebase user.
	status, _, _ := callInternal(t, fakeInvoker{}, "GET", "/api/v1/me", "Bearer good")
	if status != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", status)
	}
}
