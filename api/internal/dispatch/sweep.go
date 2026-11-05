package dispatch

import (
	"context"
	"fmt"
	"time"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/scheduling"
)

const (
	// sweepBatch is how many reminders one query reads.
	sweepBatch = 200
	// sweepBudget stops the sweep well inside Cloud Scheduler's 3-minute deadline. Whatever is
	// left gets done the next day: every step is safe to run again.
	sweepBudget = 2 * time.Minute
)

// SweepStats is what one sweep did, for the log (design doc 3.5: sweep_repaired counts).
type SweepStats struct {
	Released   int  // step a: stuck sends given back
	Booked     int  // step b: first pushes booked
	Rebooked   int  // steps c and d: lost pushes booked again under a new version
	GaveUp     int  // steps c and d: rebooked for 3 days with no luck, now Overdue (decision 76)
	Failed     int  // Cloud Tasks refused, or a cleanup failed; tried again on the next sweep
	Superseded int  // steps b, c, d: edited or done meanwhile; that change wins
	Deleted    int  // retention: rows past their time (design doc 7.4)
	Finished   bool // false: the time budget ran out first (or the caller hung up)
}

// Sweep is the daily safety net Cloud Scheduler calls (design doc 3.4): it repairs what the main
// path missed, then deletes what's past its time (retention.go).
//
// a) Gives back sends stuck in 'sending', after a crash or a failed recordSent, stop or release.
// b) Books the first push of pending reminders that have none for their current version (saved
// more than 25 days ahead, or a rebooking of step c that failed), once due within scheduling.Horizon.
// c) Rebooks first pushes that should have fired long ago: the task was lost.
// d) Rebooks nags that should have fired long ago: the chain broke.
//
// Step a runs first, so that what it gives back reaches c and d in the same sweep. Step c runs
// before b: a past-due reminder that b just booked looks lost to c, and would be booked twice.
// So a rebooking that failed in c gets its second try from b straight away.
func (d *Dispatcher) Sweep(ctx context.Context) (SweepStats, error) {
	ctx, cancel := context.WithTimeout(ctx, sweepBudget)
	defer cancel()

	var stats SweepStats
	err := d.sweepSteps(ctx, &stats)
	if err != nil && ctx.Err() == nil {
		return stats, err
	}
	// Out of time isn't an error: the next sweep goes on.

	level := d.log.InfoContext
	if stats.Failed > 0 || stats.GaveUp > 0 || !stats.Finished {
		level = d.log.ErrorContext
	}
	level(context.WithoutCancel(ctx), "sweep_repaired", "released", stats.Released, "booked", stats.Booked,
		"rebooked", stats.Rebooked, "gave_up", stats.GaveUp, "failed", stats.Failed,
		"superseded", stats.Superseded, "deleted", stats.Deleted, "finished", stats.Finished)
	return stats, nil
}

func (d *Dispatcher) sweepSteps(ctx context.Context, stats *SweepStats) error {
	if err := d.releaseStuck(ctx, stats); err != nil {
		return err
	}
	lostBefore := d.now().Add(-lostAfter)
	steps := []struct {
		query string
		limit time.Time
		each  func(context.Context, scheduling.Task, *SweepStats)
	}{
		{lostFirstPush, lostBefore, d.rebookFirst},
		{needFirstTask, d.now().Add(scheduling.Horizon), func(ctx context.Context, t scheduling.Task, s *SweepStats) {
			d.bookFirst(ctx, t, s, &s.Booked)
		}},
		{brokenChain, lostBefore, d.rebookNag},
	}
	for _, step := range steps {
		if err := d.eachInBatches(ctx, step.query, step.limit, func(t scheduling.Task) {
			step.each(ctx, t, stats)
		}); err != nil {
			return err
		}
	}
	d.deleteOld(ctx, stats)
	stats.Finished = ctx.Err() == nil
	return nil
}

// Each query takes a time limit and the keyset position ($2, $3) and a batch size ($4). They
// answer id, version, push number and time, in order of that time.
const (
	needFirstTask = `SELECT id, schedule_version, 0, due_at FROM reminders
		WHERE status = 'pending'
		  AND enqueued_version IS DISTINCT FROM schedule_version
		  AND due_at <= $1
		  AND (due_at, id) > ($2, $3)
		ORDER BY due_at, id
		LIMIT $4`
	lostFirstPush = `SELECT id, schedule_version, 0, due_at FROM reminders
		WHERE status = 'pending'
		  AND enqueued_version = schedule_version
		  AND due_at < $1
		  AND (due_at, id) > ($2, $3)
		ORDER BY due_at, id
		LIMIT $4`
	brokenChain = `SELECT id, schedule_version, nag_count, next_nag_at FROM reminders
		WHERE status = 'sent'
		  AND next_nag_at < $1
		  AND (next_nag_at, id) > ($2, $3)
		ORDER BY next_nag_at, id
		LIMIT $4`
)

// eachInBatches calls each for every reminder the query finds. Keyset paging (time, id): a
// reminder that failed keeps matching, so moving past it is what lets the loop end. It stops
// quietly when time runs out; the caller checks ctx.
func (d *Dispatcher) eachInBatches(ctx context.Context, query string, limit time.Time, each func(scheduling.Task)) error {
	var afterAt time.Time
	afterID := "00000000-0000-0000-0000-000000000000"
	for ctx.Err() == nil {
		batch, err := d.readBatch(ctx, query, limit, afterAt, afterID)
		if err != nil {
			return err
		}
		for _, t := range batch {
			if ctx.Err() != nil {
				return nil
			}
			each(t)
			afterAt, afterID = t.At, t.ReminderID
		}
		if len(batch) < sweepBatch {
			return nil
		}
	}
	return nil
}

func (d *Dispatcher) readBatch(ctx context.Context, query string, limit, afterAt time.Time, afterID string) ([]scheduling.Task, error) {
	rows, err := d.pool.Query(ctx, query, limit, afterAt, afterID, sweepBatch)
	if err != nil {
		return nil, fmt.Errorf("sweep: %w", err)
	}
	defer rows.Close()
	var batch []scheduling.Task
	for rows.Next() {
		var t scheduling.Task
		if err := rows.Scan(&t.ReminderID, &t.Version, &t.N, &t.At); err != nil {
			return nil, fmt.Errorf("sweep: %w", err)
		}
		batch = append(batch, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("sweep: %w", err)
	}
	return batch, nil
}

// bookFirst books push 0 and marks that version booked, adding to count. It answers whether it
// did. One failure doesn't stop the sweep.
func (d *Dispatcher) bookFirst(ctx context.Context, t scheduling.Task, stats *SweepStats, count *int) bool {
	if err := d.sched.Enqueue(ctx, t); err != nil {
		stats.Failed++
		d.log.WarnContext(ctx, "sweep: first push not booked", "reminder_id", t.ReminderID, "err", err)
		return false
	}
	// Only if it's still that version and waiting: an edit or Done in the meantime wins, and
	// the task just booked finds nothing to do when it fires.
	tag, err := d.pool.Exec(ctx,
		`UPDATE reminders SET enqueued_version = $2
		 WHERE id = $1 AND schedule_version = $2 AND status = 'pending'`, t.ReminderID, t.Version)
	if err != nil {
		// The task exists, so this push still goes out; the next sweep books the same name
		// again, which Cloud Tasks answers "already exists" (no second push).
		stats.Failed++
		d.log.WarnContext(ctx, "sweep: booked, not marked", "reminder_id", t.ReminderID, "err", err)
		return false
	}
	if tag.RowsAffected() != 1 {
		stats.Superseded++
		return false
	}
	*count++
	return true
}
