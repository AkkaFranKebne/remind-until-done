package dispatch_test

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/dispatch"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/reminders"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/scheduling"
)

func (w *world) exec(t *testing.T, sql string, args ...any) {
	t.Helper()
	if _, err := w.pool.Exec(ctx, sql, args...); err != nil {
		t.Fatal(err)
	}
}

// lostFirst is a reminder whose first push was booked, an hour ago, and never came.
func (w *world) lostFirst(t *testing.T) scheduling.Body {
	t.Helper()
	task := w.newReminder(t)
	w.exec(t, `UPDATE reminders SET due_at = now() - interval '1 hour' WHERE id = $1`, task.ReminderID)
	return task
}

// brokenNag is a reminder that got its first push; its next nag should have come an hour ago.
func (w *world) brokenNag(t *testing.T) scheduling.Body {
	t.Helper()
	task := w.newReminder(t)
	if err := w.fire.Fire(ctx, task); err != nil {
		t.Fatal(err)
	}
	w.breakChain(t, task.ReminderID)
	task.N = 1
	return task
}

func (w *world) breakChain(t *testing.T, id string) {
	t.Helper()
	w.exec(t, `UPDATE reminders SET next_nag_at = now() - interval '1 hour' WHERE id = $1`, id)
}

// lastTask is the newest task the sweep booked.
func (w *world) lastTask(t *testing.T) scheduling.Task {
	t.Helper()
	tasks := w.nags.Tasks()
	if len(tasks) == 0 {
		t.Fatal("no task booked")
	}
	return tasks[len(tasks)-1]
}

func body(task scheduling.Task) scheduling.Body {
	return scheduling.Body{ReminderID: task.ReminderID, Version: task.Version, N: task.N}
}

// M6's goal: an instance dies mid-send, and the reminder still arrives.
func TestAReminderStillArrivesAfterACrashMidSend(t *testing.T) {
	cases := map[string]struct {
		arrange func(*world, *testing.T) scheduling.Body
		wantN   int
	}{
		"the first push": {func(w *world, t *testing.T) scheduling.Body {
			task := w.newReminder(t)
			w.exec(t, `UPDATE reminders SET due_at = now() - interval '1 hour' WHERE id = $1`, task.ReminderID)
			return task
		}, 0},
		"a later nag": {func(w *world, t *testing.T) scheduling.Body { return w.brokenNag(t) }, 1},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			w := setup(t)
			task := c.arrange(w, t)
			// The instance claimed it, and died. Its task is used up.
			w.exec(t, `UPDATE reminders SET status = 'sending', claimed_at = now() - interval '6 minutes' WHERE id = $1`, task.ReminderID)
			before := len(w.pushes.Sent())

			stats, err := w.fire.Sweep(ctx)
			if err != nil {
				t.Fatal(err)
			}
			if stats != (dispatch.SweepStats{Released: 1, Rebooked: 1, Finished: true}) {
				t.Fatalf("stats = %+v, want 1 released and 1 rebooked", stats)
			}
			rebooked := w.lastTask(t)
			if rebooked.N != c.wantN || rebooked.Version == task.Version {
				t.Errorf("task = %+v, want push %d under a new version (was %d)", rebooked, c.wantN, task.Version)
			}
			if err := w.fire.Fire(ctx, body(rebooked)); err != nil {
				t.Fatal(err)
			}
			if got := len(w.pushes.Sent()) - before; got != 1 {
				t.Errorf("%d pushes after the sweep, want 1", got)
			}
			if r := w.get(t, task.ReminderID); r.NagCount != c.wantN+1 || r.Status != reminders.StatusSent || r.NextNagAt == nil {
				t.Errorf("after the push: %+v, want it counted and nagging on", r)
			}
			// The old task, if it turns up after all, does nothing.
			if err := w.fire.Fire(ctx, task); err != nil || len(w.pushes.Sent())-before != 1 {
				t.Errorf("old task: %v, %d pushes, want no more", err, len(w.pushes.Sent())-before)
			}
		})
	}
}

