package dispatch_test

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/actiontoken"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/dbtest"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/devices"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/dispatch"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/logging"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/messages"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/push"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/reminders"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/scheduling"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/users"
)

var ctx = context.Background()

const phoneToken = "phone-token-of-alice"

// world is a database with one user who has a phone, plus the services around Fire.
type world struct {
	pool      *pgxpool.Pool
	reminders *reminders.Service
	fire      *dispatch.Dispatcher
	pushes    *push.Fake
	nags      *scheduling.Fake // tasks Fire books (first pushes go to another fake)
	logs      *bytes.Buffer
	user      string
}

var testTokens = actiontoken.NewSigner("a test key that is long enough for this")

func setup(t *testing.T) *world {
	t.Helper()
	pool := dbtest.Start(t)
	u, err := users.NewRepo(pool).FindOrCreate(ctx, "uid-alice", "alice@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := devices.NewService(pool).Register(ctx, u.ID, devices.RegisterInput{FCMToken: phoneToken, Platform: "ios"}); err != nil {
		t.Fatal(err)
	}
	w := &world{pool: pool, pushes: &push.Fake{}, nags: &scheduling.Fake{}, logs: &bytes.Buffer{}, user: u.ID}
	w.reminders = reminders.NewService(pool, &scheduling.Fake{}, logging.New(w.logs))
	w.fire = dispatch.New(pool, w.pushes, w.nags, testTokens, logging.New(w.logs))
	return w
}

// newReminder is due now, nagging every 30 minutes; it returns the task for its first push.
func (w *world) newReminder(t *testing.T) scheduling.Body {
	t.Helper()
	r, err := w.reminders.Create(ctx, w.user, reminders.CreateInput{Title: "Pay rent", DueAt: time.Now(), NagIntervalMin: ptr(30)})
	if err != nil {
		t.Fatal(err)
	}
	return scheduling.Body{ReminderID: r.ID, Version: r.ScheduleVersion, N: 0}
}

func ptr[T any](v T) *T { return &v }

func (w *world) get(t *testing.T, id string) reminders.Reminder {
	t.Helper()
	r, err := w.reminders.Get(ctx, w.user, id)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func (w *world) events(t *testing.T, id string) []string {
	t.Helper()
	rows, err := w.pool.Query(ctx, `SELECT type || coalesce(' ' || (detail->>'reason'), '') FROM reminder_events WHERE reminder_id = $1 ORDER BY id`, id)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var e string
		if err := rows.Scan(&e); err != nil {
			t.Fatal(err)
		}
		out = append(out, e)
	}
	return out
}

// levelOf finds which level a sent line belongs to.
func (w *world) levelOf(t *testing.T, text string) int {
	t.Helper()
	var level int
	if err := w.pool.QueryRow(ctx, `SELECT level FROM nag_messages WHERE active AND text = $1`, text).Scan(&level); err != nil {
		t.Fatalf("line %q: %v", text, err)
	}
	return level
}

