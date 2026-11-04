package reminders_test

import (
	"bytes"
	"context"
	"errors"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/dbtest"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/logging"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/reminders"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/scheduling"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/users"
)

func ptr[T any](v T) *T { return &v }

var ctx = context.Background()

// setup starts a database with one user (default nag interval 60) and returns the
// service, the pool and the user's id.
func setup(t *testing.T) (*reminders.Service, *pgxpool.Pool, string) {
	t.Helper()
	s, _, pool, user := setupWithTasks(t)
	return s, pool, user
}

// setupWithTasks also returns the fake Cloud Tasks, to see or break the scheduling.
func setupWithTasks(t *testing.T) (*reminders.Service, *scheduling.Fake, *pgxpool.Pool, string) {
	t.Helper()
	pool := dbtest.Start(t)
	tasks := &scheduling.Fake{}
	return reminders.NewService(pool, tasks, logging.New(io.Discard)), tasks, pool, newUser(t, pool, "uid-a")
}

func newUser(t *testing.T, pool *pgxpool.Pool, uid string) string {
	t.Helper()
	u, err := users.NewRepo(pool).FindOrCreate(ctx, uid, uid+"@example.com")
	if err != nil {
		t.Fatal(err)
	}
	return u.ID
}

func in(hours int) time.Time {
	return time.Now().Add(time.Duration(hours) * time.Hour).Truncate(time.Second)
}

func create(t *testing.T, s *reminders.Service, userID, title string, due time.Time) reminders.Reminder {
	t.Helper()
	r, err := s.Create(ctx, userID, reminders.CreateInput{Title: title, DueAt: due})
	if err != nil {
		t.Fatalf("create %q: %v", title, err)
	}
	return r
}

func isValidation(err error) bool {
	var v reminders.ValidationError
	return errors.As(err, &v)
}

