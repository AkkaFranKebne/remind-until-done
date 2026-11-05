package dispatch

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/reminders"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/scheduling"
)

const (
	// lostAfter: a push this late isn't just running behind, its task is gone (design doc 3.4).
	lostAfter = 15 * time.Minute
	// rebookLimit is how many rebookings of one push a reminder gets, normally one per daily sweep,
	// before it gives up (decision 76). Scheduler's retry of a failed sweep can add one, so it may
	// take 2 days. rebookWindow only has to reach back over those sweeps. Moving the reminder
	// starts the count over.
	rebookLimit  = 3
	rebookWindow = "4 days"
)

// releaseStuck is step a: a send that crashed, or a failed recordSent, stop or release, leaves the
// reminder in 'sending' with no task. 5 minutes is well past any send that's still running.
// Steps c and d then see it as a lost push.
func (d *Dispatcher) releaseStuck(ctx context.Context, stats *SweepStats) error {
	tag, err := d.pool.Exec(ctx,
		`UPDATE reminders SET claimed_at = NULL, updated_at = now(),
		   status = CASE WHEN nag_count = 0 THEN 'pending'::reminder_status ELSE 'sent'::reminder_status END
		 WHERE status = 'sending' AND claimed_at < now() - interval '5 minutes'`)
	if err != nil {
		return fmt.Errorf("sweep a: %w", err)
	}
	stats.Released = int(tag.RowsAffected())
	return nil
}

// rebookFirst is step c. If the booking fails the new version has no task, which step b books:
// straight after this step, or on a later day.
func (d *Dispatcher) rebookFirst(ctx context.Context, t scheduling.Task, stats *SweepStats) {
	if !d.newVersion(ctx, &t, stats) {
		return
	}
	if d.bookFirst(ctx, t, stats, &stats.Rebooked) {
		d.noteRebooked(ctx, t)
	}
}

// rebookNag is step d: the same push number under a new version, for now. If the booking fails,
// the reminder still looks broken the next day.
func (d *Dispatcher) rebookNag(ctx context.Context, t scheduling.Task, stats *SweepStats) {
	if !d.newVersion(ctx, &t, stats) {
		return
	}
	t.At = d.now()
	if err := d.sched.Enqueue(ctx, t); err != nil {
		stats.Failed++
		d.log.WarnContext(ctx, "sweep: nag not rebooked", "reminder_id", t.ReminderID, "n", t.N, "err", err)
		return
	}
	stats.Rebooked++
	d.noteRebooked(ctx, t)
}

// newVersion moves the reminder to a new schedule version, which stops any late task of the old
// one and gives the new task a free name (decision 52). It answers false if there's nothing to
// book: it gave up, it failed, or an edit or Done got there first. It updates t.Version.
//
// Before the booking, not after, and with no lock held during it: Done mustn't wait for Cloud
// Tasks. The cost: a Done button on a notification already showing stops working (its token has
// the old version), until the rebooked push replaces it moments later.
func (d *Dispatcher) newVersion(ctx context.Context, t *scheduling.Task, stats *SweepStats) bool {
	var rebooked int
	err := d.pool.QueryRow(ctx,
		`SELECT count(*) FROM reminder_events
		 WHERE reminder_id = $1 AND type = 'sweep_rebooked' AND (detail->>'n')::int = $2
		   AND created_at > now() - $3::interval`, t.ReminderID, t.N, rebookWindow).Scan(&rebooked)
	if err != nil {
		stats.Failed++
		d.log.WarnContext(ctx, "sweep: rebookings not counted", "reminder_id", t.ReminderID, "err", err)
		return false
	}
	if rebooked >= rebookLimit {
		d.giveUp(ctx, *t, stats)
		return false
	}

	err = d.pool.QueryRow(ctx,
		`UPDATE reminders SET schedule_version = nextval('reminder_schedule_version_seq')::int, updated_at = now(),
		   next_nag_at = CASE WHEN status = 'sent' THEN now() ELSE next_nag_at END
		 WHERE id = $1 AND schedule_version = $2 AND nag_count = $3 AND status IN ('pending', 'sent')
		 RETURNING schedule_version`, t.ReminderID, t.Version, t.N).Scan(&t.Version)
	if errors.Is(err, pgx.ErrNoRows) {
		stats.Superseded++
		return false
	}
	if err != nil {
		stats.Failed++
		d.log.WarnContext(ctx, "sweep: no new version", "reminder_id", t.ReminderID, "err", err)
		return false
	}
	return true
}

// noteRebooked counts this rebooking towards giving up. Only a booked task counts: a Cloud Tasks
// outage says nothing about this reminder. A failure here is only logged: at worst it's rebooked
// one more day.
func (d *Dispatcher) noteRebooked(ctx context.Context, t scheduling.Task) {
	if err := addEvent(ctx, d.pool, t.ReminderID, "sweep_rebooked", map[string]any{"n": t.N}); err != nil {
		d.log.WarnContext(ctx, "sweep: rebooking not noted", "reminder_id", t.ReminderID, "err", err)
	}
}

// giveUp ends nagging for a push that was rebooked every day and still never went out: it would
// otherwise wake Cloud Run and the database every day, forever (decision 76). The app shows the
// reminder as Overdue, like stop.
func (d *Dispatcher) giveUp(ctx context.Context, t scheduling.Task, stats *SweepStats) {
	err := func() error {
		tx, err := d.pool.Begin(ctx)
		if err != nil {
			return err
		}
		defer func() { _ = tx.Rollback(ctx) }()
		tag, err := tx.Exec(ctx,
			`UPDATE reminders SET status = 'sent', nag_count = $4, next_nag_at = NULL, updated_at = now()
			 WHERE id = $1 AND schedule_version = $2 AND nag_count = $3 AND status IN ('pending', 'sent')`,
			t.ReminderID, t.Version, t.N, reminders.MaxPushes)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			stats.Superseded++
			return nil
		}
		if err := addEvent(ctx, tx, t.ReminderID, "sweep_gave_up", map[string]any{"n": t.N}); err != nil {
			return err
		}
		if err := tx.Commit(ctx); err != nil {
			return err
		}
		stats.GaveUp++
		d.log.ErrorContext(ctx, "sweep: gave up on a reminder", "reminder_id", t.ReminderID, "n", t.N)
		return nil
	}()
	if err != nil {
		stats.Failed++
		d.log.WarnContext(ctx, "sweep: couldn't give up", "reminder_id", t.ReminderID, "err", err)
	}
}
