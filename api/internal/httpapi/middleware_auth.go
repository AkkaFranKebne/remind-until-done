package httpapi

import (
	"context"
	"net/http"
	"strings"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/users"
)

type userKey struct{}

// currentUser is the signed-in user that requireUser put on the request.
func currentUser(ctx context.Context) users.User {
	u, _ := ctx.Value(userKey{}).(users.User)
	return u
}

// requireUser lets a request through only with a valid Firebase ID token from an
// invited Google account (design doc Appendix D.8):
//
//	no or bad token        -> 401 unauthorized
//	valid, but not invited -> 403 not_invited
//	otherwise              -> finds or creates the user, then calls next
//
// The token itself is never logged.
func (a *API) requireUser(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || token == "" {
			writeError(w, http.StatusUnauthorized, "unauthorized", "sign in first")
			return
		}
		id, err := a.tokens.Verify(ctx, token)
		if err != nil {
			a.log.InfoContext(ctx, "token rejected", "err", err)
			writeError(w, http.StatusUnauthorized, "unauthorized", "invalid or expired sign-in, sign in again")
			return
		}
		if !a.invited.Allows(id) {
			a.log.InfoContext(ctx, "not invited", "uid", id.UID)
			writeError(w, http.StatusForbidden, "not_invited", "this app is invite-only")
			return
		}
		u, err := a.users.FindOrCreate(ctx, id.UID, id.Email)
		if err != nil {
			a.log.ErrorContext(ctx, "user lookup failed", "uid", id.UID, "err", err)
			writeError(w, http.StatusInternalServerError, "internal", "something went wrong")
			return
		}
		next(w, r.WithContext(context.WithValue(ctx, userKey{}, u)))
	}
}