func TestCreate(t *testing.T) {
	s, pool, user := setup(t)

	r, err := s.Create(ctx, user, reminders.CreateInput{Title: "  Pay rent  ", Note: ptr(" "), DueAt: in(2)})
	if err != nil {
		t.Fatal(err)
	}
	if r.Title != "Pay rent" || r.Note != nil {
		t.Errorf("title %q note %v, want trimmed title and no note", r.Title, r.Note)
	}
	if r.Status != reminders.StatusPending || r.NagCount != 0 || r.ScheduleVersion != 1 {
		t.Errorf("new reminder = %+v, want pending, 0 nags, version 1", r)
	}
	if r.NagIntervalMin != 60 {
		t.Errorf("nag interval %d, want the user's default 60", r.NagIntervalMin)
	}
	if r.NagsExhausted() {
		t.Error("a new reminder is not overdue")
	}

	var events int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM reminder_events WHERE reminder_id = $1 AND type = 'created'`, r.ID).Scan(&events); err != nil {
		t.Fatal(err)
	}
	if events != 1 {
		t.Errorf("%d 'created' events, want 1", events)
	}

	own, err := s.Create(ctx, user, reminders.CreateInput{Title: "Call mum", DueAt: in(3), NagIntervalMin: ptr(15)})
	if err != nil || own.NagIntervalMin != 15 {
		t.Errorf("own nag interval: %v %d, want 15", err, own.NagIntervalMin)
	}
}

func TestCreateRefusesBadValues(t *testing.T) {
	s, _, user := setup(t)
	cases := map[string]reminders.CreateInput{
		"empty title":       {Title: "   ", DueAt: in(1)},
		"title too long":    {Title: strings.Repeat("ä", 201), DueAt: in(1)},
		"due in the past":   {Title: "x", DueAt: in(-1)},
		"due over a year":   {Title: "x", DueAt: time.Now().AddDate(1, 0, 1)},
		"nag interval low":  {Title: "x", DueAt: in(1), NagIntervalMin: ptr(14)},
		"nag interval high": {Title: "x", DueAt: in(1), NagIntervalMin: ptr(1441)},
		"NUL in title":      {Title: "a\x00b", DueAt: in(1)},
		"NUL in note":       {Title: "x", Note: ptr("a\x00b"), DueAt: in(1)},
		"note too long":     {Title: "x", Note: ptr(strings.Repeat("ö", 201)), DueAt: in(1)},
	}
	for name, c := range cases {
		if _, err := s.Create(ctx, user, c); !isValidation(err) {
			t.Errorf("%s: got %v, want a ValidationError", name, err)
		}
	}
	// 200 characters (not bytes) is fine, for the title and the note.
	if _, err := s.Create(ctx, user, reminders.CreateInput{Title: strings.Repeat("ä", 200), Note: ptr(strings.Repeat("ö", 200)), DueAt: in(1)}); err != nil {
		t.Errorf("200 characters: %v", err)
	}
}

func TestFiveActiveAtMost(t *testing.T) {
	s, _, user := setup(t)
	var first reminders.Reminder
	for i := range reminders.MaxActive {
		r := create(t, s, user, "r", in(i+1))
		if i == 0 {
			first = r
		}
	}
	if _, err := s.Create(ctx, user, reminders.CreateInput{Title: "sixth", DueAt: in(9)}); !errors.Is(err, reminders.ErrLimitReached) {
		t.Fatalf("6th create: %v, want ErrLimitReached", err)
	}

	// Done ones don't count.
	if _, err := s.MarkDone(ctx, user, first.ID); err != nil {
		t.Fatal(err)
	}
	create(t, s, user, "sixth, after one is done", in(9))

	// Moving a done reminder to a new time makes it active again: the limit applies.
	if _, err := s.Update(ctx, user, first.ID, reminders.UpdateInput{DueAt: ptr(in(20))}); !errors.Is(err, reminders.ErrLimitReached) {
		t.Errorf("reactivate at the limit: %v, want ErrLimitReached", err)
	}
	// Editing only its title is fine: it stays done.
	if r, err := s.Update(ctx, user, first.ID, reminders.UpdateInput{Title: ptr("renamed")}); err != nil || r.Status != reminders.StatusDone {
		t.Errorf("rename a done reminder: %v %s, want ok and still done", err, r.Status)
	}
}

// Design doc test: creates at the same moment with 4 active -> exactly one succeeds.
// Ten at once, so a missing lock really shows (two rarely collide).
func TestConcurrentCreatesCannotPassTheLimit(t *testing.T) {
	s, _, user := setup(t)
	for i := range reminders.MaxActive - 1 {
		create(t, s, user, "r", in(i+1))
	}

	errs := make([]error, 10)
	var wg sync.WaitGroup
	for i := range errs {
		wg.Go(func() {
			_, errs[i] = s.Create(ctx, user, reminders.CreateInput{Title: "race", DueAt: in(9)})
		})
	}
	wg.Wait()

	ok, limited := 0, 0
	for _, err := range errs {
		switch {
		case err == nil:
			ok++
		case errors.Is(err, reminders.ErrLimitReached):
			limited++
		default:
			t.Errorf("unexpected error: %v", err)
		}
	}
	if ok != 1 || limited != len(errs)-1 {
		t.Errorf("%d created, %d refused; want exactly 1 created", ok, limited)
	}
}

func TestOtherUsersRemindersDontExist(t *testing.T) {
	s, pool, alice := setup(t)
	bob := newUser(t, pool, "uid-b")
	r := create(t, s, alice, "Alice's", in(1))

	if _, err := s.Get(ctx, bob, r.ID); !errors.Is(err, reminders.ErrNotFound) {
		t.Errorf("get: %v, want ErrNotFound", err)
	}
	if _, err := s.Update(ctx, bob, r.ID, reminders.UpdateInput{Title: ptr("mine now")}); !errors.Is(err, reminders.ErrNotFound) {
		t.Errorf("update: %v, want ErrNotFound", err)
	}
	if _, err := s.MarkDone(ctx, bob, r.ID); !errors.Is(err, reminders.ErrNotFound) {
		t.Errorf("done: %v, want ErrNotFound", err)
	}
	if err := s.Delete(ctx, bob, r.ID); !errors.Is(err, reminders.ErrNotFound) {
		t.Errorf("delete: %v, want ErrNotFound", err)
	}
	if page, err := s.List(ctx, bob, reminders.ListInput{}); err != nil || len(page.Items) != 0 {
		t.Errorf("list: %v %d items, want none", err, len(page.Items))
	}
	// Still Alice's, unchanged.
	if got, err := s.Get(ctx, alice, r.ID); err != nil || got.Title != "Alice's" || got.Status != reminders.StatusPending {
		t.Errorf("alice's reminder after bob's attempts = %+v, %v", got, err)
	}
}

func TestNotAnIDIsNotFound(t *testing.T) {
	s, _, user := setup(t)
	if _, err := s.Get(ctx, user, "not-a-uuid"); !errors.Is(err, reminders.ErrNotFound) {
		t.Errorf("got %v, want ErrNotFound", err)
	}
}

func TestUpdate(t *testing.T) {
	s, _, user := setup(t)
	r, err := s.Create(ctx, user, reminders.CreateInput{Title: "Dentist", Note: ptr("bring card"), DueAt: in(2)})
	if err != nil {
		t.Fatal(err)
	}

	// Title only: the cycle goes on (same version), the note stays.
	u, err := s.Update(ctx, user, r.ID, reminders.UpdateInput{Title: ptr("Dentist 14:00"), NagIntervalMin: ptr(30)})
	if err != nil {
		t.Fatal(err)
	}
	if u.Title != "Dentist 14:00" || u.NagIntervalMin != 30 || u.Note == nil || *u.Note != "bring card" || u.ScheduleVersion != 1 {
		t.Errorf("after a title edit = %+v", u)
	}
	if !u.UpdatedAt.After(r.UpdatedAt) && !u.UpdatedAt.Equal(r.UpdatedAt) {
		t.Error("updatedAt went backwards")
	}

	// The same dueAt again is not a move.
	if u, err = s.Update(ctx, user, r.ID, reminders.UpdateInput{DueAt: ptr(r.DueAt)}); err != nil || u.ScheduleVersion != 1 {
		t.Errorf("same dueAt: %v, version %d, want 1", err, u.ScheduleVersion)
	}

	// Clear the note (null), leave the rest.
	if u, err = s.Update(ctx, user, r.ID, reminders.UpdateInput{NoteSet: true}); err != nil || u.Note != nil {
		t.Errorf("clear note: %v %v", err, u.Note)
	}

	// A new dueAt restarts the cycle.
	if u, err = s.Update(ctx, user, r.ID, reminders.UpdateInput{DueAt: ptr(in(5))}); err != nil {
		t.Fatal(err)
	}
	if !u.DueAt.Equal(in(5)) || u.ScheduleVersion <= r.ScheduleVersion || u.Status != reminders.StatusPending || u.NagCount != 0 {
		t.Errorf("after moving dueAt = %+v, want a new version, pending, 0 nags", u)
	}

	if _, err := s.Update(ctx, user, r.ID, reminders.UpdateInput{DueAt: ptr(in(-2))}); !isValidation(err) {
		t.Errorf("move into the past: %v, want a ValidationError", err)
	}
	if _, err := s.Update(ctx, user, r.ID, reminders.UpdateInput{Title: ptr("")}); !isValidation(err) {
		t.Errorf("empty title: %v, want a ValidationError", err)
	}
	if _, err := s.Update(ctx, user, r.ID, reminders.UpdateInput{NoteSet: true, Note: ptr(strings.Repeat("ö", 201))}); !isValidation(err) {
		t.Errorf("note of 201 characters: %v, want a ValidationError", err)
	}
}

func TestUpdateRestartsANaggingReminder(t *testing.T) {
	s, pool, user := setup(t)
	r := create(t, s, user, "Pills", in(1))
	// Pretend M4 already sent all 12 pushes: Overdue.
	if _, err := pool.Exec(ctx, `UPDATE reminders SET status = 'sent', nag_count = 12, next_nag_at = NULL, sent_at = now() WHERE id = $1`, r.ID); err != nil {
		t.Fatal(err)
	}
	overdue, _ := s.Get(ctx, user, r.ID)
	if !overdue.NagsExhausted() {
		t.Fatalf("%+v should be overdue", overdue)
	}

	u, err := s.Update(ctx, user, r.ID, reminders.UpdateInput{DueAt: ptr(in(3))})
	if err != nil {
		t.Fatal(err)
	}
	if u.Status != reminders.StatusPending || u.NagCount != 0 || u.ScheduleVersion <= r.ScheduleVersion || u.NagsExhausted() {
		t.Errorf("after reschedule = %+v, want a fresh pending cycle", u)
	}
}

func TestMarkDone(t *testing.T) {
	s, pool, user := setup(t)
	r := create(t, s, user, "Water plants", in(1))

	done, err := s.MarkDone(ctx, user, r.ID)
	if err != nil {
		t.Fatal(err)
	}
	if done.Status != reminders.StatusDone || done.DoneAt == nil || done.NextNagAt != nil {
		t.Errorf("done = %+v", done)
	}

	again, err := s.MarkDone(ctx, user, r.ID)
	if err != nil || !again.DoneAt.Equal(*done.DoneAt) {
		t.Errorf("second Done: %v, doneAt %v, want unchanged %v", err, again.DoneAt, done.DoneAt)
	}
	var events int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM reminder_events WHERE reminder_id = $1 AND type = 'done'`, r.ID).Scan(&events)
	if events != 1 {
		t.Errorf("%d 'done' events after two Dones, want 1", events)
	}

	// Moving a done reminder makes it active again.
	u, err := s.Update(ctx, user, r.ID, reminders.UpdateInput{DueAt: ptr(in(4))})
	if err != nil || u.Status != reminders.StatusPending || u.DoneAt != nil {
		t.Errorf("reschedule after done: %v %+v, want pending, no doneAt", err, u)
	}
}

