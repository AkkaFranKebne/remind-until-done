// Package scheduling books the pushes of a reminder as Cloud Tasks (design doc 3.1, 3.2, D.4).
//
// Every push is one task: Cloud Tasks calls POST /internal/tasks/fire when it is due.
// Only this package imports the Cloud Tasks SDK. Everything else uses the Scheduler
// interface, so tests can pass a Fake and local runs a Log.
package scheduling

import (
	"context"
	"fmt"
	"time"
)

// Horizon: Cloud Tasks refuses tasks more than 30 days ahead. A first push further out
// than this gets no task yet; the daily sweep books it once it comes within range.
// Nags are at most 24 hours apart, so they never hit the limit.
const Horizon = 25 * 24 * time.Hour

// Task is one push: number N (0 = first push, 1 = first nag, ...) of the reminder's
// schedule Version. The fire handler does nothing if the reminder has moved on since.
type Task struct {
	ReminderID string
	Version    int
	N          int
	At         time.Time
}

// Name is unique per push: r-{reminderId}-v{version}-n{n}. Cloud Tasks refuses a second
// task with the same name, so booking the same push twice is harmless.
func (t Task) Name() string { return fmt.Sprintf("r-%s-v%d-n%d", t.ReminderID, t.Version, t.N) }

// Body is what the fire handler receives. Only ids: no titles or other personal data.
type Body struct {
	ReminderID string `json:"reminderId"`
	Version    int    `json:"version"`
	N          int    `json:"n"`
}

type Scheduler interface {
	// Enqueue books the task. A task with the same name that already exists counts as success.
	Enqueue(ctx context.Context, t Task) error
}
