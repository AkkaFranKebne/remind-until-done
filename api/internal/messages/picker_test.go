package messages_test

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/dbtest"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/messages"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/users"
)

func TestLevelFor(t *testing.T) {
	want := map[int]int{1: 1, 3: 1, 4: 2, 8: 2, 9: 3, 11: 3, 12: 4, 13: 4}
	for attempt, level := range want {
		if got := messages.LevelFor(attempt); got != level {
			t.Errorf("push %d: level %d, want %d", attempt, got, level)
		}
	}
}

// pickerWorld has a small table, so a level runs out quickly: two lines at level 1, one at level 2,
// one retired line at level 3.
func pickerWorld(t *testing.T) (*pgxpool.Pool, *messages.Picker, string) {
	t.Helper()
	ctx := context.Background()
	pool := dbtest.Start(t)
	if _, err := pool.Exec(ctx, `DELETE FROM nag_messages`); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO nag_messages (id, level, text, active) VALUES
		(1, 1, 'first', true), (2, 1, 'second', true), (3, 2, 'teasing', true), (4, 3, 'retired', false)`); err != nil {
		t.Fatal(err)
	}
	return pool, messages.NewPicker(pool), newUser(t, pool, "alice")
}

func newUser(t *testing.T, pool *pgxpool.Pool, name string) string {
	t.Helper()
	u, err := users.NewRepo(pool).FindOrCreate(context.Background(), "uid-"+name, name+"@example.com")
	if err != nil {
		t.Fatal(err)
	}
	return u.ID
}

func TestPickNeverRepeatsUntilTheLevelRunsOut(t *testing.T) {
	ctx := context.Background()
	pool, picker, user := pickerWorld(t)

	got := map[string]bool{}
	for range 2 {
		line, err := picker.Pick(ctx, user, 1)
		if err != nil {
			t.Fatal(err)
		}
		if got[line.Text] {
			t.Errorf("%q came twice", line.Text)
		}
		got[line.Text] = true
		if err := messages.MarkSeen(ctx, pool, user, line); err != nil {
			t.Fatal(err)
		}
	}
	if !got["first"] || !got["second"] {
		t.Errorf("got %v, want both lines", got)
	}

	// Level 2's seen line must survive when level 1 starts over.
	teasing, err := picker.Pick(ctx, user, 2)
	if err != nil {
		t.Fatal(err)
	}
	if err := messages.MarkSeen(ctx, pool, user, teasing); err != nil {
		t.Fatal(err)
	}

	again, err := picker.Pick(ctx, user, 1)
	if err != nil {
		t.Fatal(err)
	}
	if again.ID == 0 {
		t.Fatal("level 1 didn't start over")
	}
	var level1, level2 int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FILTER (WHERE m.level = 1), count(*) FILTER (WHERE m.level = 2)
		 FROM user_seen_messages s JOIN nag_messages m ON m.id = s.message_id WHERE s.user_id = $1`, user).Scan(&level1, &level2); err != nil {
		t.Fatal(err)
	}
	if level1 != 0 || level2 != 1 {
		t.Errorf("seen: level 1 = %d, level 2 = %d, want 0 and 1", level1, level2)
	}
}

func TestPickDoesNotMarkALineSeen(t *testing.T) {
	ctx := context.Background()
	pool, picker, user := pickerWorld(t)
	if _, err := picker.Pick(ctx, user, 1); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM user_seen_messages`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Errorf("%d lines seen after Pick, want 0", n)
	}
}

func TestSeenLinesArePerUser(t *testing.T) {
	ctx := context.Background()
	pool, picker, alice := pickerWorld(t)
	bob := newUser(t, pool, "bob")
	if err := messages.MarkSeen(ctx, pool, alice, messages.Picked{ID: 3}); err != nil {
		t.Fatal(err)
	}
	line, err := picker.Pick(ctx, bob, 2)
	if err != nil {
		t.Fatal(err)
	}
	if line.Text != "teasing" {
		t.Errorf("bob got %q, want the line alice has seen", line.Text)
	}
	// Alice's seen line must still be there: only her own level run out resets it.
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM user_seen_messages WHERE user_id = $1`, alice).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Errorf("alice has %d seen lines, want 1", n)
	}
}

func TestPickFallsBack(t *testing.T) {
	ctx := context.Background()
	pool, picker, user := pickerWorld(t)
	want := messages.Picked{Text: messages.FallbackLine}

	for name, level := range map[string]int{"a level with only a retired line": 3, "an empty level": 4} {
		got, err := picker.Pick(ctx, user, level)
		if err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Errorf("%s: got %+v", name, got)
		}
	}

	// The fallback line isn't saved: it has no row to point at.
	if err := messages.MarkSeen(ctx, pool, user, want); err != nil {
		t.Fatal(err)
	}
}

func TestMarkSeenTwiceIsFine(t *testing.T) {
	ctx := context.Background()
	pool, _, user := pickerWorld(t)
	for range 2 {
		if err := messages.MarkSeen(ctx, pool, user, messages.Picked{ID: 1}); err != nil {
			t.Fatal(err)
		}
	}
}