func TestMarkDonePicksADoneLineOnce(t *testing.T) {
	s, pool, user := setup(t)
	r := create(t, s, user, "Water plants", in(1))
	if r.Line != nil {
		t.Errorf("a new reminder has line %q, want none", *r.Line)
	}

	done, err := s.MarkDone(ctx, user, r.ID)
	if err != nil {
		t.Fatal(err)
	}
	if done.Line == nil {
		t.Fatal("no done line")
	}
	var level, seen int
	if err := pool.QueryRow(ctx,
		`SELECT m.level, count(s.message_id) FROM nag_messages m
		 LEFT JOIN user_seen_messages s ON s.message_id = m.id AND s.user_id = $2
		 WHERE m.text = $1 GROUP BY m.level`, *done.Line, user).Scan(&level, &seen); err != nil {
		t.Fatal(err)
	}
	if level != 5 || seen != 1 {
		t.Errorf("done line: level %d, seen %d times, want level 5, seen once", level, seen)
	}

	again, err := s.MarkDone(ctx, user, r.ID)
	if err != nil || again.Line == nil || *again.Line != *done.Line {
		t.Errorf("second Done: %v, line %v, want %q again", err, again.Line, *done.Line)
	}
	var seenLines int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM user_seen_messages WHERE user_id = $1`, user).Scan(&seenLines)
	if seenLines != 1 {
		t.Errorf("%d lines seen after two Dones, want 1", seenLines)
	}

	// A new time starts over: the old line belongs to the last cycle.
	moved, err := s.Update(ctx, user, r.ID, reminders.UpdateInput{DueAt: ptr(in(4))})
	if err != nil || moved.Line != nil {
		t.Errorf("after moving: %v, line %v, want none", err, moved.Line)
	}
}

func TestDoneNeverRepeatsALineUntilAllAreSeen(t *testing.T) {
	s, pool, user := setup(t)
	if _, err := pool.Exec(ctx, `UPDATE nag_messages SET active = false WHERE level = 5 AND id NOT IN (3694, 3695)`); err != nil {
		t.Fatal(err)
	}
	lines := map[string]bool{}
	for range 2 {
		done, err := s.MarkDone(ctx, user, create(t, s, user, "Bin day", in(1)).ID)
		if err != nil || done.Line == nil {
			t.Fatalf("done: %v, line %v", err, done.Line)
		}
		lines[*done.Line] = true
	}
	if len(lines) != 2 {
		t.Errorf("got %v, want 2 different lines", lines)
	}
	if done, err := s.MarkDone(ctx, user, create(t, s, user, "Bin day", in(1)).ID); err != nil || done.Line == nil {
		t.Errorf("all seen: %v, line %v, want the level to start over", err, done.Line)
	}
}

func TestDoneWithoutLinesHasNoLine(t *testing.T) {
	s, pool, user := setup(t)
	if _, err := pool.Exec(ctx, `DELETE FROM nag_messages`); err != nil {
		t.Fatal(err)
	}
	done, err := s.MarkDone(ctx, user, create(t, s, user, "Bin day", in(1)).ID)
	if err != nil || done.Status != reminders.StatusDone {
		t.Fatalf("done: %v, status %s", err, done.Status)
	}
	if done.Line != nil {
		t.Errorf("line %q, want none: the fallback line is a nag, not a done line", *done.Line)
	}
}

func TestALineProblemCantStopDone(t *testing.T) {
	_, _, pool, user := setupWithTasks(t)
	var logs bytes.Buffer
	s := reminders.NewService(pool, &scheduling.Fake{}, logging.New(&logs))
	r := create(t, s, user, "Bin day", in(1))
	if _, err := pool.Exec(ctx, `ALTER TABLE nag_messages RENAME TO gone`); err != nil {
		t.Fatal(err)
	}

	done, err := s.MarkDone(ctx, user, r.ID)
	if err != nil || done.Status != reminders.StatusDone || done.Line != nil {
		t.Fatalf("done: %v, status %s, line %v; want done, no line", err, done.Status, done.Line)
	}
	if !strings.Contains(logs.String(), "done line not picked") {
		t.Errorf("not logged: %s", logs.String())
	}
}

func TestMarkDoneFromAction(t *testing.T) {
	s, _, user := setup(t)
	r := create(t, s, user, "Bin day", in(1))

	done, err := s.MarkDoneFromAction(ctx, r.ID, r.ScheduleVersion)
	if err != nil || done.Status != reminders.StatusDone || done.Line == nil {
		t.Fatalf("done: %v, %+v", err, done)
	}
	again, err := s.MarkDoneFromAction(ctx, r.ID, r.ScheduleVersion)
	if err != nil || again.Line == nil || *again.Line != *done.Line {
		t.Errorf("second tap: %v, line %v, want %q again", err, again.Line, *done.Line)
	}

	if _, err := s.MarkDoneFromAction(ctx, "7f9c2a54-1111-4222-8333-444455556666", 1); !errors.Is(err, reminders.ErrNotFound) {
		t.Errorf("unknown reminder: %v, want ErrNotFound", err)
	}
	if _, err := s.MarkDoneFromAction(ctx, "not-a-uuid", 1); !errors.Is(err, reminders.ErrNotFound) {
		t.Errorf("bad id: %v, want ErrNotFound", err)
	}
}

func TestActionFromBeforeAnEditIsStale(t *testing.T) {
	s, _, user := setup(t)
	r := create(t, s, user, "Bin day", in(1))
	moved, err := s.Update(ctx, user, r.ID, reminders.UpdateInput{DueAt: ptr(in(4))})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := s.MarkDoneFromAction(ctx, r.ID, r.ScheduleVersion); !errors.Is(err, reminders.ErrActionStale) {
		t.Errorf("old version: %v, want ErrActionStale", err)
	}
	if got, _ := s.Get(ctx, user, r.ID); got.Status == reminders.StatusDone {
		t.Error("an old token marked it done")
	}

	// Already done in the app: the old button did what it asks for, so no error.
	if _, err := s.MarkDoneFromAction(ctx, r.ID, moved.ScheduleVersion); err != nil {
		t.Fatal(err)
	}
	if got, err := s.MarkDoneFromAction(ctx, r.ID, r.ScheduleVersion); err != nil || got.Status != reminders.StatusDone {
		t.Errorf("old token after done: %v, %s", err, got.Status)
	}
}

// The edit lands after the version check but before the UPDATE: the UPDATE itself must refuse.
func TestAnEditDuringAnActionWins(t *testing.T) {
	s, pool, user := setup(t)
	r := create(t, s, user, "Bin day", in(1))

	edit, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = edit.Rollback(ctx) }()
	if _, err := edit.Exec(ctx, `UPDATE reminders SET schedule_version = nextval('reminder_schedule_version_seq') WHERE id = $1`, r.ID); err != nil {
		t.Fatal(err)
	}

	result := make(chan error, 1)
	go func() {
		_, err := s.MarkDoneFromAction(ctx, r.ID, r.ScheduleVersion)
		result <- err
	}()
	// Wait until it's stuck on the edit's lock: it has passed the check and reached the UPDATE.
	deadline := time.Now().Add(10 * time.Second)
	for {
		var waiting int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock'`).Scan(&waiting); err != nil {
			t.Fatal(err)
		}
		if waiting > 0 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("the action never waited for the edit")
		}
		time.Sleep(20 * time.Millisecond)
	}
	if err := edit.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	if err := <-result; !errors.Is(err, reminders.ErrActionStale) {
		t.Errorf("got %v, want ErrActionStale", err)
	}
	if got, _ := s.Get(ctx, user, r.ID); got.Status == reminders.StatusDone {
		t.Error("the old token marked it done")
	}
}

