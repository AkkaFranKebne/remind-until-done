package scheduling

import (
	"context"
	"fmt"
	"log/slog"
)

// Log books nothing: it only writes the task to the log. Local runs use it
// (SCHEDULER=log), because Cloud Tasks can't call a laptop.
type Log struct{ Logger *slog.Logger }

func (l Log) Enqueue(ctx context.Context, t Task) error {
	l.Logger.InfoContext(ctx, "task not booked (SCHEDULER=log)",
		"task", t.Name(), "reminder_id", t.ReminderID, "version", t.Version, "n", t.N, "at", t.At.UTC(),
		"fire_it", fmt.Sprintf("make fire ID=%s V=%d N=%d", t.ReminderID, t.Version, t.N))
	return nil
}
