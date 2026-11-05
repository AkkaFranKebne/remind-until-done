package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/auth"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/logging"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/users"
)

// fakeTokens accepts the tokens in its map and rejects everything else.
type fakeTokens map[string]auth.Identity

func (f fakeTokens) Verify(_ context.Context, token string) (auth.Identity, error) {
	if id, ok := f[token]; ok {
		return id, nil
	}
	return auth.Identity{}, errors.New("token expired")
}

// fakeUsers keeps users in memory, by Firebase uid.
type fakeUsers struct {
	byUID   map[string]users.User
	creates int
	err     error
	// deleteErr fails Delete.
	deleteErr error
}

// fakeAccounts plays Firebase: everyone exists unless they're in gone.
type fakeAccounts struct {
	gone      map[string]bool
	checks    int
	checkErr  error
	deleteErr error
}

func (f *fakeAccounts) Exists(_ context.Context, uid string) (bool, error) {
	f.checks++
	return !f.gone[uid], f.checkErr
}

func (f *fakeAccounts) Delete(_ context.Context, uid string) error {
	if f.deleteErr != nil {
		return f.deleteErr
	}
	f.gone[uid] = true
	return nil
}

func (f *fakeUsers) Find(_ context.Context, uid, _ string) (users.User, error) {
	if f.err != nil {
		return users.User{}, f.err
	}
	if u, ok := f.byUID[uid]; ok {
		return u, nil
	}
	return users.User{}, users.ErrNotFound
}

func (f *fakeUsers) Delete(ctx context.Context, id string, also func(context.Context) error) error {
	if f.deleteErr != nil {
		return f.deleteErr
	}
	if err := also(ctx); err != nil {
		return err // rolled back: the row stays
	}
	for uid, u := range f.byUID {
		if u.ID == id {
			delete(f.byUID, uid)
		}
	}
	return nil
}

func (f *fakeUsers) FindOrCreate(_ context.Context, uid, email string) (users.User, error) {
	if f.err != nil {
		return users.User{}, f.err
	}
	if u, ok := f.byUID[uid]; ok {
		return u, nil
	}
	f.creates++
	u := users.User{ID: "id-" + uid, FirebaseUID: uid, Email: email, Timezone: "UTC", DefaultTimeOfDay: "09:00", DefaultNagIntervalMin: 60}
	f.byUID[uid] = u
	return u, nil
}

func (f *fakeUsers) Update(_ context.Context, id string, s users.Settings) (users.User, error) {
	if err := s.Validate(); err != nil {
		return users.User{}, err
	}
	for uid, u := range f.byUID {
		if u.ID == id {
			if s.Timezone != nil {
				u.Timezone = *s.Timezone
			}
			f.byUID[uid] = u
			return u, nil
		}
	}
	return users.User{}, errors.New("no such user")
}

const (
	invitedToken    = "token-invited"
	strangerToken   = "token-stranger"
	unverifiedToken = "token-unverified"
)

type testAPI struct {
	handler  http.Handler
	users    *fakeUsers
	accounts *fakeAccounts
	logs     *bytes.Buffer
}

func newMeAPI() testAPI {
	logs := &bytes.Buffer{}
	store := &fakeUsers{byUID: map[string]users.User{}}
	accounts := &fakeAccounts{gone: map[string]bool{}}
	api := New(logging.New(logs), Deps{
		DB: fakeDB{},
		Tokens: fakeTokens{
			invitedToken:    {UID: "u1", Email: "ewa@example.com", EmailVerified: true, SignInProvider: auth.GoogleProvider},
			strangerToken:   {UID: "u2", Email: "stranger@example.com", EmailVerified: true, SignInProvider: auth.GoogleProvider},
			unverifiedToken: {UID: "u3", Email: "ewa@example.com", EmailVerified: false, SignInProvider: auth.GoogleProvider},
		},
		Users:    store,
		Accounts: accounts,
		Invited:  auth.NewAllowlist("ewa@example.com"),
	})
	return testAPI{handler: api.Router(), users: store, accounts: accounts, logs: logs}
}

// call sends a request and returns the status and the decoded JSON body.
func (a testAPI) call(t *testing.T, method, path, authHeader, body string) (int, map[string]any) {
	t.Helper()
	var rb io.Reader
	if body != "" {
		rb = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, rb)
	if authHeader != "" {
		req.Header.Set("Authorization", authHeader)
	}
	rec := httptest.NewRecorder()
	a.handler.ServeHTTP(rec, req)
	if rec.Code == http.StatusNoContent {
		return rec.Code, nil // no body by definition
	}
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("body is not JSON: %v\n%s", err, rec.Body.String())
	}
	return rec.Code, out
}

