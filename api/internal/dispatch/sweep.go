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
	// left gets booked the next day: every step is safe to run again.
	sweepBudget = 2 * time.Minute
)

// SweepStats is what one sweep did, for the log (design doc 3.5: sweep_repaired counts).
type SweepStats struct {
	Booked     int  // step b: first pushes booked
	Failed     int  // step b: Cloud Tasks refused; tried again on the next sweep
	Superseded int  // step b: edited or done while booking; the edit's own task counts
	Finished   bool // false: the time budget ran out first (or the caller hung up)
}

// Sweep is the daily safety net Cloud Scheduler calls (design doc 3.4). M4 runs step (b) only:
// book the first push of pending reminders that have none for their current version (saved
// before M4, or more than 25 days ahead when saved) once they're due within scheduling.Horizon.
// Steps (a), (c), (d) and the retention cleanup come in M6.
//
// The task uses the reminder's current version: since decision 52 a version is never handed out
// twice, so a version without enqueued_version never had a task, and its name is free.
// A reminder already past its time is booked anyway: the task fires within seconds.
func (d *Dispatcher) Sweep(ctx context.Context) (SweepStats, error) {
	ctx, cancel := context.WithTimeout(ctx, sweepBudget)
	defer cancel()

	var stats SweepStats
	// Keyset paging (due_at, id): a reminder that failed keeps matching, so OFFSET-free paging
	// past it is what lets the loop end.
	var afterDue time.Time
	afterID := "00000000-0000-0000-0000-000000000000"
	for {
		batch, err := d.needFirstTask(ctx, afterDue, afterID)
		if err != nil && ctx.Err() != nil {
			break // out of time: not an error, the next sweep goes on
		}
		if err != nil {
			return stats, err
		}
		for _, r := range batch {
			if ctx.Err() != nil {
				break
			}
			d.bookFirst(ctx, r, &stats)
			afterDue, afterID = r.At, r.ReminderID
		}
		if ctx.Err() != nil {
			break
		}
		if len(batch) < sweepBatch {
			stats.Finished = true
			break
		}
	}

	level := d.log.InfoContext
	if stats.Failed > 0 || !stats.Finished {
		level = d.log.ErrorContext
	}
	level(context.WithoutCancel(ctx), "sweep_repaired", "step", "b", "booked", stats.Booked, "failed", stats.Failed,
		"superseded", stats.Superseded, "finished", stats.Finished)
	return stats, nil
}

// needFirstTask reads the next batch for step (b), oldest due first.
func (d *Dispatcher) needFirstTask(ctx context.Context, afterDue time.Time, afterID string) ([]scheduling.Task, error) {
	rows, err := d.pool.Query(ctx,
		`SELECT id, schedule_version, due_at FROM reminders
		 WHERE status = 'pending'
		   AND enqueued_version IS DISTINCT FROM schedule_version
		   AND due_at <= $1
		   AND (due_at, id) > ($2, $3)
		 ORDER BY due_at, id
		 LIMIT $4`,
		d.now().Add(scheduling.Horizon), afterDue, afterID, sweepBatch)
	if err != nil {
		return nil, fmt.Errorf("sweep b: %w", err)
	}
	defer rows.Close()
	var batch []scheduling.Task
	for rows.Next() {
		t := scheduling.Task{N: 0}
		if err := rows.Scan(&t.ReminderID, &t.Version, &t.At); err != nil {
			return nil, fmt.Errorf("sweep b: %w", err)
		}
		batch = append(batch, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("sweep b: %w", err)
	}
	return batch, nil
}

// bookFirst books push 0 and marks that version booked. One failure doesn't stop the sweep.
func (d *Dispatcher) bookFirst(ctx context.Context, t scheduling.Task, stats *SweepStats) {
	if err := d.sched.Enqueue(ctx, t); err != nil {
		stats.Failed++
		d.log.WarnContext(ctx, "sweep: first push not booked", "reminder_id", t.ReminderID, "err", err)
		return
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
		return
	}
	if tag.RowsAffected() == 1 {
		stats.Booked++
	} else {
		stats.Superseded++
	}
}
