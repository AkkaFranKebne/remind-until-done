package users_test

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/dbtest"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/users"
)

func ptr[T any](v T) *T { return &v }

func TestFindOrCreate(t *testing.T) {
	repo := users.NewRepo(dbtest.Start(t))
	ctx := context.Background()

	first, err := repo.FindOrCreate(ctx, "uid-1", "a@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if first.Timezone != "UTC" || first.DefaultTimeOfDay != "09:00" || first.DefaultNagIntervalMin != 60 {
		t.Errorf("new user = %+v, want the defaults UTC, 09:00, 60", first)
	}

	again, err := repo.FindOrCreate(ctx, "uid-1", "a@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if again.ID != first.ID {
		t.Errorf("second visit created a new user (%s), want the same one (%s)", again.ID, first.ID)
	}

	renamed, err := repo.FindOrCreate(ctx, "uid-1", "new@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if renamed.ID != first.ID || renamed.Email != "new@example.com" {
		t.Errorf("after an email change = %+v, want the same user with the new email", renamed)
	}
}

func TestFindOrCreateAtTheSameMomentMakesOneUser(t *testing.T) {
	repo := users.NewRepo(dbtest.Start(t))

	ids := make([]string, 10)
	var wg sync.WaitGroup
	for i := range ids {
		wg.Go(func() {
			u, err := repo.FindOrCreate(context.Background(), "uid-race", "r@example.com")
			if err != nil {
				t.Error(err)
				return
			}
			ids[i] = u.ID
		})
	}
	wg.Wait()
	for _, id := range ids {
		if id != ids[0] {
			t.Fatalf("parallel first visits got different users: %v", ids)
		}
	}
}

func TestUpdate(t *testing.T) {
	repo := users.NewRepo(dbtest.Start(t))
	ctx := context.Background()
	u, err := repo.FindOrCreate(ctx, "uid-1", "a@example.com")
	if err != nil {
		t.Fatal(err)
	}

	got, err := repo.Update(ctx, u.ID, users.Settings{Timezone: ptr("Europe/Stockholm")})
	if err != nil {
		t.Fatal(err)
	}
	if got.Timezone != "Europe/Stockholm" || got.DefaultTimeOfDay != "09:00" || got.DefaultNagIntervalMin != 60 {
		t.Errorf("after setting only the timezone = %+v, want the other settings unchanged", got)
	}

	got, err = repo.Update(ctx, u.ID, users.Settings{DefaultTimeOfDay: ptr("07:30"), DefaultNagIntervalMin: ptr(15)})
	if err != nil {
		t.Fatal(err)
	}
	if got.Timezone != "Europe/Stockholm" || got.DefaultTimeOfDay != "07:30" || got.DefaultNagIntervalMin != 15 {
		t.Errorf("after the second update = %+v", got)
	}
}

func TestUpdateRefusesBadValues(t *testing.T) {
	repo := users.NewRepo(dbtest.Start(t))
	ctx := context.Background()
	u, err := repo.FindOrCreate(ctx, "uid-1", "a@example.com")
	if err != nil {
		t.Fatal(err)
	}

	for name, s := range map[string]users.Settings{
		"unknown timezone":    {Timezone: ptr("Mars/Olympus")},
		"empty timezone":      {Timezone: ptr("")},
		"server's local zone": {Timezone: ptr("Local")},
		"time without colon":  {DefaultTimeOfDay: ptr("0900")},
		"hour 24":             {DefaultTimeOfDay: ptr("24:00")},
		"5-minute interval":   {DefaultNagIntervalMin: ptr(5)},
		"interval over a day": {DefaultNagIntervalMin: ptr(1441)},
	} {
		t.Run(name, func(t *testing.T) {
			var verr users.ValidationError
			if _, err := repo.Update(ctx, u.ID, s); !errors.As(err, &verr) {
				t.Errorf("Update() error = %v, want a ValidationError", err)
			}
		})
	}
}