func errorCode(body map[string]any) string {
	e, _ := body["error"].(map[string]any)
	code, _ := e["code"].(string)
	return code
}

func TestMeRefusesCallersWithoutAValidInvitedToken(t *testing.T) {
	cases := []struct {
		name, header string
		status       int
		code         string
	}{
		{"no header", "", 401, "unauthorized"},
		{"not a bearer token", "Basic abc", 401, "unauthorized"},
		{"empty bearer", "Bearer ", 401, "unauthorized"},
		{"invalid or expired token", "Bearer nonsense", 401, "unauthorized"},
		{"valid but not invited", "Bearer " + strangerToken, 403, "not_invited"},
		{"invited email but unverified", "Bearer " + unverifiedToken, 403, "not_invited"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			api := newMeAPI()
			status, body := api.call(t, "GET", "/api/v1/me", c.header, "")
			if status != c.status || errorCode(body) != c.code {
				t.Errorf("got %d %q, want %d %q", status, errorCode(body), c.status, c.code)
			}
			if api.users.creates != 0 {
				t.Error("a user was created for a refused caller")
			}
		})
	}
}

func TestMeCreatesTheUserOnTheFirstVisit(t *testing.T) {
	api := newMeAPI()

	status, body := api.call(t, "GET", "/api/v1/me", "Bearer "+invitedToken, "")
	if status != 200 {
		t.Fatalf("status = %d, want 200 (%v)", status, body)
	}
	want := map[string]any{"id": "id-u1", "email": "ewa@example.com", "timezone": "UTC", "defaultTimeOfDay": "09:00", "defaultNagIntervalMin": float64(60)}
	for k, v := range want {
		if body[k] != v {
			t.Errorf("%s = %v, want %v", k, body[k], v)
		}
	}

	api.call(t, "GET", "/api/v1/me", "Bearer "+invitedToken, "")
	if api.users.creates != 1 {
		t.Errorf("users created after two visits = %d, want 1", api.users.creates)
	}
}

func TestPatchMe(t *testing.T) {
	api := newMeAPI()

	status, body := api.call(t, "PATCH", "/api/v1/me", "Bearer "+invitedToken, `{"timezone":"Europe/Stockholm"}`)
	if status != 200 || body["timezone"] != "Europe/Stockholm" {
		t.Fatalf("got %d %v, want 200 with the new timezone", status, body)
	}

	for name, bad := range map[string]string{
		"bad timezone":     `{"timezone":"Mars/Olympus"}`,
		"5-minute default": `{"defaultNagIntervalMin":5}`,
		"unknown field":    `{"email":"other@example.com"}`,
		"not JSON":         `timezone=Europe/Stockholm`,
		"too big":          `{"timezone":"` + strings.Repeat("x", 5000) + `"}`,
	} {
		t.Run(name, func(t *testing.T) {
			status, body := api.call(t, "PATCH", "/api/v1/me", "Bearer "+invitedToken, bad)
			if status != 400 || errorCode(body) != "validation_failed" {
				t.Errorf("got %d %q, want 400 validation_failed", status, errorCode(body))
			}
		})
	}
}

func TestPatchMeNeedsSignInToo(t *testing.T) {
	status, _ := newMeAPI().call(t, "PATCH", "/api/v1/me", "", `{"timezone":"Europe/Stockholm"}`)
	if status != 401 {
		t.Errorf("status = %d, want 401", status)
	}
}

func TestDatabaseErrorIsA500WithoutDetails(t *testing.T) {
	api := newMeAPI()
	api.users.err = errors.New("connection refused to host db.internal")

	status, body := api.call(t, "GET", "/api/v1/me", "Bearer "+invitedToken, "")
	if status != 500 || errorCode(body) != "internal" {
		t.Fatalf("got %d %q, want 500 internal", status, errorCode(body))
	}
	if msg := body["error"].(map[string]any)["message"]; strings.Contains(msg.(string), "db.internal") {
		t.Errorf("error message %q leaks internal details", msg)
	}
}

func TestTokensAreNeverLogged(t *testing.T) {
	api := newMeAPI()
	for _, tok := range []string{invitedToken, strangerToken, "nonsense"} {
		api.call(t, "GET", "/api/v1/me", "Bearer "+tok, "")
	}
	for _, tok := range []string{invitedToken, strangerToken, "nonsense"} {
		if strings.Contains(api.logs.String(), tok) {
			t.Errorf("logs contain the token %q", tok)
		}
	}
}
