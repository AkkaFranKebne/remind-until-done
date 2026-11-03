package httpapi

import (
	"errors"
	"net/http"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/reminders"
)

// POST /api/v1/actions: the notification's Done button (design doc 2.2, decision 72). No sign-in:
// the token is the login. It travels in the body, because Cloud Run logs every request's address
// and tokens are never logged. A bad token is refused before the database is touched, so
// anonymous callers can't wake it.
func (a *API) applyAction(w http.ResponseWriter, r *http.Request) {
	var body struct { // ActionRequest in swagger.json
		Token *string `json:"token"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if body.Token == nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "token is required")
		return
	}
	claims, err := a.actions.Verify(*body.Token)
	if err != nil {
		writeActionTokenError(w)
		return
	}
	rem, err := a.reminders.MarkDoneFromAction(r.Context(), claims.ReminderID, claims.Version)
	switch {
	case errors.Is(err, reminders.ErrActionStale):
		writeActionTokenError(w)
	case errors.Is(err, reminders.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "no such reminder")
	case err != nil:
		// The id only, never the token.
		a.log.ErrorContext(r.Context(), "action failed", "reminder_id", claims.ReminderID, "err", err)
		writeError(w, http.StatusInternalServerError, "internal", "something went wrong")
	default:
		writeJSON(w, http.StatusOK, map[string]string{"reminderId": rem.ID, "status": string(rem.Status)})
	}
}

// One answer for every bad token: a caller learns nothing about why.
func writeActionTokenError(w http.ResponseWriter) {
	writeError(w, http.StatusUnauthorized, "invalid_action_token", "this button no longer works; open the reminder instead")
}