func TestDelete(t *testing.T) {
	s, _, user := setup(t)
	r := create(t, s, user, "Bin day", in(1))
	if err := s.Delete(ctx, user, r.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Get(ctx, user, r.ID); !errors.Is(err, reminders.ErrNotFound) {
		t.Errorf("after delete: %v, want ErrNotFound", err)
	}
	if err := s.Delete(ctx, user, r.ID); !errors.Is(err, reminders.ErrNotFound) {
		t.Errorf("delete twice: %v, want ErrNotFound", err)
	}
}

func TestListPagesThroughUpcomingAndDone(t *testing.T) {
	s, _, user := setup(t)
	// 5 active (the limit), created out of order.
	var ids []string
	for _, h := range []int{5, 1, 4, 2, 3} {
		ids = append(ids, create(t, s, user, "r", in(h)).ID)
	}

	var got []time.Time
	cursor := ""
	for pages := 0; ; pages++ {
		page, err := s.List(ctx, user, reminders.ListInput{Limit: 2, Cursor: cursor})
		if err != nil {
			t.Fatal(err)
		}
		for _, r := range page.Items {
			got = append(got, r.DueAt)
		}
		if page.NextCursor == nil {
			if pages != 2 {
				t.Errorf("%d pages, want 3 (2+2+1)", pages+1)
			}
			break
		}
		cursor = *page.NextCursor
	}
	if len(got) != 5 {
		t.Fatalf("%d items over all pages, want 5", len(got))
	}
	for i := 1; i < len(got); i++ {
		if got[i].Before(got[i-1]) {
			t.Errorf("upcoming not soonest first: %v", got)
		}
	}

	// Done: most recently done first.
	for _, id := range ids[:3] {
		if _, err := s.MarkDone(ctx, user, id); err != nil {
			t.Fatal(err)
		}
	}
	done, err := s.List(ctx, user, reminders.ListInput{Status: "done", Limit: 2})
	if err != nil || len(done.Items) != 2 || done.NextCursor == nil {
		t.Fatalf("done page 1: %v, %d items", err, len(done.Items))
	}
	if done.Items[0].ID != ids[2] {
		t.Errorf("first done item %s, want the last one marked done %s", done.Items[0].ID, ids[2])
	}
	rest, err := s.List(ctx, user, reminders.ListInput{Status: "done", Limit: 2, Cursor: *done.NextCursor})
	if err != nil || len(rest.Items) != 1 || rest.Items[0].ID != ids[0] || rest.NextCursor != nil {
		t.Errorf("done page 2: %v %+v", err, rest)
	}

	upcoming, _ := s.List(ctx, user, reminders.ListInput{})
	if len(upcoming.Items) != 2 {
		t.Errorf("%d upcoming after 3 done, want 2", len(upcoming.Items))
	}
}

func TestListRefusesBadInput(t *testing.T) {
	s, _, user := setup(t)
	for name, in := range map[string]reminders.ListInput{
		"unknown status": {Status: "overdue"},
		"limit too big":  {Limit: 101},
		"negative limit": {Limit: -1},
		"made-up cursor": {Cursor: "abc"},
	} {
		if _, err := s.List(ctx, user, in); !isValidation(err) {
			t.Errorf("%s: %v, want a ValidationError", name, err)
		}
	}
}

// The limit check is safe only because Create locks the user's row first. Proof that
// doesn't depend on luck: while the test holds that lock, Create must wait.
func TestCreateWaitsForTheUsersLock(t *testing.T) {
	s, pool, user := setup(t)

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(ctx) }() // a failing test must not leave the lock held
	// FOR NO KEY UPDATE clashes with Create's FOR UPDATE, but not with the small lock
	// Postgres takes for the foreign key when a reminder is inserted. So only the
	// lock in lockUser can make Create wait here.
	if _, err := tx.Exec(ctx, `SELECT 1 FROM users WHERE id = $1 FOR NO KEY UPDATE`, user); err != nil {
		t.Fatal(err)
	}

	finished := make(chan error, 1)
	go func() {
		_, err := s.Create(ctx, user, reminders.CreateInput{Title: "waits", DueAt: in(1)})
		finished <- err
	}()

	select {
	case <-finished:
		t.Fatal("Create finished while another transaction held the user's lock")
	case <-time.After(300 * time.Millisecond):
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if err := <-finished; err != nil {
		t.Errorf("Create after the lock was released: %v", err)
	}
}

// A cursor only says where a page starts. Bob using Alice's cursor still sees only his own.
func TestCursorFromAnotherUserShowsNothingOfTheirs(t *testing.T) {
	s, pool, alice := setup(t)
	bob := newUser(t, pool, "uid-b")
	for i := range 3 {
		create(t, s, alice, "alice", in(i+1))
	}
	bobs := create(t, s, bob, "bob", in(10))

	page, err := s.List(ctx, alice, reminders.ListInput{Limit: 1})
	if err != nil || page.NextCursor == nil {
		t.Fatalf("alice page 1: %v", err)
	}
	theirs, err := s.List(ctx, bob, reminders.ListInput{Limit: 10, Cursor: *page.NextCursor})
	if err != nil {
		t.Fatal(err)
	}
	if len(theirs.Items) != 1 || theirs.Items[0].ID != bobs.ID {
		t.Errorf("bob with alice's cursor got %+v, want only his own reminder", theirs.Items)
	}
}

// enqueuedVersion is the schedule version that has its first task (NULL = none).
func enqueuedVersion(t *testing.T, pool *pgxpool.Pool, id string) *int {
	t.Helper()
	var v *int
	if err := pool.QueryRow(ctx, `SELECT enqueued_version FROM reminders WHERE id = $1`, id).Scan(&v); err != nil {
		t.Fatal(err)
	}
	return v
}

func TestCreateBooksTheFirstPush(t *testing.T) {
	s, tasks, pool, user := setupWithTasks(t)
	due := in(2)
	r := create(t, s, user, "Pay rent", due)

	want := scheduling.Task{ReminderID: r.ID, Version: r.ScheduleVersion, N: 0, At: due}
	if got := tasks.Tasks(); len(got) != 1 || got[0] != want {
		t.Errorf("tasks = %+v, want only %+v", got, want)
	}
	if v := enqueuedVersion(t, pool, r.ID); v == nil || *v != r.ScheduleVersion {
		t.Errorf("enqueued_version = %v, want %d", v, r.ScheduleVersion)
	}
}

func TestCreateFarAheadWaitsForTheSweep(t *testing.T) {
	s, tasks, pool, user := setupWithTasks(t)
	far := create(t, s, user, "Renew passport", in(26*24))
	if len(tasks.Tasks()) != 0 || enqueuedVersion(t, pool, far.ID) != nil {
		t.Errorf("26 days ahead: tasks %+v, want none (Cloud Tasks takes 30 days at most; the sweep books it)", tasks.Tasks())
	}
	near := create(t, s, user, "Book flights", in(24*24))
	if got := tasks.Tasks(); len(got) != 1 || got[0].ReminderID != near.ID {
		t.Errorf("24 days ahead: tasks %+v, want one for it", got)
	}
}

func TestCreateSavesNothingWhenSchedulingFails(t *testing.T) {
	s, tasks, pool, user := setupWithTasks(t)
	tasks.Fail(errors.New("cloud tasks is down"))

	if _, err := s.Create(ctx, user, reminders.CreateInput{Title: "Pay rent", DueAt: in(2)}); !errors.Is(err, reminders.ErrScheduleFailed) {
		t.Fatalf("err = %v, want ErrScheduleFailed", err)
	}
	var rows int
	if err := pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM reminders) + (SELECT count(*) FROM reminder_events)`).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 0 {
		t.Errorf("%d rows saved, want none (the app shows an error and the user tries again)", rows)
	}
}

func TestUpdateBooksTheNewVersion(t *testing.T) {
	s, tasks, pool, user := setupWithTasks(t)
	r := create(t, s, user, "Dentist", in(2))

	if _, err := s.Update(ctx, user, r.ID, reminders.UpdateInput{Title: ptr("Dentist 14:00")}); err != nil {
		t.Fatal(err)
	}
	if n := len(tasks.Tasks()); n != 1 {
		t.Errorf("a title edit booked %d tasks in total, want only the first one", n)
	}

	u, err := s.Update(ctx, user, r.ID, reminders.UpdateInput{DueAt: ptr(in(5))})
	if err != nil {
		t.Fatal(err)
	}
	want := scheduling.Task{ReminderID: r.ID, Version: u.ScheduleVersion, N: 0, At: in(5)}
	if got := tasks.Tasks(); len(got) != 2 || got[1] != want {
		t.Errorf("tasks = %+v, want the second to be %+v", got, want)
	}
	if v := enqueuedVersion(t, pool, r.ID); v == nil || *v != u.ScheduleVersion {
		t.Errorf("enqueued_version = %v, want %d", v, u.ScheduleVersion)
	}
}

// nagging pretends push 0 went out minutesAgo with a 24 h interval: Times bothered 1/12.
func nagging(t *testing.T, pool *pgxpool.Pool, id string, minutesAgo int) {
	t.Helper()
	if _, err := pool.Exec(ctx,
		`UPDATE reminders SET status = 'sent', nag_count = 1, nag_interval_min = 1440,
		   sent_at = now() - make_interval(mins => $2), next_nag_at = now() - make_interval(mins => $2) + interval '24 hours'
		 WHERE id = $1`, id, minutesAgo); err != nil {
		t.Fatal(err)
	}
}

func near(a, b time.Time) bool { return a.Sub(b).Abs() < 5*time.Second }

func TestNewIntervalMovesTheNextNag(t *testing.T) {
	s, tasks, pool, user := setupWithTasks(t)
	r := create(t, s, user, "Sing", in(1)) // then pretend it's nagging
	nagging(t, pool, r.ID, 5)

	// 24 h -> 15 min, 5 minutes after the last push: the next nag comes 10 minutes from now.
	u, err := s.Update(ctx, user, r.ID, reminders.UpdateInput{NagIntervalMin: ptr(15)})
	if err != nil {
		t.Fatal(err)
	}
	want := time.Now().Add(10 * time.Minute)
	if u.NextNagAt == nil || !near(*u.NextNagAt, want) {
		t.Fatalf("nextNagAt = %v, want about %v", u.NextNagAt, want)
	}
	if u.NagCount != 1 || u.Status != reminders.StatusSent || u.ScheduleVersion <= r.ScheduleVersion {
		t.Errorf("after the edit = %+v, want the count kept (1, sent) and a new version", u)
	}
	got := tasks.Tasks()
	last := got[len(got)-1]
	if len(got) != 2 || last.Version != u.ScheduleVersion || last.N != 1 || !last.At.Equal(*u.NextNagAt) {
		t.Errorf("tasks = %+v, want push 1 of v%d at %v", got, u.ScheduleVersion, *u.NextNagAt)
	}

	// The same interval again changes nothing.
	again, err := s.Update(ctx, user, r.ID, reminders.UpdateInput{NagIntervalMin: ptr(15)})
	if err != nil || again.ScheduleVersion != u.ScheduleVersion || len(tasks.Tasks()) != 2 {
		t.Errorf("same interval: %v, version %d (want %d), %d tasks (want 2)", err, again.ScheduleVersion, u.ScheduleVersion, len(tasks.Tasks()))
	}
}

func TestNewIntervalAlreadyPastWaitsTheNewInterval(t *testing.T) {
	s, tasks, pool, user := setupWithTasks(t)
	r := create(t, s, user, "Sing", in(1))
	nagging(t, pool, r.ID, 55) // last push 55 minutes ago: 15 min after it has passed

	u, err := s.Update(ctx, user, r.ID, reminders.UpdateInput{NagIntervalMin: ptr(15)})
	if err != nil {
		t.Fatal(err)
	}
	// Never right after the save: 15 minutes from now.
	if want := time.Now().Add(15 * time.Minute); u.NextNagAt == nil || !near(*u.NextNagAt, want) {
		t.Errorf("nextNagAt = %v, want about %v: last push + 15 min has passed", u.NextNagAt, want)
	}
	if got := tasks.Tasks(); len(got) != 2 || got[1].N != 1 {
		t.Errorf("tasks = %+v, want push 1 booked", got)
	}
}

func TestNewIntervalLeavesOtherStatesAlone(t *testing.T) {
	s, tasks, pool, user := setupWithTasks(t)
	waiting := create(t, s, user, "Waiting", in(1))
	overdue := create(t, s, user, "Overdue", in(1))
	sending := create(t, s, user, "Sending", in(1))
	if _, err := pool.Exec(ctx, `UPDATE reminders SET status = 'sent', nag_count = 12, next_nag_at = NULL, sent_at = now() WHERE id = $1`, overdue.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE reminders SET status = 'sending', nag_count = 1, claimed_at = now(), sent_at = now(), next_nag_at = now() WHERE id = $1`, sending.ID); err != nil {
		t.Fatal(err)
	}
	booked := len(tasks.Tasks())

	for _, r := range []reminders.Reminder{waiting, overdue, sending} {
		before, _ := s.Get(ctx, user, r.ID)
		u, err := s.Update(ctx, user, r.ID, reminders.UpdateInput{NagIntervalMin: ptr(15)})
		if err != nil {
			t.Fatal(err)
		}
		if u.NagIntervalMin != 15 || u.ScheduleVersion != before.ScheduleVersion || !sameTime(u.NextNagAt, before.NextNagAt) {
			t.Errorf("%s: %+v, want only the interval changed", r.Title, u)
		}
	}
	if n := len(tasks.Tasks()); n != booked {
		t.Errorf("%d new tasks, want none", n-booked)
	}
}

