// Package dispatch runs the pushes Cloud Tasks asks for (design doc 3.3, D.6).
//
// Cloud Tasks calls POST /internal/tasks/fire with {reminderId, version, n}. Fire claims the
// reminder, sends push n, records it and books push n+1, until MaxPushes or Done. A task can
// arrive twice, late, or after the reminder changed: the claim only matches the exact version
// and push number, so anything stale does nothing. That is also why old tasks are never deleted.
package dispatch

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/actiontoken"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/messages"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/push"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/reminders"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/scheduling"
)

// ErrTryLater: FCM couldn't take the push. Nothing changed; the API answers 503 so Cloud
// Tasks tries again (up to 5 times, design doc 3.1).
var ErrTryLater = errors.New("push not sent, try later")

// recordTimeout bounds the database work after a send. seenTimeout is the short part of it for
// saving the line: a user's row can be locked for seconds by a save, and counting the push matters more.
const (
	recordTimeout = 10 * time.Second
	seenTimeout   = 2 * time.Second
	// How long a notification's Done button works (design doc 2.2). Each push brings a new token.
	doneTokenTTL = 24 * time.Hour
)

type Dispatcher struct {
	pool   *pgxpool.Pool
	push   push.Sender
	sched  scheduling.Scheduler
	lines  *messages.Picker
	tokens actiontoken.Signer
	log    *slog.Logger
	now    func() time.Time
}

func New(pool *pgxpool.Pool, sender push.Sender, sched scheduling.Scheduler, tokens actiontoken.Signer, log *slog.Logger) *Dispatcher {
	return &Dispatcher{pool: pool, push: sender, sched: sched, lines: messages.NewPicker(pool), tokens: tokens, log: log, now: time.Now}
}

// claimed is what Fire needs from the reminder it claimed.
type claimed struct {
	userID string
	title  string
}

// Fire sends push t.N of the reminder's schedule t.Version. nil means done (HTTP 200), including
// "nothing to do"; ErrTryLater asks Cloud Tasks to retry (503); any other error is a database
// problem (500, also retried).
func (d *Dispatcher) Fire(ctx context.Context, t scheduling.Body) error {
	c, ok, err := d.claim(ctx, t)
	if err != nil || !ok {
		return err
	}

	var token string
	err = d.pool.QueryRow(ctx, `SELECT fcm_token FROM push_subscriptions WHERE user_id = $1`, c.userID).Scan(&token)
	if errors.Is(err, pgx.ErrNoRows) {
		return d.stop(ctx, t, "no_devices")
	}
	if err != nil {
		return d.release(ctx, t, err)
	}

	attempt := t.N + 1
	line, err := d.lines.Pick(ctx, c.userID, messages.LevelFor(attempt))
	if err != nil {
		return d.release(ctx, t, err)
	}

	outcome, sendErr := d.push.Send(ctx, token, push.Message{
		ReminderID:  t.ReminderID,
		Title:       c.title,
		Body:        line.Text,
		URL:         "/r/" + t.ReminderID,
		Attempt:     attempt,
		MaxAttempts: reminders.MaxPushes,
		SentAt:      d.now(),
		DoneToken:   d.tokens.Sign(t.ReminderID, t.Version, actiontoken.Done, doneTokenTTL),
	})
	// From here the push may be out: finish recording it even if Cloud Tasks hangs up, so a
	// retry doesn't find a stale claim and send it again.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), recordTimeout)
	defer cancel()
	switch outcome {
	case push.Accepted:
		return d.recordSent(ctx, t, c.userID, line)
	case push.TokenGone:
		// Warn: one is normal (an app removed), many at once mean a wrong Firebase setting.
		d.log.WarnContext(ctx, "push token gone, device deleted",
			"reminder_id", t.ReminderID, "user_id", c.userID, "err", sendErr)
		if _, err := d.pool.Exec(ctx,
			`DELETE FROM push_subscriptions WHERE user_id = $1 AND fcm_token = $2`, c.userID, token); err != nil {
			return d.release(ctx, t, err)
		}
		return d.stop(ctx, t, "token_gone")
	default:
		d.log.WarnContext(ctx, "push failed, Cloud Tasks retries", "reminder_id", t.ReminderID, "n", t.N, "err", sendErr)
		if err := d.release(ctx, t, nil); err != nil {
			return err
		}
		return ErrTryLater
	}
}

// claim marks the reminder as sending, only if it still waits for exactly this push (design
// doc 3.3, step 1). A send that crashed midway can be claimed again after 2 minutes.
func (d *Dispatcher) claim(ctx context.Context, t scheduling.Body) (claimed, bool, error) {
	var c claimed
	err := d.pool.QueryRow(ctx,
		`UPDATE reminders SET status = 'sending', claimed_at = now(), updated_at = now()
		 WHERE id = $1 AND schedule_version = $2 AND nag_count = $3 AND nag_count < $4
		   AND (status IN ('pending', 'sent')
		        OR (status = 'sending' AND claimed_at < now() - interval '2 minutes'))
		 RETURNING user_id, title`,
		t.ReminderID, t.Version, t.N, reminders.MaxPushes).Scan(&c.userID, &c.title)
	if errors.Is(err, pgx.ErrNoRows) {
		return claimed{}, false, nil // stale (edited, done, deleted) or a duplicate: nothing to do
	}
	if err != nil {
		return claimed{}, false, fmt.Errorf("claim: %w", err)
	}
	return c, true, nil
}