func TestDeleteRemovesEverythingOfThatUserOnly(t *testing.T) {
	pool := dbtest.Start(t)
	repo := users.NewRepo(pool)
	ctx := context.Background()
	alice, err := repo.FindOrCreate(ctx, "uid-alice", "alice@example.com")
	if err != nil {
		t.Fatal(err)
	}
	bob, err := repo.FindOrCreate(ctx, "uid-bob", "bob@example.com")
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{alice.ID, bob.ID} {
		if _, err := pool.Exec(ctx, `
			WITH r AS (INSERT INTO reminders (user_id, title, due_at) VALUES ($1, 'x', now()) RETURNING id),
			     e AS (INSERT INTO reminder_events (reminder_id, type) SELECT id, 'created' FROM r)
			INSERT INTO push_subscriptions (user_id, fcm_token, platform) VALUES ($1, 'token-' || $1::text, 'ios')`, id); err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, `INSERT INTO user_seen_messages (user_id, message_id) SELECT $1, min(id) FROM nag_messages`, id); err != nil {
			t.Fatal(err)
		}
	}

	nothing := func(context.Context) error { return nil }
	if err := repo.Delete(ctx, alice.ID, nothing); err != nil {
		t.Fatal(err)
	}
	if err := repo.Delete(ctx, alice.ID, nothing); err != nil { // already gone is fine
		t.Fatal(err)
	}

	queries := map[string]string{
		"users":              `SELECT count(*) FROM users WHERE id = $1`,
		"reminders":          `SELECT count(*) FROM reminders WHERE user_id = $1`,
		"reminder_events":    `SELECT count(*) FROM reminder_events e JOIN reminders r ON r.id = e.reminder_id WHERE r.user_id = $1`,
		"push_subscriptions": `SELECT count(*) FROM push_subscriptions WHERE user_id = $1`,
		"user_seen_messages": `SELECT count(*) FROM user_seen_messages WHERE user_id = $1`,
	}
	for table, q := range queries {
		var left, kept int
		if err := pool.QueryRow(ctx, q, alice.ID).Scan(&left); err != nil {
			t.Fatal(err)
		}
		if err := pool.QueryRow(ctx, q, bob.ID).Scan(&kept); err != nil {
			t.Fatal(err)
		}
		if left != 0 || kept != 1 {
			t.Errorf("%s: alice has %d left, bob %d; want 0 and 1", table, left, kept)
		}
	}
	// Events are gone as rows too, not only unreachable through the join above.
	var events int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM reminder_events`).Scan(&events); err != nil {
		t.Fatal(err)
	}
	if events != 1 {
		t.Errorf("%d events in all, want bob's 1", events)
	}

	if _, err := repo.Find(ctx, "uid-alice", "alice@example.com"); !errors.Is(err, users.ErrNotFound) {
		t.Errorf("Find after delete: %v, want ErrNotFound", err)
	}
}

// Decision 78: while Firebase is being asked, other requests still find the row, so none can
// decide this user is new. If Firebase says no, nothing is lost.
func TestDeleteKeepsTheRowVisibleUntilItCommitsAndRollsBackOnFailure(t *testing.T) {
	repo := users.NewRepo(dbtest.Start(t))
	ctx := context.Background()
	u, err := repo.FindOrCreate(ctx, "uid-alice", "alice@example.com")
	if err != nil {
		t.Fatal(err)
	}

	boom := errors.New("firebase said no")
	err = repo.Delete(ctx, u.ID, func(ctx context.Context) error {
		if _, err := repo.Find(ctx, "uid-alice", "alice@example.com"); err != nil {
			t.Errorf("during the delete: %v, want the row still found", err)
		}
		return boom
	})
	if !errors.Is(err, boom) {
		t.Errorf("delete: %v, want the failure passed on", err)
	}
	if _, err := repo.Find(ctx, "uid-alice", "alice@example.com"); err != nil {
		t.Errorf("after a failed delete: %v, want the row kept", err)
	}

	if err := repo.Delete(ctx, u.ID, func(context.Context) error { return nil }); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.Find(ctx, "uid-alice", "alice@example.com"); !errors.Is(err, users.ErrNotFound) {
		t.Errorf("after the delete: %v, want ErrNotFound", err)
	}
}