func TestNewIntervalSavesNothingWhenSchedulingFails(t *testing.T) {
	s, tasks, pool, user := setupWithTasks(t)
	r := create(t, s, user, "Sing", in(1))
	nagging(t, pool, r.ID, 5)
	before, _ := s.Get(ctx, user, r.ID)

	tasks.Fail(errors.New("deadline exceeded"))
	if _, err := s.Update(ctx, user, r.ID, reminders.UpdateInput{NagIntervalMin: ptr(15)}); !errors.Is(err, reminders.ErrScheduleFailed) {
		t.Fatalf("err = %v, want ErrScheduleFailed", err)
	}
	got, _ := s.Get(ctx, user, r.ID)
	if got.NagIntervalMin != 1440 || got.ScheduleVersion != before.ScheduleVersion || !sameTime(got.NextNagAt, before.NextNagAt) {
		t.Errorf("after a failed edit = %+v, want it unchanged", got)
	}
}

func sameTime(a, b *time.Time) bool {
	return (a == nil && b == nil) || (a != nil && b != nil && a.Equal(*b))
}

func TestUpdateFarAheadLeavesTheOldTaskBehind(t *testing.T) {
	s, tasks, pool, user := setupWithTasks(t)
	r := create(t, s, user, "Renew passport", in(2))

	u, err := s.Update(ctx, user, r.ID, reminders.UpdateInput{DueAt: ptr(in(40 * 24))})
	if err != nil {
		t.Fatal(err)
	}
	// The sweep looks for enqueued_version <> schedule_version; the old task finds a new version and does nothing.
	if n := len(tasks.Tasks()); n != 1 {
		t.Errorf("%d tasks, want only the first one", n)
	}
	if v := enqueuedVersion(t, pool, r.ID); v == nil || *v == u.ScheduleVersion {
		t.Errorf("enqueued_version = %v, want the old version, not %d", v, u.ScheduleVersion)
	}
}

