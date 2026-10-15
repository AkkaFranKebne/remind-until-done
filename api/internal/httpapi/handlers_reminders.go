package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/reminders"
)

// reminderJSON is the Reminder schema in swagger.json. Times are UTC instants.
type reminderJSON struct {
	ID             string     `json:"id"`
	Title          string     `json:"title"`
	Note           *string    `json:"note"`
	DueAt          time.Time  `json:"dueAt"`
	Status         string     `json:"status"`
	SentAt         *time.Time `json:"sentAt"`
	NextNagAt      *time.Time `json:"nextNagAt"`
	DoneAt         *time.Time `json:"doneAt"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
	NagIntervalMin int        `json:"nagIntervalMin"`
	NagCount       int        `json:"nagCount"`
	NagsExhausted  bool       `json:"nagsExhausted"`
}

// reminderListJSON is the ReminderList schema in swagger.json.
type reminderListJSON struct {
	Items      []reminderJSON `json:"items"`
	NextCursor *string        `json:"nextCursor"`
}

func utc(t *time.Time) *time.Time {
	if t == nil {
		return nil
	}
	u := t.UTC()
	return &u
}

func toReminderJSON(r reminders.Reminder) reminderJSON {
	return reminderJSON{
		ID: r.ID, Title: r.Title, Note: r.Note, DueAt: r.DueAt.UTC(), Status: string(r.Status),
		SentAt: utc(r.SentAt), NextNagAt: utc(r.NextNagAt), DoneAt: utc(r.DoneAt), CreatedAt: r.CreatedAt.UTC(), UpdatedAt: r.UpdatedAt.UTC(),
		NagIntervalMin: r.NagIntervalMin, NagCount: r.NagCount, NagsExhausted: r.NagsExhausted(),
	}
}

// writeReminderError maps the service's errors to HTTP (design doc 2.2, Errors).
func (a *API) writeReminderError(w http.ResponseWriter, r *http.Request, err error) {
	var verr reminders.ValidationError
	switch {
	case errors.As(err, &verr):
		writeError(w, http.StatusBadRequest, "validation_failed", verr.Message)
	case errors.Is(err, reminders.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "no such reminder")
	case errors.Is(err, reminders.ErrLimitReached):
		writeError(w, http.StatusConflict, "limit_reached", "you can have 5 active reminders; finish or delete one first")
	default:
		// Ids only: titles and notes are personal data and never logged.
		a.log.ErrorContext(r.Context(), "reminders failed",
			"user_id", currentUser(r.Context()).ID, "reminder_id", r.PathValue("id"), "err", err)
		writeError(w, http.StatusInternalServerError, "internal", "something went wrong")
	}
}

// decodeBody reads a small JSON object and refuses unknown fields (a typo like
// "dueat" is an error, not silently ignored).
func decodeBody(w http.ResponseWriter, r *http.Request, into any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)) // a reminder is small; refuse big bodies
	dec.DisallowUnknownFields()
	// One JSON object and nothing after it.
	if err := dec.Decode(into); err != nil || dec.Decode(&struct{}{}) != io.EOF {
		writeError(w, http.StatusBadRequest, "validation_failed", "body must be one JSON object with the fields in swagger.json")
		return false
	}
	return true
}

// GET /api/v1/reminders?status=upcoming|done&cursor=...&limit=...
func (a *API) listReminders(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	in := reminders.ListInput{Status: q.Get("status"), Cursor: q.Get("cursor")}
	if s := q.Get("limit"); s != "" {
		n, err := strconv.Atoi(s)
		if err != nil {
			writeError(w, http.StatusBadRequest, "validation_failed", "limit must be a number")
			return
		}
		in.Limit = n
	}
	page, err := a.reminders.List(r.Context(), currentUser(r.Context()).ID, in)
	if err != nil {
		a.writeReminderError(w, r, err)
		return
	}
	out := reminderListJSON{Items: make([]reminderJSON, 0, len(page.Items)), NextCursor: page.NextCursor}
	for _, item := range page.Items {
		out.Items = append(out.Items, toReminderJSON(item))
	}
	writeJSON(w, http.StatusOK, out)
}

// POST /api/v1/reminders
func (a *API) createReminder(w http.ResponseWriter, r *http.Request) {
	var body struct { // CreateReminder in swagger.json
		Title          *string    `json:"title"`
		Note           *string    `json:"note"`
		DueAt          *time.Time `json:"dueAt"`
		NagIntervalMin *int       `json:"nagIntervalMin"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if body.Title == nil || body.DueAt == nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "title and dueAt are required")
		return
	}
	rem, err := a.reminders.Create(r.Context(), currentUser(r.Context()).ID, reminders.CreateInput{
		Title: *body.Title, Note: body.Note, DueAt: *body.DueAt, NagIntervalMin: body.NagIntervalMin,
	})
	if err != nil {
		a.writeReminderError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, toReminderJSON(rem))
}

// GET /api/v1/reminders/{id}
func (a *API) getReminder(w http.ResponseWriter, r *http.Request) {
	rem, err := a.reminders.Get(r.Context(), currentUser(r.Context()).ID, r.PathValue("id"))
	if err != nil {
		a.writeReminderError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toReminderJSON(rem))
}

// PATCH /api/v1/reminders/{id}. Fields left out stay as they are; "note": null clears the note.
func (a *API) updateReminder(w http.ResponseWriter, r *http.Request) {
	var body struct { // UpdateReminder in swagger.json
		Title          *string         `json:"title"`
		Note           json.RawMessage `json:"note"` // raw, to tell "left out" from null
		DueAt          *time.Time      `json:"dueAt"`
		NagIntervalMin *int            `json:"nagIntervalMin"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	in := reminders.UpdateInput{Title: body.Title, DueAt: body.DueAt, NagIntervalMin: body.NagIntervalMin}
	if body.Note != nil {
		in.NoteSet = true
		if !bytes.Equal(body.Note, []byte("null")) {
			var note string
			if err := json.Unmarshal(body.Note, &note); err != nil {
				writeError(w, http.StatusBadRequest, "validation_failed", "note must be text or null")
				return
			}
			in.Note = &note
		}
	}
	rem, err := a.reminders.Update(r.Context(), currentUser(r.Context()).ID, r.PathValue("id"), in)
	if err != nil {
		a.writeReminderError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toReminderJSON(rem))
}

// DELETE /api/v1/reminders/{id}
func (a *API) deleteReminder(w http.ResponseWriter, r *http.Request) {
	if err := a.reminders.Delete(r.Context(), currentUser(r.Context()).ID, r.PathValue("id")); err != nil {
		a.writeReminderError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/reminders/{id}/done. Done twice is fine (200, unchanged).
func (a *API) markReminderDone(w http.ResponseWriter, r *http.Request) {
	rem, err := a.reminders.MarkDone(r.Context(), currentUser(r.Context()).ID, r.PathValue("id"))
	if err != nil {
		a.writeReminderError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toReminderJSON(rem))
}
