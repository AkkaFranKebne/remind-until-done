// Package httpapi translates HTTP requests into service calls.
// Routes match swagger.json (design doc Appendix A).
package httpapi

import (
	"context"
	"log/slog"
	"net/http"
)

// Pinger checks that the database answers. *pgxpool.Pool has this method;
// tests pass a fake.
type Pinger interface {
	Ping(ctx context.Context) error
}

type API struct {
	log    *slog.Logger
	health *dbHealth
}

func New(log *slog.Logger, db Pinger) *API {
	return &API{log: log, health: newDBHealth(db, log)}
}

// Router returns the handler for the whole service.
//
// Browser calls arrive through the Firebase Hosting rewrite, which forwards
// the full path, so public routes live under /api/v1. Cloud Tasks and Cloud
// Scheduler call /internal/* directly on the Cloud Run URL.
func (a *API) Router() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/healthz", a.healthz)
	mux.HandleFunc("/", a.notFound)
	return a.logRequests(mux)
}

// healthz is the liveness check: it always answers 200 {"status":"ok"} while the
// server runs. "database" says whether Postgres answered (a recent answer is reused,
// see dbHealth); the deploy smoke test requires "ok", but the API keeps serving either way.
func (a *API) healthz(w http.ResponseWriter, r *http.Request) {
	database := "ok"
	if !a.health.isOK(r.Context()) {
		database = "unavailable"
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "database": database})
}

func (a *API) notFound(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotFound, "not_found", "no such route")
}