// Overlapping runs are harmless (design doc 3.4): the second moves the version, so only its task
// works.
func TestTwoSweepsInARowStillPushOnce(t *testing.T) {
	w := setup(t)
	w.lostFirst(t)

	for range 2 {
		if _, err := w.fire.Sweep(ctx); err != nil {
			t.Fatal(err)
		}
	}
	tasks := w.nags.Tasks()
	if len(tasks) != 2 {
		t.Fatalf("%d tasks, want 2", len(tasks))
	}
	for _, task := range tasks {
		if err := w.fire.Fire(ctx, body(task)); err != nil {
			t.Fatal(err)
		}
	}
	if n := len(w.pushes.Sent()); n != 1 {
		t.Errorf("%d pushes, want 1", n)
	}
}

func TestSweepLeavesASendThatMayStillBeRunning(t *testing.T) {
	w := setup(t)
	task := w.lostFirst(t)
	w.exec(t, `UPDATE reminders SET status = 'sending', claimed_at = now() - interval '4 minutes' WHERE id = $1`, task.ReminderID)

	stats, err := w.fire.Sweep(ctx)
	if err != nil || stats != (dispatch.SweepStats{Finished: true}) {
		t.Errorf("sweep: %+v, %v; want nothing done", stats, err)
	}
	if r := w.get(t, task.ReminderID); r.Status != reminders.StatusSending {
		t.Errorf("status = %s, want still sending", r.Status)
	}
}

func TestSweepRebooksALostFirstPush(t *testing.T) {
	w := setup(t)
	task := w.lostFirst(t)
	recent := w.newReminder(t) // due now: its task may just be on its way

	stats, err := w.fire.Sweep(ctx)
	if err != nil || stats != (dispatch.SweepStats{Rebooked: 1, Finished: true}) {
		t.Fatalf("sweep: %+v, %v; want 1 rebooked", stats, err)
	}
	r := w.get(t, task.ReminderID)
	got := w.lastTask(t)
	if got.ReminderID != task.ReminderID || got.N != 0 || got.Version != r.ScheduleVersion || r.ScheduleVersion == task.Version {
		t.Errorf("task = %+v, reminder version %d (was %d), want push 0 of a new version", got, r.ScheduleVersion, task.Version)
	}
	if v := w.enqueuedVersion(t, task.ReminderID); v == nil || *v != r.ScheduleVersion {
		t.Errorf("enqueued_version = %v, want %d", v, r.ScheduleVersion)
	}
	if v := w.get(t, recent.ReminderID).ScheduleVersion; v != recent.Version {
		t.Errorf("a reminder due just now moved to version %d", v)
	}
}

func TestSweepRestartsABrokenNagChain(t *testing.T) {
	w := setup(t)
	task := w.brokenNag(t)
	onTime := w.newReminder(t)
	if err := w.fire.Fire(ctx, onTime); err != nil { // next nag in 30 minutes
		t.Fatal(err)
	}
	booked := len(w.nags.Tasks())

	stats, err := w.fire.Sweep(ctx)
	if err != nil || stats != (dispatch.SweepStats{Rebooked: 1, Finished: true}) {
		t.Fatalf("sweep: %+v, %v; want 1 rebooked", stats, err)
	}
	if n := len(w.nags.Tasks()); n != booked+1 {
		t.Fatalf("%d tasks booked, want 1", n-booked)
	}
	got := w.lastTask(t)
	r := w.get(t, task.ReminderID)
	if got.ReminderID != task.ReminderID || got.N != 1 || got.Version != r.ScheduleVersion || got.Version == task.Version {
		t.Errorf("task = %+v, want push 1 of a new version", got)
	}
	if r.NagCount != 1 || time.Until(got.At) > time.Minute {
		t.Errorf("nag count %d, task at %v; want the count kept, and booked for now", r.NagCount, got.At)
	}
}

func TestSweepLeavesDoneAndOverdueReminders(t *testing.T) {
	w := setup(t)
	done := w.brokenNag(t)
	if _, err := w.reminders.MarkDone(ctx, w.user, done.ReminderID); err != nil {
		t.Fatal(err)
	}
	overdue := w.brokenNag(t)
	w.exec(t, `UPDATE reminders SET nag_count = 12, next_nag_at = NULL WHERE id = $1`, overdue.ReminderID)

	stats, err := w.fire.Sweep(ctx)
	if err != nil || stats != (dispatch.SweepStats{Finished: true}) {
		t.Errorf("sweep: %+v, %v; want nothing done", stats, err)
	}
}

