package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

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
