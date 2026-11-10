package httpapi

import (
	"math"
	"net/http"
	"strconv"
	"sync"
	"time"
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
	// The key holds a uid or a reminder id, never an email or a token.
	a.log.InfoContext(r.Context(), "rate limited", "key", key)
	writeTooMany(w, retry)
	return false
}

func writeTooMany(w http.ResponseWriter, retry time.Duration) {
	w.Header().Set("Retry-After", strconv.Itoa(max(1, int(math.Ceil(retry.Seconds())))))
	writeError(w, http.StatusTooManyRequests, "rate_limited", "too many requests, slow down and try again in a minute")
}

// inFlight is the set of keys with a call running now on this instance. DELETE /me holds a
// database connection while it waits for Firebase, and a second one for the same user waits on
// the first one's row lock: a few at once during a Firebase slowdown could take all of the
// instance's connections. So one at a time per user.
type inFlight struct {
	mu   sync.Mutex
	keys map[string]bool
}

func newInFlight() *inFlight { return &inFlight{keys: map[string]bool{}} }

// start answers false if key already has a call running. Otherwise call done(key) when finished.
func (f *inFlight) start(key string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.keys[key] {
		return false
	}
	f.keys[key] = true
	return true
}

func (f *inFlight) done(key string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.keys, key)
}