func TestFailedEditChangesNothingAndItsVersionIsNeverReused(t *testing.T) {
	s, tasks, _, user := setupWithTasks(t)
	r := create(t, s, user, "Dentist", in(2))

	// Cloud Tasks may have saved this task even though the call failed (a timeout).
	tasks.Fail(errors.New("deadline exceeded"))
	if _, err := s.Update(ctx, user, r.ID, reminders.UpdateInput{DueAt: ptr(in(5)), Title: ptr("Dentist 14:00")}); !errors.Is(err, reminders.ErrScheduleFailed) {
		t.Fatalf("err = %v, want ErrScheduleFailed", err)
	}
	got, err := s.Get(ctx, user, r.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Title != "Dentist" || !got.DueAt.Equal(r.DueAt) || got.ScheduleVersion != r.ScheduleVersion {
		t.Errorf("after a failed edit = %+v, want it unchanged", got)
	}

	tasks.Fail(nil)
	u, err := s.Update(ctx, user, r.ID, reminders.UpdateInput{DueAt: ptr(in(7))})
	if err != nil {
		t.Fatal(err)
	}
	all := tasks.Tasks()
	if len(all) != 3 {
		t.Fatalf("tasks = %+v, want create, failed edit, edit", all)
	}
	failed, booked := all[1], all[2]
	if booked.Version == failed.Version || booked.Version != u.ScheduleVersion {
		t.Errorf("failed edit used v%d, next edit v%d (saved v%d): want a new version, so the task name is new too",
			failed.Version, booked.Version, u.ScheduleVersion)
	}
}