func (w *world) seenCount(t *testing.T) int {
	t.Helper()
	var n int
	if err := w.pool.QueryRow(ctx, `SELECT count(*) FROM user_seen_messages WHERE user_id = $1`, w.user).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestFirstPush(t *testing.T) {
	w := setup(t)
	task := w.newReminder(t)
	before := time.Now()

	if err := w.fire.Fire(ctx, task); err != nil {
		t.Fatal(err)
	}

	sent := w.pushes.Sent()
	if len(sent) != 1 {
		t.Fatalf("%d pushes, want 1", len(sent))
	}
	m := sent[0].Message
	if sent[0].Token != phoneToken || m.Title != "Pay rent" || w.levelOf(t, m.Body) != 1 ||
		m.URL != "/r/"+task.ReminderID || m.Attempt != 1 || m.MaxAttempts != 12 || m.SentAt.Before(before) {
		t.Errorf("push = %+v", sent[0])
	}

	r := w.get(t, task.ReminderID)
	if r.Status != reminders.StatusSent || r.NagCount != 1 || r.SentAt == nil || r.NextNagAt == nil {
		t.Fatalf("after the first push = %+v, want sent, 1 nag, a next nag time", r)
	}
	if d := r.NextNagAt.Sub(*r.SentAt); d != 30*time.Minute {
		t.Errorf("next nag %v after the push, want the 30 minute interval", d)
	}
	want := scheduling.Task{ReminderID: task.ReminderID, Version: task.Version, N: 1, At: *r.NextNagAt}
	if got := w.nags.Tasks(); len(got) != 1 || !got[0].At.Equal(want.At) || got[0].N != 1 || got[0].Version != task.Version {
		t.Errorf("booked %+v, want %+v", got, want)
	}
	if ev := w.events(t, task.ReminderID); strings.Join(ev, ",") != "created,sent" {
		t.Errorf("events = %v", ev)
	}
}

func TestNagChainStopsAfter12(t *testing.T) {
	w := setup(t)
	task := w.newReminder(t)
	for n := range reminders.MaxPushes {
		task.N = n
		if err := w.fire.Fire(ctx, task); err != nil {
			t.Fatalf("push %d: %v", n, err)
		}
	}
	// A 13th task can't exist, but if one did, nothing happens.
	task.N = reminders.MaxPushes
	if err := w.fire.Fire(ctx, task); err != nil {
		t.Fatal(err)
	}

	if n := len(w.pushes.Sent()); n != 12 {
		t.Errorf("%d pushes, want 12", n)
	}
	booked := w.nags.Tasks()
	if len(booked) != 11 || booked[10].N != 11 {
		t.Errorf("%d nags booked, want 11 (pushes 2 to 12), the last for n = 11", len(booked))
	}
	if last := w.pushes.Sent()[11].Message; last.Attempt != 12 {
		t.Errorf("last push says attempt %d, want 12", last.Attempt)
	}
	if r := w.get(t, task.ReminderID); !r.NagsExhausted() {
		t.Errorf("after 12 pushes = %+v, want Overdue", r)
	}
}

func TestStaleTasksDoNothing(t *testing.T) {
	w := setup(t)
	task := w.newReminder(t)

	t.Run("a duplicate of a push already sent", func(t *testing.T) {
		if err := w.fire.Fire(ctx, task); err != nil {
			t.Fatal(err)
		}
		if err := w.fire.Fire(ctx, task); err != nil {
			t.Fatal(err)
		}
		if n := len(w.pushes.Sent()); n != 1 {
			t.Errorf("%d pushes, want 1", n)
		}
	})

	t.Run("an old version after the reminder moved", func(t *testing.T) {
		moved, err := w.reminders.Update(ctx, w.user, task.ReminderID, reminders.UpdateInput{DueAt: ptr(time.Now().Add(time.Hour))})
		if err != nil {
			t.Fatal(err)
		}
		if err := w.fire.Fire(ctx, scheduling.Body{ReminderID: task.ReminderID, Version: task.Version, N: 1}); err != nil {
			t.Fatal(err)
		}
		if n := len(w.pushes.Sent()); n != 1 {
			t.Errorf("%d pushes, want still 1", n)
		}
		task = scheduling.Body{ReminderID: task.ReminderID, Version: moved.ScheduleVersion, N: 0}
	})

	t.Run("Done stops the queued nag", func(t *testing.T) {
		if _, err := w.reminders.MarkDone(ctx, w.user, task.ReminderID); err != nil {
			t.Fatal(err)
		}
		if err := w.fire.Fire(ctx, task); err != nil {
			t.Fatal(err)
		}
		if n := len(w.pushes.Sent()); n != 1 {
			t.Errorf("%d pushes, want still 1", n)
		}
	})

	t.Run("a deleted reminder", func(t *testing.T) {
		if err := w.reminders.Delete(ctx, w.user, task.ReminderID); err != nil {
			t.Fatal(err)
		}
		if err := w.fire.Fire(ctx, task); err != nil {
			t.Fatal(err)
		}
	})
}

func TestConcurrentDeliveriesSendOnce(t *testing.T) {
	w := setup(t)
	task := w.newReminder(t)

	var wg sync.WaitGroup
	for range 5 {
		wg.Go(func() {
			if err := w.fire.Fire(ctx, task); err != nil {
				t.Error(err)
			}
		})
	}
	wg.Wait()
	if n := len(w.pushes.Sent()); n != 1 {
		t.Errorf("%d pushes for 5 deliveries of the same task, want 1", n)
	}
	if r := w.get(t, task.ReminderID); r.NagCount != 1 {
		t.Errorf("nag count %d, want 1", r.NagCount)
	}
}

func TestACrashedSendIsClaimedAgainAfter2Minutes(t *testing.T) {
	w := setup(t)
	task := w.newReminder(t)
	claim := func(ago time.Duration) {
		if _, err := w.pool.Exec(ctx, `UPDATE reminders SET status = 'sending', claimed_at = now() - $2::interval WHERE id = $1`,
			task.ReminderID, ago.String()); err != nil {
			t.Fatal(err)
		}
	}

	claim(time.Minute) // another instance is sending right now
	if err := w.fire.Fire(ctx, task); err != nil || len(w.pushes.Sent()) != 0 {
		t.Errorf("claimed 1 minute ago: %v, %d pushes, want none", err, len(w.pushes.Sent()))
	}
	claim(3 * time.Minute) // that instance died
	if err := w.fire.Fire(ctx, task); err != nil || len(w.pushes.Sent()) != 1 {
		t.Errorf("claimed 3 minutes ago: %v, %d pushes, want 1", err, len(w.pushes.Sent()))
	}
}

func TestNoDeviceStopsNagging(t *testing.T) {
	w := setup(t)
	task := w.newReminder(t)
	if _, err := w.pool.Exec(ctx, `DELETE FROM push_subscriptions`); err != nil {
		t.Fatal(err)
	}

	if err := w.fire.Fire(ctx, task); err != nil {
		t.Fatal(err)
	}
	r := w.get(t, task.ReminderID)
	if len(w.pushes.Sent()) != 0 || len(w.nags.Tasks()) != 0 || !r.NagsExhausted() {
		t.Errorf("pushes %d, nags %d, reminder %+v: want nothing sent or booked, and Overdue", len(w.pushes.Sent()), len(w.nags.Tasks()), r)
	}
	if ev := w.events(t, task.ReminderID); strings.Join(ev, ",") != "created,send_failed no_devices" {
		t.Errorf("events = %v", ev)
	}
}

func TestTokenGoneDeletesTheDevice(t *testing.T) {
	w := setup(t)
	task := w.newReminder(t)
	w.pushes.Answer(push.TokenGone)

	if err := w.fire.Fire(ctx, task); err != nil {
		t.Fatal(err)
	}
	var devicesLeft int
	if err := w.pool.QueryRow(ctx, `SELECT count(*) FROM push_subscriptions`).Scan(&devicesLeft); err != nil {
		t.Fatal(err)
	}
	if devicesLeft != 0 {
		t.Error("the device is still there")
	}
	if r := w.get(t, task.ReminderID); !r.NagsExhausted() || len(w.nags.Tasks()) != 0 {
		t.Errorf("reminder %+v, nags %d: want Overdue and nothing booked", r, len(w.nags.Tasks()))
	}
	if ev := w.events(t, task.ReminderID); strings.Join(ev, ",") != "created,send_failed token_gone" {
		t.Errorf("events = %v", ev)
	}
	if strings.Contains(w.logs.String(), phoneToken) || !strings.Contains(w.logs.String(), "device deleted") {
		t.Errorf("logs = %s, want a warning without the token", w.logs)
	}
}

func TestTryLaterReleasesTheClaim(t *testing.T) {
	w := setup(t)
	task := w.newReminder(t)
	w.pushes.Answer(push.TryLater)

	if err := w.fire.Fire(ctx, task); !errors.Is(err, dispatch.ErrTryLater) {
		t.Fatalf("err = %v, want ErrTryLater", err)
	}
	if r := w.get(t, task.ReminderID); r.Status != reminders.StatusPending || r.NagCount != 0 {
		t.Errorf("after a failed first push = %+v, want pending again", r)
	}

	// Cloud Tasks retries the same task: now it goes through.
	w.pushes.Answer(push.Accepted)
	if err := w.fire.Fire(ctx, task); err != nil {
		t.Fatal(err)
	}
	if r := w.get(t, task.ReminderID); r.Status != reminders.StatusSent || r.NagCount != 1 {
		t.Errorf("after the retry = %+v, want sent, 1 nag", r)
	}

	// A later nag that fails goes back to sent, not pending.
	w.pushes.Answer(push.TryLater)
	task.N = 1
	if err := w.fire.Fire(ctx, task); !errors.Is(err, dispatch.ErrTryLater) {
		t.Fatalf("err = %v, want ErrTryLater", err)
	}
	if r := w.get(t, task.ReminderID); r.Status != reminders.StatusSent || r.NagCount != 1 {
		t.Errorf("after a failed nag = %+v, want sent, still 1 nag", r)
	}
}

func TestANagThatCantBeBookedIsStillSent(t *testing.T) {
	w := setup(t)
	task := w.newReminder(t)
	w.nags.Fail(errors.New("cloud tasks is down"))

	// 200, not a retry: the push already went out, a retry would send it twice.
	if err := w.fire.Fire(ctx, task); err != nil {
		t.Fatalf("err = %v, want nil", err)
	}
	if r := w.get(t, task.ReminderID); r.NagCount != 1 || r.NextNagAt == nil {
		t.Errorf("reminder = %+v, want 1 nag and a next nag time (the sweep finds it)", r)
	}
	if ev := w.events(t, task.ReminderID); strings.Join(ev, ",") != "created,sent,nag_schedule_failed" {
		t.Errorf("events = %v", ev)
	}
}

func TestEachPushGetsALineOfItsLevelAndNoneRepeats(t *testing.T) {
	w := setup(t)
	task := w.newReminder(t)
	for n := range 12 {
		task.N = n
		if err := w.fire.Fire(ctx, task); err != nil {
			t.Fatal(err)
		}
	}

	sent := w.pushes.Sent()
	if len(sent) != 12 {
		t.Fatalf("%d pushes, want 12", len(sent))
	}
	want := []int{1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 4}
	seen := map[string]bool{}
	for i, s := range sent {
		if got := w.levelOf(t, s.Message.Body); got != want[i] {
			t.Errorf("push %d: level %d, want %d", i+1, got, want[i])
		}
		if seen[s.Message.Body] {
			t.Errorf("push %d repeats %q", i+1, s.Message.Body)
		}
		seen[s.Message.Body] = true
	}
	if got := w.seenCount(t); got != 12 {
		t.Errorf("%d lines marked as seen, want 12", got)
	}
	r, err := w.reminders.Get(ctx, w.user, task.ReminderID)
	if err != nil || r.Line == nil || *r.Line != sent[11].Message.Body {
		t.Errorf("page line: %v, %v, want the last push's %q", err, r.Line, sent[11].Message.Body)
	}
}

func TestALineIsSeenOnlyOnceAPushIsAccepted(t *testing.T) {
	w := setup(t)
	task := w.newReminder(t)
	w.pushes.Answer(push.TryLater)

	if err := w.fire.Fire(ctx, task); !errors.Is(err, dispatch.ErrTryLater) {
		t.Fatalf("err = %v, want ErrTryLater", err)
	}
	if got := w.seenCount(t); got != 0 {
		t.Errorf("%d lines seen after a failed send, want 0", got)
	}
}

// duringSend runs something while the push is on its way.
type duringSend struct {
	push.Sender
	do func()
}

func (s duringSend) Send(ctx context.Context, token string, m push.Message) (push.Outcome, error) {
	s.do()
	return s.Sender.Send(ctx, token, m)
}

func TestEachPushCarriesADoneTokenForItsVersion(t *testing.T) {
	w := setup(t)
	task := w.newReminder(t)
	if err := w.fire.Fire(ctx, task); err != nil {
		t.Fatal(err)
	}
	claims, err := testTokens.Verify(w.pushes.Sent()[0].Message.DoneToken)
	if err != nil {
		t.Fatal(err)
	}
	want := actiontoken.Claims{ReminderID: task.ReminderID, Version: task.Version, Action: actiontoken.Done}
	if claims != want {
		t.Errorf("claims = %+v, want %+v", claims, want)
	}
	if token := w.pushes.Sent()[0].Message.DoneToken; strings.Contains(w.logs.String(), token) {
		t.Error("the token is in the logs")
	}
}

func TestALineSentWhileTappingDoneIsStillSeen(t *testing.T) {
	w := setup(t)
	task := w.newReminder(t)
	sender := duringSend{Sender: w.pushes, do: func() {
		if _, err := w.reminders.MarkDone(ctx, w.user, task.ReminderID); err != nil {
			t.Error(err)
		}
	}}

	if err := dispatch.New(w.pool, sender, w.nags, testTokens, logging.New(w.logs)).Fire(ctx, task); err != nil {
		t.Fatal(err)
	}
	if got := w.seenCount(t); got != 2 {
		t.Errorf("%d lines seen, want 2: the push's and the done line", got)
	}
	r := w.get(t, task.ReminderID)
	if r.Status != reminders.StatusDone {
		t.Errorf("status = %s, want done", r.Status)
	}
	if r.Line == nil || w.levelOf(t, *r.Line) != 5 {
		t.Errorf("page line %v, want the done line, not the push that was in flight", r.Line)
	}
}

func TestALineThatCantBeSavedStillCountsThePush(t *testing.T) {
	w := setup(t)
	task := w.newReminder(t)
	// With the line gone, saving it as seen fails on the foreign key.
	sender := duringSend{Sender: w.pushes, do: func() {
		if _, err := w.pool.Exec(ctx, `DELETE FROM nag_messages`); err != nil {
			t.Error(err)
		}
	}}

	if err := dispatch.New(w.pool, sender, w.nags, testTokens, logging.New(w.logs)).Fire(ctx, task); err != nil {
		t.Fatal(err)
	}
	r := w.get(t, task.ReminderID)
	if r.Status != reminders.StatusSent || r.NagCount != 1 {
		t.Errorf("after the push = %+v, want sent, 1 nag", r)
	}
	if len(w.nags.Tasks()) != 1 {
		t.Errorf("next nag not booked: %+v", w.nags.Tasks())
	}
	if !strings.Contains(w.logs.String(), "line not marked as seen") {
		t.Errorf("no log line: %s", w.logs.String())
	}
}

func TestALockedUserRowStillCountsThePush(t *testing.T) {
	w := setup(t)
	task := w.newReminder(t)
	// A save holds the user's row. Saving the seen line waits for it, then gives up.
	tx, err := w.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `SELECT 1 FROM users WHERE id = $1 FOR UPDATE`, w.user); err != nil {
		t.Fatal(err)
	}

	if err := w.fire.Fire(ctx, task); err != nil {
		t.Fatal(err)
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	if r := w.get(t, task.ReminderID); r.Status != reminders.StatusSent || r.NagCount != 1 {
		t.Errorf("after the push = %+v, want sent, 1 nag", r)
	}
	if got := w.seenCount(t); got != 0 {
		t.Errorf("%d lines seen, want 0: the save should have given up", got)
	}
}

func TestAnEmptyMessageTableStillPushes(t *testing.T) {
	w := setup(t)
	task := w.newReminder(t)
	if _, err := w.pool.Exec(ctx, `DELETE FROM nag_messages`); err != nil {
		t.Fatal(err)
	}

	if err := w.fire.Fire(ctx, task); err != nil {
		t.Fatal(err)
	}
	sent := w.pushes.Sent()
	if len(sent) != 1 || sent[0].Message.Body != messages.FallbackLine {
		t.Fatalf("pushes = %+v, want the fallback line", sent)
	}
	if got := w.seenCount(t); got != 0 {
		t.Errorf("%d lines seen, want 0", got)
	}
	if r := w.get(t, task.ReminderID); r.Status != reminders.StatusSent {
		t.Errorf("status = %s, want sent", r.Status)
	}
}
