package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/auth"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/users"
)

type userKey struct{}

// accountCheckTimeout bounds asking Firebase whether a new user's account still exists.
const accountCheckTimeout = 5 * time.Second

// currentUser is the signed-in user that requireUser put on the request.
func currentUser(ctx context.Context) users.User {
	u, _ := ctx.Value(userKey{}).(users.User)
	return u
}

// identity checks the request's Firebase ID token. If it's missing or bad it answers 401 itself
// and returns false. The token itself is never logged.
func (a *API) identity(w http.ResponseWriter, r *http.Request) (auth.Identity, bool) {
	ctx := r.Context()
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok || token == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "sign in first")
		return auth.Identity{}, false
	}
	id, err := a.tokens.Verify(ctx, token)
	if err != nil {
		a.log.InfoContext(ctx, "token rejected", "err", err)
		writeError(w, http.StatusUnauthorized, "unauthorized", "invalid or expired sign-in, sign in again")
		return auth.Identity{}, false
	}
	return id, true
}

// requireUser lets a request through only with a valid Firebase ID token from an
// invited Google account (design doc Appendix D.8):
//
//	no or bad token        -> 401 unauthorized
//	too many requests      -> 429 rate_limited (middleware_ratelimit.go)
//	valid, but not invited -> 403 not_invited
//	otherwise              -> finds or creates the user, then calls next
//
// The token itself is never logged.
func (a *API) requireUser(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		id, ok := a.identity(w, r)
		if !ok {
			return
		}
		// Before the invite check and the database: someone not invited is limited too.
		if !a.allow(w, r, "user:"+id.UID) {
			return
		}
		if !a.invited.Allows(id) {
			a.log.InfoContext(ctx, "not invited", "uid", id.UID)
			writeError(w, http.StatusForbidden, "not_invited", "this app is invite-only")
			return
		}
		u, err := a.users.Find(ctx, id.UID, id.Email)
		if errors.Is(err, users.ErrNotFound) {
			// Before making a row, check with Firebase: a deleted account's token keeps working for
			// up to an hour, and a late request must not bring the account back (decision 76). Only
			// here, so normal requests make no extra call. Don't know? Then no row.
			checkCtx, cancel := context.WithTimeout(ctx, accountCheckTimeout)
			exists, checkErr := a.accounts.Exists(checkCtx, id.UID)
			cancel()
			if checkErr != nil {
				a.log.ErrorContext(ctx, "account check failed", "uid", id.UID, "err", checkErr)
				writeError(w, http.StatusServiceUnavailable, "unavailable", "something went wrong, try again in a moment")
				return
			}
			if !exists {
				a.log.InfoContext(ctx, "account is gone", "uid", id.UID)
				writeError(w, http.StatusUnauthorized, "unauthorized", "invalid or expired sign-in, sign in again")
				return
			}
			u, err = a.users.FindOrCreate(ctx, id.UID, id.Email)
		}
		if err != nil {
			a.log.ErrorContext(ctx, "user lookup failed", "uid", id.UID, "err", err)
			writeError(w, http.StatusInternalServerError, "internal", "something went wrong")
			return
		}
		next(w, r.WithContext(context.WithValue(ctx, userKey{}, u)))
	}
}