func TestDoneDuringTheSweepWins(t *testing.T) {
	w := setup(t)
	first, second := w.brokenNag(t), w.brokenNag(t)
	// Time order decides which is booked first: this one, and Done arrives for the other meanwhile.
	w.exec(t, `UPDATE reminders SET next_nag_at = now() - interval '2 hours' WHERE id = $1`, first.ReminderID)
	sched := &hookScheduler{before: func(scheduling.Task) error {
		_, err := w.reminders.MarkDone(ctx, w.user, second.ReminderID)
		return err
	}}

	stats, err := w.sweeper(sched).Sweep(ctx)
	if err != nil || stats != (dispatch.SweepStats{Rebooked: 1, Superseded: 1, Finished: true}) {
		t.Errorf("sweep: %+v, %v; want 1 rebooked, 1 superseded", stats, err)
	}
	if n := len(sched.Tasks()); n != 1 {
		t.Errorf("%d tasks, want 1", n)
	}
}

func TestAChangeDuringTheSweepWins(t *testing.T) {
	cases := map[string]struct {
		arrange func(*world, *testing.T) scheduling.Body
		change  func(*world, string) error
	}{
		"Done on a first push": {func(w *world, t *testing.T) scheduling.Body { return w.lostFirst(t) }, func(w *world, id string) error {
			_, err := w.reminders.MarkDone(ctx, w.user, id)
			return err
		}},
		"a move of a first push": {func(w *world, t *testing.T) scheduling.Body { return w.lostFirst(t) }, func(w *world, id string) error {
			_, err := w.reminders.Update(ctx, w.user, id, reminders.UpdateInput{DueAt: ptr(time.Now().Add(time.Hour))})
			return err
		}},
		"a move of a nag": {func(w *world, t *testing.T) scheduling.Body { return w.brokenNag(t) }, func(w *world, id string) error {
			_, err := w.reminders.Update(ctx, w.user, id, reminders.UpdateInput{DueAt: ptr(time.Now().Add(time.Hour))})
			return err
		}},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			w := setup(t)
			first, second := c.arrange(w, t), c.arrange(w, t)
			// Time order decides which is booked first: this one, and the change hits the other.
			for _, q := range []string{`due_at`, `next_nag_at`} {
				w.exec(t, `UPDATE reminders SET `+q+` = now() - interval '2 hours' WHERE id = $1 AND `+q+` IS NOT NULL`, first.ReminderID)
			}
			sched := &hookScheduler{before: func(scheduling.Task) error { return c.change(w, second.ReminderID) }}

			stats, err := w.sweeper(sched).Sweep(ctx)
			if err != nil || stats.Rebooked != 1 || stats.Superseded != 1 {
				t.Fatalf("sweep: %+v, %v; want 1 rebooked, 1 superseded", stats, err)
			}
			tasks := sched.Tasks()
			if len(tasks) != 1 || tasks[0].ReminderID != first.ReminderID {
				t.Errorf("tasks = %+v, want only the first reminder's", tasks)
			}
		})
	}
}

func TestMovingAReminderStartsTheCountOver(t *testing.T) {
	w := setup(t)
	task := w.lostFirst(t)
	for range 3 {
		if _, err := w.fire.Sweep(ctx); err != nil {
			t.Fatal(err)
		}
	}
	if stats, err := w.fire.Sweep(ctx); err != nil || stats.GaveUp != 1 {
		t.Fatalf("sweep: %+v, %v; want it given up", stats, err)
	}

	// The user sees it Overdue and moves it. Its new first push gets lost too.
	if _, err := w.reminders.Update(ctx, w.user, task.ReminderID, reminders.UpdateInput{DueAt: ptr(time.Now().Add(time.Hour))}); err != nil {
		t.Fatal(err)
	}
	w.exec(t, `UPDATE reminders SET due_at = now() - interval '1 hour' WHERE id = $1`, task.ReminderID)

	if stats, err := w.fire.Sweep(ctx); err != nil || stats.Rebooked != 1 || stats.GaveUp != 0 {
		t.Errorf("sweep: %+v, %v; want it rebooked, not given up", stats, err)
	}
}

