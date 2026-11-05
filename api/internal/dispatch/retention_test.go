package dispatch_test

import (
	"strings"
	"testing"
	"time"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/dispatch"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/users"
)

// existsIn holds one query per table: SQL is never built from strings (api/AGENTS.md).
var existsIn = map[string]string{
	"reminders":          `SELECT EXISTS (SELECT 1 FROM reminders WHERE id::text = $1)`,
	"reminder_events":    `SELECT EXISTS (SELECT 1 FROM reminder_events WHERE id::text = $1)`,
	"push_subscriptions": `SELECT EXISTS (SELECT 1 FROM push_subscriptions WHERE id::text = $1)`,
}

func (w *world) exists(t *testing.T, table, id string) bool {
	t.Helper()
	var found bool
	if err := w.pool.QueryRow(ctx, existsIn[table], id).Scan(&found); err != nil {
		t.Fatal(err)
	}
	return found
}

// doneAgo is a reminder marked done that long ago.
func (w *world) doneAgo(t *testing.T, age string) string {
	t.Helper()
	id := w.newReminder(t).ReminderID
	w.exec(t, `UPDATE reminders SET status = 'done', done_at = now() - $2::interval WHERE id = $1`, id, age)
	return id
}

func (w *world) eventAgo(t *testing.T, reminderID, age string) string {
	t.Helper()
	var id string
	err := w.pool.QueryRow(ctx, `INSERT INTO reminder_events (reminder_id, type, created_at)
		VALUES ($1, 'sent', now() - $2::interval) RETURNING id::text`, reminderID, age).Scan(&id)
	if err != nil {
		t.Fatal(err)
	}
	return id
}

// deviceSeenAgo is another user's phone, last seen that long ago. It returns the device and user.
func (w *world) deviceSeenAgo(t *testing.T, name, age string) (string, string) {
	t.Helper()
	u, err := users.NewRepo(w.pool).FindOrCreate(ctx, "uid-"+name, name+"@example.com")
	if err != nil {
		t.Fatal(err)
	}
	var id string
	err = w.pool.QueryRow(ctx, `INSERT INTO push_subscriptions (user_id, fcm_token, platform, last_seen_at)
		VALUES ($1, $2, 'ios', now() - $3::interval) RETURNING id::text`, u.ID, "token-"+name, age).Scan(&id)
	if err != nil {
		t.Fatal(err)
	}
	return id, u.ID
}

func TestSweepDeletesWhatIsPastItsTime(t *testing.T) {
	w := setup(t)
	oldDone := w.doneAgo(t, "181 days")
	oldDoneEvent := w.eventAgo(t, oldDone, "1 day") // a recent event goes with its reminder
	keptDone := w.doneAgo(t, "179 days")
	active := w.newReminder(t).ReminderID // never done, so it stays however old it is
	w.exec(t, `UPDATE reminders SET created_at = now() - interval '2 years', due_at = now() + interval '1 hour' WHERE id = $1`, active)
	oldEvent := w.eventAgo(t, active, "91 days")
	keptEvent := w.eventAgo(t, active, "89 days")
	oldDevice, _ := w.deviceSeenAgo(t, "bob", "271 days")
	keptDevice, _ := w.deviceSeenAgo(t, "carol", "269 days")

	stats, err := w.fire.Sweep(ctx)
	if err != nil || !stats.Finished {
		t.Fatalf("sweep: %+v, %v", stats, err)
	}
	if stats.Deleted != 3 { // the done reminder, the old event, the old device
		t.Errorf("deleted %d rows, want 3", stats.Deleted)
	}
	for _, gone := range []struct{ table, id string }{
		{"reminders", oldDone}, {"reminder_events", oldDoneEvent}, {"reminder_events", oldEvent}, {"push_subscriptions", oldDevice},
	} {
		if w.exists(t, gone.table, gone.id) {
			t.Errorf("%s %s should be gone", gone.table, gone.id)
		}
	}
	for _, kept := range []struct{ table, id string }{
		{"reminders", keptDone}, {"reminders", active}, {"reminder_events", keptEvent}, {"push_subscriptions", keptDevice},
	} {
		if !w.exists(t, kept.table, kept.id) {
			t.Errorf("%s %s should still be there", kept.table, kept.id)
		}
	}
	if !strings.Contains(w.logs.String(), `"deleted":3`) {
		t.Errorf("log has no deleted count: %s", w.logs)
	}
}

// Decision 77: a reminder a year ahead must still reach a user who hasn't opened the app since.
func TestAnOldDeviceStaysWhileItsUserHasAPushToCome(t *testing.T) {
	w := setup(t)
	reminder := func(user, status string, nags int, nextNag *time.Time) {
		w.exec(t, `INSERT INTO reminders (user_id, title, due_at, status, nag_count, next_nag_at)
			VALUES ($1, 'x', now() + interval '1 hour', $2::reminder_status, $3, $4)`, user, status, nags, nextNag)
	}
	waiting, waitingUser := w.deviceSeenAgo(t, "bob", "300 days")
	reminder(waitingUser, "pending", 0, nil)
	nagging, naggingUser := w.deviceSeenAgo(t, "carol", "300 days")
	reminder(naggingUser, "sent", 1, ptr(time.Now().Add(time.Hour)))
	overdue, overdueUser := w.deviceSeenAgo(t, "dan", "300 days")
	reminder(overdueUser, "sent", 12, nil) // no more pushes to come

	if _, err := w.fire.Sweep(ctx); err != nil {
		t.Fatal(err)
	}
	if !w.exists(t, "push_subscriptions", waiting) || !w.exists(t, "push_subscriptions", nagging) {
		t.Error("a device with a push to come should stay")
	}
	if w.exists(t, "push_subscriptions", overdue) {
		t.Error("an old device with no push to come should go")
	}
}

func TestAFailedCleanupOnlyCountsAndTheOthersStillRun(t *testing.T) {
	w := setup(t)
	oldDone := w.doneAgo(t, "181 days")
	oldDevice, _ := w.deviceSeenAgo(t, "bob", "271 days")
	w.exec(t, `ALTER TABLE reminder_events RENAME TO reminder_events_away`)

	stats, err := w.fire.Sweep(ctx)
	if err != nil || stats != (dispatch.SweepStats{Deleted: 2, Failed: 1, Finished: true}) {
		t.Errorf("sweep: %+v, %v; want 2 deleted, 1 failed, no error", stats, err)
	}
	if w.exists(t, "reminders", oldDone) || w.exists(t, "push_subscriptions", oldDevice) {
		t.Error("the other cleanups should still run")
	}
	if !strings.Contains(w.logs.String(), `"severity":"ERROR"`) {
		t.Errorf("a failed cleanup should show at ERROR in the summary: %s", w.logs)
	}
}
