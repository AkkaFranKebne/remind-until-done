package dispatch_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/dispatch"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/logging"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/scheduling"
)

// unbooked saves a pending reminder due at `due` with no task, like one saved before M4 or more
// than 25 days ahead. It returns its id and version.
func (w *world) unbooked(t *testing.T, due time.Time) (string, int) {
	t.Helper()
	var id string
	var version int
	err := w.pool.QueryRow(ctx,
		`INSERT INTO reminders (user_id, title, due_at) VALUES ($1, 'Pay rent', $2)
		 RETURNING id, schedule_version`, w.user, due).Scan(&id, &version)
	if err != nil {
		t.Fatal(err)
	}
	return id, version
}

func (w *world) enqueuedVersion(t *testing.T, id string) *int {
	t.Helper()
	var v *int
	if err := w.pool.QueryRow(ctx, `SELECT enqueued_version FROM reminders WHERE id = $1`, id).Scan(&v); err != nil {
		t.Fatal(err)
	}
	return v
}

// sweeper runs Sweep with its own scheduler.
func (w *world) sweeper(sched scheduling.Scheduler) *dispatch.Dispatcher {
	return dispatch.New(w.pool, w.pushes, sched, logging.New(w.logs))
}

// hookScheduler books into a Fake, after running before (which may fail the call).
type hookScheduler struct {
	scheduling.Fake
	before func(scheduling.Task) error
}

func (h *hookScheduler) Enqueue(ctx context.Context, t scheduling.Task) error {
	if err := h.before(t); err != nil {
		return err
	}
	return h.Fake.Enqueue(ctx, t)
}

