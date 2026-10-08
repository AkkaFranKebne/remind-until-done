// Package httpapi translates HTTP requests into service calls.
// Routes match swagger.json (design doc Appendix A).
package httpapi

import (
	"log/slog"
	"net/http"
)

type API struct {
	log *slog.Logger
}

func New(log *slog.Logger) *API {
	return &API{log: log}
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

func (a *API) healthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (a *API) notFound(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotFound, "not_found", "no such route")
}
