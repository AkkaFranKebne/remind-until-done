package push

import (
	"context"
	"log/slog"
)

// Log sends nothing: it only writes the push to the log. Local runs use it (PUSH=log).
// Ids and the nag line only: the token and the reminder's title are never logged.
type Log struct{ Logger *slog.Logger }

func (l Log) Send(ctx context.Context, _ string, m Message) (Outcome, error) {
	l.Logger.InfoContext(ctx, "push not sent (PUSH=log)",
		"reminder_id", m.ReminderID, "attempt", m.Attempt, "max_attempts", m.MaxAttempts, "body", m.Body)
	return Accepted, nil
}
