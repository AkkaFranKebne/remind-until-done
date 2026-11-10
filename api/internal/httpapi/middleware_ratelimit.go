package httpapi

import (
	"math"
	"net/http"
	"strconv"
)

// allow takes one request from key's limit (design doc 7.2). Over it, it answers 429
// rate_limited with Retry-After itself and returns false. Callers use it before any database
// call, so a loop can't keep the database awake:
//
//	signed-in routes and DELETE /me -> "user:<firebase uid>", right after the token check
//	POST /actions                   -> "action:<reminder id>", right after the signature check
//
// Moves and interval changes are signed-in routes, so the user's limit covers the Cloud Tasks
// they leave behind too.
func (a *API) allow(w http.ResponseWriter, r *http.Request, key string) bool {
	if a.limit == nil {
		return true
	}
	ok, retry := a.limit.Allow(key)
	if ok {
		return true
	}
	w.Header().Set("Retry-After", strconv.Itoa(max(1, int(math.Ceil(retry.Seconds())))))
	// The key holds a uid or a reminder id, never an email or a token.
	a.log.InfoContext(r.Context(), "rate limited", "key", key)
	writeError(w, http.StatusTooManyRequests, "rate_limited", "too many requests, slow down and try again in a minute")
	return false
}
