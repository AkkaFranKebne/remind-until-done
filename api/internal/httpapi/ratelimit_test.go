package httpapi

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/auth"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/logging"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/ratelimit"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/users"
)

// fakeLimit lets everything through, except the keys in full, and notes every key it was asked.
type fakeLimit struct {
	full  map[string]bool
	asked []string
}

func (f *fakeLimit) Allow(key string) (bool, time.Duration) {
	f.asked = append(f.asked, key)
	if f.full[key] {
		return false, 1500 * time.Millisecond
	}
	return true, 0
}

// limitedAPI is newMeAPI's setup with a limiter. Its database fails every call, so a request
// that reaches the database answers 500, not 429.
func limitedAPI(limit RateLimiter) (http.Handler, *fakeAccounts, *bytes.Buffer) {
	logs := &bytes.Buffer{}
	accounts := &fakeAccounts{gone: map[string]bool{}}
	api := New(logging.New(logs), Deps{
		DB: fakeDB{},
		Tokens: fakeTokens{
			invitedToken:  {UID: "u1", Email: "ewa@example.com", EmailVerified: true, SignInProvider: auth.GoogleProvider},
			strangerToken: {UID: "u2", Email: "stranger@example.com", EmailVerified: true, SignInProvider: auth.GoogleProvider},
		},
		Users:    &fakeUsers{byUID: map[string]users.User{}, err: errors.New("database touched")},
		Accounts: accounts,
		Invited:  auth.NewAllowlist("ewa@example.com"),
		Actions:  testActions,
		Limit:    limit,
	})
	return api.Router(), accounts, logs
}

