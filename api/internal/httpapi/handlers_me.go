package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/auth"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/users"
)

// userJSON is the User schema in swagger.json.
type userJSON struct {
	ID                    string `json:"id"`
	Email                 string `json:"email"`
	Timezone              string `json:"timezone"`
	DefaultTimeOfDay      string `json:"defaultTimeOfDay"`
	DefaultNagIntervalMin int    `json:"defaultNagIntervalMin"`
}

func toUserJSON(u users.User) userJSON {
	return userJSON{u.ID, u.Email, u.Timezone, u.DefaultTimeOfDay, u.DefaultNagIntervalMin}
}

// GET /api/v1/me: the signed-in user and their settings.
func (a *API) getMe(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, toUserJSON(currentUser(r.Context())))
}

// PATCH /api/v1/me: change timezone and defaults. Fields left out stay as they are.
// The web app sends the phone's timezone right after sign-in.
func (a *API) patchMe(w http.ResponseWriter, r *http.Request) {
	var body struct { // UpdateUser in swagger.json
		Timezone              *string `json:"timezone"`
		DefaultTimeOfDay      *string `json:"defaultTimeOfDay"`
		DefaultNagIntervalMin *int    `json:"defaultNagIntervalMin"`
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)) // settings are tiny; refuse big bodies
	dec.DisallowUnknownFields()
	if err := dec.Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "body must be a JSON object with timezone, defaultTimeOfDay or defaultNagIntervalMin")
		return
	}

	u, err := a.users.Update(r.Context(), currentUser(r.Context()).ID, users.Settings{
		Timezone:              body.Timezone,
		DefaultTimeOfDay:      body.DefaultTimeOfDay,
		DefaultNagIntervalMin: body.DefaultNagIntervalMin,
	})
	var verr users.ValidationError
	switch {
	case errors.As(err, &verr):
		writeError(w, http.StatusBadRequest, "validation_failed", verr.Message)
	case err != nil:
		a.log.ErrorContext(r.Context(), "update user failed", "err", err)
		writeError(w, http.StatusInternalServerError, "internal", "something went wrong")
	default:
		writeJSON(w, http.StatusOK, toUserJSON(u))
	}
}

// DELETE /api/v1/me: the user's rows and the Firebase user, inside one database transaction
// (design doc 5.7, decision 78). If it fails the answer says so and the app can try again, which
// finishes the job. On its own context: a phone hanging up mustn't stop it halfway.
//
// Any valid sign-in may call it, invited or not: someone taken off the invite list can still
// delete their data (decision 79). So no requireUser, and it never makes a row. Nobody can reach
// anyone else's account: the token alone says whose. Already gone answers 204.
func (a *API) deleteMe(w http.ResponseWriter, r *http.Request) {
	id, ok := a.identity(w, r)
	if !ok {
		return
	}
	// The invite check is the only other place that looks at this: without it, a sign-in method
	// someone switched on in the console could hand out tokens for free.
	if id.SignInProvider != auth.GoogleProvider {
		a.log.InfoContext(r.Context(), "delete refused: not a Google sign-in", "uid", id.UID)
		writeError(w, http.StatusUnauthorized, "unauthorized", "invalid or expired sign-in, sign in again")
		return
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), deleteMeTimeout)
	defer cancel()
	deleteFirebaseUser := func(ctx context.Context) error {
		// Its own, shorter limit: the commit after it must still have time.
		ctx, cancel := context.WithTimeout(ctx, firebaseDeleteTimeout)
		defer cancel()
		return a.accounts.Delete(ctx, id.UID)
	}

	u, err := a.users.Find(ctx, id.UID, id.Email)
	switch {
	case errors.Is(err, users.ErrNotFound):
		// No rows: never invited, or a retry after an answer that got lost.
		err = deleteFirebaseUser(ctx)
	case err == nil:
		err = a.users.Delete(ctx, u.ID, deleteFirebaseUser)
	}
	if errors.Is(err, users.ErrNotCommitted) {
		// The one half-done case. A retry within the token's hour finishes it; after that the row
		// can only be removed by hand, so this log line must say which one.
		a.log.ErrorContext(ctx, "firebase user deleted, row still there", "user_id", u.ID, "err", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable", "something went wrong, try again in a moment")
		return
	}
	if err != nil {
		a.log.ErrorContext(ctx, "account not deleted", "uid", id.UID, "err", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable", "something went wrong, try again in a moment")
		return
	}
	a.log.InfoContext(ctx, "account deleted", "uid", id.UID)
	w.WriteHeader(http.StatusNoContent)
}

const (
	deleteMeTimeout       = 15 * time.Second
	firebaseDeleteTimeout = 10 * time.Second
)
