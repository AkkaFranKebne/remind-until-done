// Package reminders stores reminders and enforces their rules (design doc 2.1, 2.2):
// at most 5 active per user, title 1-200 characters, note up to 200, nag interval 15-1440 minutes,
// due time not in the past and at most a year ahead.
//
// Every query is scoped by the signed-in user's id: another user's reminder
// behaves exactly like one that doesn't exist (ErrNotFound, HTTP 404).
package reminders

import (
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

// Status is the reminder_status enum in V1__init.sql.
type Status string

const (
	StatusPending Status = "pending" // waiting for its first push
	StatusSending Status = "sending" // a push is in flight (M4)
	StatusSent    Status = "sent"    // pushed, nagging until Done (M4)
	StatusDone    Status = "done"
)

const (
	MaxActive         = 5    // active = not done (design doc 2.1)
	MaxPushes         = 12   // per cycle, then Overdue (design doc 2.1)
	MinNagIntervalMin = 15   // same limits as the CHECK in V1__init.sql
	MaxNagIntervalMin = 1440 // 24 hours
	MaxTitleLength    = 200  // characters, like char_length in the CHECK
	MaxNoteLength     = 200  // characters (Design Inventory: the Add sheet shows 41 / 200)

	// A phone's clock can be a little behind the server's: "in 1 minute" picked on
	// the phone must not count as the past.
	clockSkew = time.Minute
)

type Reminder struct {
	ID              string
	Title           string
	Note            *string
	DueAt           time.Time
	NagIntervalMin  int
	Status          Status
	NagCount        int
	NextNagAt       *time.Time
	ScheduleVersion int
	SentAt          *time.Time
	DoneAt          *time.Time
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// NagsExhausted: all pushes of this cycle went out and nobody tapped Done. The app
// shows it as Overdue; it stays until the user acts (design doc 2.1).
func (r Reminder) NagsExhausted() bool {
	return r.Status == StatusSent && r.NextNagAt == nil && r.NagCount >= MaxPushes
}

var (
	ErrNotFound     = errors.New("reminder not found")                     // HTTP 404
	ErrLimitReached = errors.New("at most 5 active reminders, finish one") // HTTP 409 limit_reached
	// Cloud Tasks didn't take the first push. Nothing was saved; trying again is safe.
	ErrScheduleFailed = errors.New("could not schedule a push") // HTTP 503 unavailable
)

// ValidationError is a bad value from the caller (HTTP 400), not a server problem.
type ValidationError struct{ Message string }

func (e ValidationError) Error() string { return e.Message }

// CreateInput is POST /reminders. NagIntervalMin nil = the user's default.
type CreateInput struct {
	Title          string
	Note           *string
	DueAt          time.Time
	NagIntervalMin *int
}

// UpdateInput is PATCH /reminders/{id}: nil fields stay as they are.
// The note has three states: left out (NoteSet false), cleared (null), or a new text.
type UpdateInput struct {
	Title          *string
	NoteSet        bool
	Note           *string
	DueAt          *time.Time
	NagIntervalMin *int
}

// ListInput is GET /reminders. Empty Status = upcoming; Limit 0 = 50.
type ListInput struct {
	Status string // "upcoming" (not done) or "done"
	Cursor string // from the previous page's NextCursor
	Limit  int
}

// Page is one page of a list. NextCursor nil = this was the last page.
type Page struct {
	Items      []Reminder
	NextCursor *string
}

// Postgres text can't hold the NUL character (\x00); refuse it instead of failing later.
var errNUL = ValidationError{"title and note can't contain a NUL character"}

func cleanTitle(title string) (string, error) {
	if strings.ContainsRune(title, 0) {
		return "", errNUL
	}
	t := strings.TrimSpace(title)
	if n := utf8.RuneCountInString(t); n == 0 || n > MaxTitleLength {
		return "", ValidationError{fmt.Sprintf("title must be 1 to %d characters", MaxTitleLength)}
	}
	return t, nil
}

// cleanNote: an empty or blank note is no note.
func cleanNote(note *string) (*string, error) {
	if note == nil || strings.TrimSpace(*note) == "" {
		return nil, nil
	}
	if strings.ContainsRune(*note, 0) {
		return nil, errNUL
	}
	n := strings.TrimSpace(*note)
	if utf8.RuneCountInString(n) > MaxNoteLength {
		return nil, ValidationError{fmt.Sprintf("note must be at most %d characters", MaxNoteLength)}
	}
	return &n, nil
}

func checkNagInterval(n int) error {
	if n < MinNagIntervalMin || n > MaxNagIntervalMin {
		return ValidationError{fmt.Sprintf("nagIntervalMin must be between %d and %d", MinNagIntervalMin, MaxNagIntervalMin)}
	}
	return nil
}

// checkDueAt: not in the past, at most a year ahead (design doc 2.2).
func checkDueAt(due, now time.Time) error {
	switch {
	case due.Before(now.Add(-clockSkew)):
		return ValidationError{"dueAt is in the past"}
	case due.After(now.AddDate(1, 0, 0)):
		return ValidationError{"dueAt must be at most a year ahead"}
	}
	return nil
}