func request(h http.Handler, method, path, token, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func wantLimited(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	if rec.Code != http.StatusTooManyRequests || !strings.Contains(rec.Body.String(), `"rate_limited"`) {
		t.Fatalf("got %d %s, want 429 rate_limited", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("Retry-After"); got != "2" {
		t.Errorf("Retry-After = %q, want 2 (1.5 s rounded up to whole seconds)", got)
	}
}

func TestOverTheLimitASignedInRouteAnswers429BeforeTheDatabase(t *testing.T) {
	limit := &fakeLimit{full: map[string]bool{"user:u1": true}}
	h, _, logs := limitedAPI(limit)

	for _, route := range []struct{ method, path, body string }{
		{"GET", "/api/v1/me", ""},
		{"GET", "/api/v1/reminders", ""},
		{"POST", "/api/v1/reminders", `{"title":"x","dueAt":"2030-01-01T09:00:00Z"}`},
		{"PATCH", "/api/v1/reminders/r1", `{"dueAt":"2030-01-01T09:00:00Z"}`}, // a move
		{"DELETE", "/api/v1/reminders/r1", ""},
		{"POST", "/api/v1/devices", `{"fcmToken":"t","platform":"web"}`},
	} {
		t.Run(route.method+" "+route.path, func(t *testing.T) {
			wantLimited(t, request(h, route.method, route.path, invitedToken, route.body))
		})
	}
	if strings.Contains(logs.String(), invitedToken) || strings.Contains(logs.String(), "ewa@example.com") {
		t.Errorf("the log has the token or the email:\n%s", logs.String())
	}
}

func TestSomeoneNotInvitedIsLimitedToo(t *testing.T) {
	limit := &fakeLimit{full: map[string]bool{"user:u2": true}}
	h, _, _ := limitedAPI(limit)

	wantLimited(t, request(h, "GET", "/api/v1/me", strangerToken, ""))
}

func TestUnderTheLimitNothingChanges(t *testing.T) {
	limit := &fakeLimit{}
	h, _, _ := limitedAPI(limit)

	// The database fails on purpose: a 500 shows the request got past the limit.
	if rec := request(h, "GET", "/api/v1/me", invitedToken, ""); rec.Code != http.StatusInternalServerError {
		t.Fatalf("got %d %s, want it to reach the database", rec.Code, rec.Body.String())
	}
	if len(limit.asked) != 1 || limit.asked[0] != "user:u1" {
		t.Errorf("asked %v, want exactly [user:u1]", limit.asked)
	}
}

func TestNoSignInIsRefusedWithoutUsingTheLimit(t *testing.T) {
	limit := &fakeLimit{}
	h, _, _ := limitedAPI(limit)

	if rec := request(h, "GET", "/api/v1/me", "", ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
	if len(limit.asked) != 0 {
		t.Errorf("asked %v: a request without a valid token has no user to count", limit.asked)
	}
}

func TestDeleteMeIsLimitedBeforeTheDatabaseAndFirebase(t *testing.T) {
	limit := &fakeLimit{full: map[string]bool{"user:u2": true}}
	h, accounts, _ := limitedAPI(limit)

	// Open to anyone signed in with Google (decision 79), so a stranger counts here too.
	wantLimited(t, request(h, "DELETE", "/api/v1/me", strangerToken, ""))
	if accounts.gone["u2"] {
		t.Error("the Firebase user was deleted although the request was over the limit")
	}
}

func TestActionsAreLimitedPerReminderAfterTheSignatureCheck(t *testing.T) {
	const id = "0b0c3f5e-8a2d-4c5e-9f6b-1d2e3f4a5b6c" // token ids must be uuids
	limit := &fakeLimit{full: map[string]bool{"action:" + id: true}}
	h, _, _ := limitedAPI(limit)

	// A bad token is refused first, and never counts: there's no reminder to count it for.
	if rec := request(h, "POST", "/api/v1/actions", "", `{"token":"forged"}`); rec.Code != http.StatusUnauthorized {
		t.Fatalf("forged token: %d %s, want 401", rec.Code, rec.Body.String())
	}
	if len(limit.asked) != 0 {
		t.Fatalf("asked %v for a forged token", limit.asked)
	}

	// No reminder store in this setup: reaching it would panic, so 429 proves the order.
	wantLimited(t, request(h, "POST", "/api/v1/actions", "", tokenBody(t, doneToken(id, 3))))
	if len(limit.asked) != 1 || limit.asked[0] != "action:"+id {
		t.Errorf("asked %v, want exactly [action:%s]", limit.asked, id)
	}
}

func TestTheRealLimiterStopsALoop(t *testing.T) {
	h, _, _ := limitedAPI(ratelimit.New(3))

	for i := range 3 {
		if rec := request(h, "GET", "/api/v1/me", invitedToken, ""); rec.Code == http.StatusTooManyRequests {
			t.Fatalf("request %d of 3 was limited", i+1)
		}
	}
	if rec := request(h, "GET", "/api/v1/me", invitedToken, ""); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("the 4th request in a row: %d, want 429", rec.Code)
	}
	// Another user has their own limit.
	if rec := request(h, "GET", "/api/v1/me", strangerToken, ""); rec.Code == http.StatusTooManyRequests {
		t.Error("another user was limited by the first one's requests")
	}
}

func TestEveryLimitedRouteDocuments429(t *testing.T) {
	spec := loadSwagger(t)
	for path, ops := range spec.Paths {
		for method, raw := range ops {
			if method == "parameters" || path == "/healthz" {
				continue
			}
			if !strings.Contains(string(raw), `"429"`) {
				t.Errorf("%s %s: swagger.json has no 429 answer", strings.ToUpper(method), path)
			}
		}
	}
}

// slowFirebase plays a Firebase slowdown: Delete waits until the test lets it go.
type slowFirebase struct {
	fakeAccounts
	started chan struct{}
	release chan struct{}
}

func (f *slowFirebase) Delete(ctx context.Context, uid string) error {
	f.started <- struct{}{}
	<-f.release
	return f.fakeAccounts.Delete(ctx, uid)
}

func TestOnlyOneDeleteMeAtATimePerUser(t *testing.T) {
	firebase := &slowFirebase{
		fakeAccounts: fakeAccounts{gone: map[string]bool{}},
		started:      make(chan struct{}),
		release:      make(chan struct{}),
	}
	h := New(logging.New(io.Discard), Deps{
		DB: fakeDB{},
		Tokens: fakeTokens{
			invitedToken: {UID: "u1", Email: "ewa@example.com", EmailVerified: true, SignInProvider: auth.GoogleProvider},
		},
		Users:    &fakeUsers{byUID: map[string]users.User{"u1": {ID: "id-u1", FirebaseUID: "u1"}}},
		Accounts: firebase,
		Invited:  auth.NewAllowlist("ewa@example.com"),
		Limit:    ratelimit.New(60),
	}).Router()

	first := make(chan int)
	go func() { first <- request(h, "DELETE", "/api/v1/me", invitedToken, "").Code }()
	<-firebase.started // the first one now holds its row (and connection) while Firebase is slow

	second := request(h, "DELETE", "/api/v1/me", invitedToken, "")
	if second.Code != http.StatusTooManyRequests || second.Header().Get("Retry-After") != "15" {
		t.Fatalf("a second delete while the first runs: %d, Retry-After %q, want 429 and 15",
			second.Code, second.Header().Get("Retry-After"))
	}

	close(firebase.release)
	if code := <-first; code != http.StatusNoContent {
		t.Fatalf("the first delete: %d, want 204", code)
	}
	// Finished, so the next one runs (already gone: 204 again).
	go func() { <-firebase.started }()
	if rec := request(h, "DELETE", "/api/v1/me", invitedToken, ""); rec.Code != http.StatusNoContent {
		t.Fatalf("a delete after the first finished: %d %s, want 204", rec.Code, rec.Body.String())
	}
}
