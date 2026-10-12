package httpapi

import "net/http"

// apiHeaders sets the headers every API answer needs, errors included.
//
// Cache-Control: no-store means "never keep a copy": not the phone, not the
// Firebase CDN. Answers are per user (GET /me has the email), so no cache may
// reuse them. Firebase Hosting's header rules can reach API answers too
// (web/firebase.json keeps its Cache-Control rule away from /api/...), but the
// API doesn't depend on that: it sets its own.
func apiHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		next.ServeHTTP(w, r)
	})
}
