package httpapi

import (
	"errors"
	"net/http"

	"github.com/google/uuid"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/dispatch"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/reminders"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/scheduling"
)

// POST /internal/tasks/fire {reminderId, version, n}: Cloud Tasks, when a push is due (design doc 3.3).
// Cloud Tasks retries any answer that isn't 2xx, so only "try again" is an error here:
//
//	200: done, including a stale or duplicate task that did nothing
//	503: FCM couldn't take the push; 500: a database problem
func (a *API) fireTask(w http.ResponseWriter, r *http.Request) {
	var task scheduling.Body
	if !decodeBody(w, r, &task) {
		return
	}
	if _, err := uuid.Parse(task.ReminderID); err != nil || task.Version < 1 || task.N < 0 || task.N >= reminders.MaxPushes {
		writeError(w, http.StatusBadRequest, "validation_failed", "reminderId must be a UUID, version at least 1, n from 0 to 11")
		return
	}
	err := a.dispatcher.Fire(r.Context(), task)
	switch {
	case err == nil:
		w.WriteHeader(http.StatusNoContent)
	case errors.Is(err, dispatch.ErrTryLater):
		writeError(w, http.StatusServiceUnavailable, "unavailable", "push not sent, try again")
	default:
		a.log.ErrorContext(r.Context(), "fire failed", "reminder_id", task.ReminderID, "n", task.N, "err", err)
		writeError(w, http.StatusInternalServerError, "internal", "something went wrong")
	}
}

// POST /internal/sweep (no body): Cloud Scheduler, daily at 03:00 UTC (design doc 3.4). 204 when
// it ran, even if some reminders couldn't be booked (the log says how many; the next sweep tries
// them again). 500 only if the database couldn't be read; Scheduler then tries once more.
func (a *API) sweep(w http.ResponseWriter, r *http.Request) {
	if _, err := a.dispatcher.Sweep(r.Context()); err != nil {
		a.log.ErrorContext(r.Context(), "sweep failed", "err", err)
		writeError(w, http.StatusInternalServerError, "internal", "something went wrong")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