func TestACloudTasksOutageIsTriedAgainAndDoesNotCount(t *testing.T) {
	w := setup(t)
	lost, broken := w.lostFirst(t), w.brokenNag(t)
	down := true
	sched := &hookScheduler{before: func(scheduling.Task) error {
		if down {
			return errors.New("unavailable")
		}
		return nil
	}}

	// Longer than giving up takes: an outage says nothing about these reminders.
	for day := range 5 {
		stats, err := w.sweeper(sched).Sweep(ctx)
		// On the first day the first push fails twice: rebooking, then step b's second try.
		if err != nil || stats.Failed < 2 || stats.GaveUp != 0 {
			t.Fatalf("day %d: %+v, %v; want both failed, none given up", day, stats, err)
		}
		w.breakChain(t, broken.ReminderID)
	}
	if !strings.Contains(w.logs.String(), `"severity":"ERROR"`) {
		t.Errorf("a sweep with failures should log at ERROR: %s", w.logs)
	}

	down = false
	stats, err := w.sweeper(sched).Sweep(ctx)
	if err != nil || stats.Booked != 1 || stats.Rebooked != 1 || stats.Failed != 0 {
		t.Fatalf("after the outage: %+v, %v; want the first push booked and the nag rebooked", stats, err)
	}
	if r := w.get(t, lost.ReminderID); w.enqueuedVersion(t, lost.ReminderID) == nil || *w.enqueuedVersion(t, lost.ReminderID) != r.ScheduleVersion {
		t.Error("the first push should be marked booked under its current version")
	}
}

func TestSweepGivesUpOnAPushThatNeverGoesOut(t *testing.T) {
	cases := map[string]func(*world, *testing.T) (string, func()){
		"a first push": func(w *world, t *testing.T) (string, func()) {
			task := w.lostFirst(t)
			return task.ReminderID, func() {}
		},
		"a later nag": func(w *world, t *testing.T) (string, func()) {
			task := w.brokenNag(t)
			return task.ReminderID, func() { w.breakChain(t, task.ReminderID) }
		},
	}
	for name, arrange := range cases {
		t.Run(name, func(t *testing.T) {
			w := setup(t)
			id, nextDay := arrange(w, t)

			for day := range 3 {
				stats, err := w.fire.Sweep(ctx)
				if err != nil || stats.Rebooked != 1 || stats.GaveUp != 0 {
					t.Fatalf("day %d: %+v, %v; want it rebooked", day, stats, err)
				}
				nextDay() // the task fired, and the push still didn't go out
			}
			booked := len(w.nags.Tasks())

			stats, err := w.fire.Sweep(ctx)
			if err != nil || stats != (dispatch.SweepStats{GaveUp: 1, Finished: true}) {
				t.Fatalf("day 3: %+v, %v; want it given up", stats, err)
			}
			if n := len(w.nags.Tasks()); n != booked {
				t.Errorf("%d more tasks, want none", n-booked)
			}
			r := w.get(t, id)
			if r.Status != reminders.StatusSent || r.NagCount != reminders.MaxPushes || r.NextNagAt != nil {
				t.Errorf("reminder = %+v, want Overdue", r)
			}
			if events := w.events(t, id); events[len(events)-1] != "sweep_gave_up" {
				t.Errorf("events = %v, want it to end with sweep_gave_up", events)
			}
			if !strings.Contains(w.logs.String(), `"severity":"ERROR"`) {
				t.Errorf("giving up should log at ERROR: %s", w.logs)
			}

			stats, err = w.fire.Sweep(ctx)
			if err != nil || stats != (dispatch.SweepStats{Finished: true}) {
				t.Errorf("the day after: %+v, %v; want nothing done", stats, err)
			}
		})
	}
}

func TestOnlyRecentRebookingsOfTheSamePushCount(t *testing.T) {
	w := setup(t)
	task := w.brokenNag(t)
	note := func(n int, age string) {
		w.exec(t, `INSERT INTO reminder_events (reminder_id, type, detail, created_at)
			VALUES ($1, 'sweep_rebooked', jsonb_build_object('n', $2::int), now() - $3::interval)`, task.ReminderID, n, age)
	}
	// Three, but of an earlier push (it went out in the end), or long ago.
	note(0, "1 day")
	note(0, "2 days")
	note(1, "5 days")
	note(1, "1 day")
	note(1, "2 days")

	stats, err := w.fire.Sweep(ctx)
	if err != nil || stats != (dispatch.SweepStats{Rebooked: 1, Finished: true}) {
		t.Errorf("sweep: %+v, %v; want it rebooked", stats, err)
	}
}