// ours limits an update to the claim this call holds: if the user tapped Done or moved the
// reminder while the push was in flight, the update finds nothing and changes nothing.
const ours = `id = $1 AND schedule_version = $2 AND nag_count = $3 AND status = 'sending'`

// recordSent marks the line as seen, counts the push and books the next one, up to MaxPushes
// (design doc 3.3, step 4). The push already went out, so the line comes first and on its own: if
// saving it fails or waits too long the user may see that line again one day, but the nags go on
// (decision 69). It's saved even if the user tapped Done during the send.
func (d *Dispatcher) recordSent(ctx context.Context, t scheduling.Body, userID string, line messages.Picked) error {
	seenCtx, cancel := context.WithTimeout(ctx, seenTimeout)
	defer cancel()
	if err := messages.MarkSeen(seenCtx, d.pool, userID, line); err != nil {
		d.log.ErrorContext(ctx, "line not marked as seen", "reminder_id", t.ReminderID, "message_id", line.ID, "err", err)
	}

	tx, err := d.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var next *time.Time
	err = tx.QueryRow(ctx,
		`UPDATE reminders SET status = 'sent', sent_at = now(), claimed_at = NULL, updated_at = now(),
		   nag_count = nag_count + 1, line = $5,
		   next_nag_at = CASE WHEN nag_count + 1 < $4 THEN now() + make_interval(mins => nag_interval_min) END
		 WHERE `+ours+` RETURNING next_nag_at`,
		t.ReminderID, t.Version, t.N, reminders.MaxPushes, line.Text).Scan(&next)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil // Done or moved while sending: the push went out, nothing more to do
	}
	if err != nil {
		return fmt.Errorf("record sent: %w", err)
	}
	if err := addEvent(ctx, tx, t.ReminderID, "sent", map[string]any{"n": t.N, "message_id": line.ID}); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	if next == nil {
		return nil // that was the last one: Overdue
	}

	// After the commit: the push already went out, so a failure here must not make Cloud Tasks
	// retry (that would send it twice). The daily sweep restarts the chain (design doc 3.4 d).
	task := scheduling.Task{ReminderID: t.ReminderID, Version: t.Version, N: t.N + 1, At: *next}
	if err := d.sched.Enqueue(ctx, task); err != nil {
		d.log.ErrorContext(ctx, "next nag not booked", "reminder_id", t.ReminderID, "n", t.N+1, "err", err)
		if err := addEvent(ctx, d.pool, t.ReminderID, "nag_schedule_failed", map[string]any{"n": t.N + 1}); err != nil {
			d.log.ErrorContext(ctx, "event not saved", "reminder_id", t.ReminderID, "err", err)
		}
	}
	return nil
}

// stop ends nagging when no push can reach the user: no device, or its token is gone. The app
// shows the reminder as Overdue and Settings says notifications are off (design doc 3.3).
func (d *Dispatcher) stop(ctx context.Context, t scheduling.Body, reason string) error {
	tx, err := d.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	tag, err := tx.Exec(ctx,
		`UPDATE reminders SET status = 'sent', nag_count = $4, next_nag_at = NULL, claimed_at = NULL, updated_at = now()
		 WHERE `+ours, t.ReminderID, t.Version, t.N, reminders.MaxPushes)
	if err != nil {
		return fmt.Errorf("stop nagging: %w", err)
	}
	if tag.RowsAffected() == 1 {
		if err := addEvent(ctx, tx, t.ReminderID, "send_failed", map[string]any{"n": t.N, "reason": reason}); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// release gives the claim back after a failed send: pending if no push went out yet, sent
// otherwise. cause (if not nil) is a database error to return after releasing.
func (d *Dispatcher) release(ctx context.Context, t scheduling.Body, cause error) error {
	// Even if Cloud Tasks hung up: otherwise the claim would stay held.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), recordTimeout)
	defer cancel()
	_, err := d.pool.Exec(ctx,
		`UPDATE reminders SET claimed_at = NULL, updated_at = now(),
		   status = CASE WHEN nag_count = 0 THEN 'pending'::reminder_status ELSE 'sent'::reminder_status END
		 WHERE `+ours, t.ReminderID, t.Version, t.N)
	if err == nil && cause == nil {
		err = addEvent(ctx, d.pool, t.ReminderID, "send_failed", map[string]any{"n": t.N, "reason": "try_later"})
	}
	return errors.Join(cause, err)
}

// execer is a pool or a transaction.
type execer interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

func addEvent(ctx context.Context, db execer, reminderID, eventType string, detail map[string]any) error {
	raw, _ := json.Marshal(detail) // numbers and strings: can't fail
	if _, err := db.Exec(ctx, `INSERT INTO reminder_events (reminder_id, type, detail) VALUES ($1, $2, $3)`,
		reminderID, eventType, raw); err != nil {
		return fmt.Errorf("add event %s: %w", eventType, err)
	}
	return nil
}