func TestSweepBooksFirstPushesThatHaveNoTask(t *testing.T) {
	w := setup(t)
	now := time.Now()
	soon, v := w.unbooked(t, now.Add(2*time.Hour))
	late, _ := w.unbooked(t, now.Add(-3*24*time.Hour)) // saved before M4, its time long gone
	edge, _ := w.unbooked(t, now.Add(scheduling.Horizon-time.Minute))
	far, _ := w.unbooked(t, now.Add(scheduling.Horizon+time.Hour)) // not yet: Cloud Tasks takes 30 days at most
	booked := w.newReminder(t)                                     // has its task already

	stats, err := w.fire.Sweep(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if stats != (dispatch.SweepStats{Booked: 3, Finished: true}) {
		t.Errorf("stats = %+v, want 3 booked", stats)
	}
	got := map[string]scheduling.Task{}
	for _, task := range w.nags.Tasks() {
		got[task.ReminderID] = task
	}
	if task := got[soon]; task.Version != v || task.N != 0 || !task.At.Equal(w.get(t, soon).DueAt) {
		t.Errorf("task for the reminder due soon = %+v, want push 0 at its time, version %d", task, v)
	}
	for _, id := range []string{late, edge} {
		if _, ok := got[id]; !ok {
			t.Errorf("no task for %s", id)
		}
	}
	for _, id := range []string{far, booked.ReminderID} {
		if _, ok := got[id]; ok {
			t.Errorf("booked %s, which is too far ahead or already booked", id)
		}
	}
	if ev := w.enqueuedVersion(t, soon); ev == nil || *ev != v {
		t.Errorf("enqueued_version = %v, want %d", ev, v)
	}
	if !strings.Contains(w.logs.String(), `"message":"sweep_repaired"`) || !strings.Contains(w.logs.String(), `"booked":3`) {
		t.Errorf("log has no sweep_repaired count: %s", w.logs)
	}

	// The next day: nothing left to do.
	stats, err = w.fire.Sweep(ctx)
	if err != nil || stats.Booked != 0 || len(w.nags.Tasks()) != 3 {
		t.Errorf("second sweep: %+v, %v, %d tasks; want nothing new", stats, err, len(w.nags.Tasks()))
	}
}

func TestSweepSkipsDoneAndNaggingReminders(t *testing.T) {
	w := setup(t)
	done, _ := w.unbooked(t, time.Now().Add(time.Hour))
	nagging, _ := w.unbooked(t, time.Now().Add(-time.Hour))
	if _, err := w.pool.Exec(ctx, `UPDATE reminders SET status = 'done', done_at = now() WHERE id = $1`, done); err != nil {
		t.Fatal(err)
	}
	if _, err := w.pool.Exec(ctx, `UPDATE reminders SET status = 'sent', nag_count = 2 WHERE id = $1`, nagging); err != nil {
		t.Fatal(err)
	}

	stats, err := w.fire.Sweep(ctx)
	if err != nil || stats.Booked != 0 || len(w.nags.Tasks()) != 0 {
		t.Errorf("sweep: %+v, %v, tasks %+v; want nothing booked", stats, err, w.nags.Tasks())
	}
}

func TestSweepGoesOnAfterAFailureAndTriesItAgainNextTime(t *testing.T) {
	w := setup(t)
	bad, _ := w.unbooked(t, time.Now().Add(time.Hour))
	good, _ := w.unbooked(t, time.Now().Add(2*time.Hour))
	down := true
	sched := &hookScheduler{before: func(task scheduling.Task) error {
		if task.ReminderID == bad && down {
			return errors.New("unavailable")
		}
		return nil
	}}

	stats, err := w.sweeper(sched).Sweep(ctx)
	if err != nil || stats != (dispatch.SweepStats{Booked: 1, Failed: 1, Finished: true}) {
		t.Fatalf("sweep: %+v, %v; want 1 booked, 1 failed", stats, err)
	}
	if w.enqueuedVersion(t, bad) != nil || w.enqueuedVersion(t, good) == nil {
		t.Error("only the reminder that got its task should be marked booked")
	}
	if !strings.Contains(w.logs.String(), `"severity":"ERROR"`) {
		t.Errorf("a sweep with failures should log at ERROR: %s", w.logs)
	}

	down = false
	stats, err = w.sweeper(sched).Sweep(ctx)
	if err != nil || stats.Booked != 1 || w.enqueuedVersion(t, bad) == nil {
		t.Errorf("next sweep: %+v, %v; want the failed one booked", stats, err)
	}
}

func TestSweepLosesToAnEditMadeMeanwhile(t *testing.T) {
	w := setup(t)
	id, v := w.unbooked(t, time.Now().Add(time.Hour))
	// While Cloud Tasks books it, the user moves the reminder (a new version from the sequence).
	sched := &hookScheduler{before: func(scheduling.Task) error {
		_, err := w.pool.Exec(ctx,
			`UPDATE reminders SET schedule_version = nextval('reminder_schedule_version_seq')::int WHERE id = $1`, id)
		return err
	}}

	stats, err := w.sweeper(sched).Sweep(ctx)
	if err != nil || stats.Booked != 0 || stats.Superseded != 1 {
		t.Errorf("sweep: %+v, %v; want 1 superseded, nothing booked", stats, err)
	}
	if ev := w.enqueuedVersion(t, id); ev != nil {
		t.Errorf("enqueued_version = %d, want none: version %d's task is stale, the edit's version still needs one", *ev, v)
	}
}

func TestSweepPagesThroughMoreThanOneBatch(t *testing.T) {
	w := setup(t)
	if _, err := w.pool.Exec(ctx,
		`INSERT INTO reminders (user_id, title, due_at)
		 SELECT $1, 'r' || g, now() + g * interval '1 minute' FROM generate_series(1, 450) g`, w.user); err != nil {
		t.Fatal(err)
	}
	// Every 7th fails: failed rows still match, and paging must step past them.
	sched := &hookScheduler{}
	calls := 0
	sched.before = func(scheduling.Task) error {
		calls++
		if calls%7 == 0 {
			return errors.New("unavailable")
		}
		return nil
	}

	stats, err := w.sweeper(sched).Sweep(ctx)
	if err != nil || !stats.Finished || stats.Booked+stats.Failed != 450 || calls != 450 {
		t.Errorf("sweep: %+v, %v, %d calls; want all 450 tried once", stats, err, calls)
	}
}

func TestSweepStopsCleanlyWhenTimeRunsOut(t *testing.T) {
	w := setup(t)
	for range 20 {
		w.unbooked(t, time.Now().Add(time.Hour))
	}
	// Time runs out after 5 bookings (like Scheduler's deadline, but not tied to the clock, so a
	// slow machine can't change the result).
	short, cancel := context.WithCancel(ctx)
	defer cancel()
	calls := 0
	stopping := &hookScheduler{before: func(scheduling.Task) error {
		calls++
		if calls == 5 {
			cancel()
		}
		return nil
	}}

	stats, err := w.sweeper(stopping).Sweep(short)
	if err != nil || stats.Finished || stats.Booked > 5 || calls != 5 {
		t.Errorf("sweep: %+v, %v, %d calls; want it to stop after 5, not finished, no error", stats, err, calls)
	}
	if !strings.Contains(w.logs.String(), `"finished":false`) {
		t.Errorf("log should say it didn't finish: %s", w.logs)
	}

	// The next day books the rest. The task booked as time ran out wasn't marked: it's booked
	// again under the same name, which Cloud Tasks answers "already exists".
	next, err := w.fire.Sweep(ctx)
	if err != nil || !next.Finished || stats.Booked+next.Booked != 20 {
		t.Errorf("next sweep: %+v, %v; want the other %d booked", next, err, 20-stats.Booked)
	}
}
