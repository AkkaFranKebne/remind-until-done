// Package httpapi translates HTTP requests into service calls.
// Routes match swagger.json (design doc Appendix A); router_contract_test.go checks it.
package httpapi

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/auth"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/users"
)

// Pinger checks that the database answers. *pgxpool.Pool has this method;
// tests pass a fake.
type Pinger interface {
	Ping(ctx context.Context) error
}

// TokenVerifier checks a Firebase ID token. *auth.Firebase is the real one.
type TokenVerifier interface {
	Verify(ctx context.Context, idToken string) (auth.Identity, error)
}

// UserStore finds and updates users. *users.Repo is the real one.
type UserStore interface {
	FindOrCreate(ctx context.Context, firebaseUID, email string) (users.User, error)
	Update(ctx context.Context, id string, s users.Settings) (users.User, error)
}

// Deps is everything the API talks to. main passes the real ones, tests pass fakes.
type Deps struct {
	DB      Pinger
	Tokens  TokenVerifier
	Users   UserStore
	Invited auth.Allowlist
}

type API struct {
	log     *slog.Logger
	health  *dbHealth
	tokens  TokenVerifier
	users   UserStore
	invited auth.Allowlist
}

func New(log *slog.Logger, d Deps) *API {
	return &API{log: log, health: newDBHealth(d.DB, log), tokens: d.Tokens, users: d.Users, invited: d.Invited}
}

type route struct {
	method, path string // path without the /api/v1 prefix, as in swagger.json
	handler      http.HandlerFunc
}

// routes lists every public route. requireUser wraps the ones that need sign-in.
func (a *API) routes() []route {
	return []route{
		{"GET", "/healthz", a.healthz},
		{"GET", "/me", a.requireUser(a.getMe)},
		{"PATCH", "/me", a.requireUser(a.patchMe)},
	}
}

// Router returns the handler for the whole service.
//
// Browser calls arrive through the Firebase Hosting rewrite, which forwards
// the full path, so public routes live under /api/v1. Cloud Tasks and Cloud
// Scheduler call /internal/* directly on the Cloud Run URL.
func (a *API) Router() http.Handler {
	mux := http.NewServeMux()
	for _, r := range a.routes() {
		mux.HandleFunc(r.method+" /api/v1"+r.path, r.handler)
	}
	mux.HandleFunc("/", a.notFound)
	return a.logRequests(apiHeaders(mux))
}

// healthz is the liveness check: it always answers 200 {"status":"ok"} while the
// server runs. "database" is the result of the check when this instance started
// (CheckDatabase); the deploy smoke test requires "ok", but the API keeps serving either way.
func (a *API) healthz(w http.ResponseWriter, r *http.Request) {
	database := "ok"
	if !a.health.ok.Load() {
		database = "unavailable"
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "database": database})
}

func (a *API) notFound(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotFound, "not_found", "no such route")
}
