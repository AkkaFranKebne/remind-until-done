package devices_test

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/dbtest"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/devices"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/users"
)

var ctx = context.Background()

// setup starts a database with two users and returns the service, the pool and their ids.
func setup(t *testing.T) (s *devices.Service, pool *pgxpool.Pool, alice, bob string) {
	t.Helper()
	pool = dbtest.Start(t)
	return devices.NewService(pool), pool, newUser(t, pool, "uid-a"), newUser(t, pool, "uid-b")
}

func newUser(t *testing.T, pool *pgxpool.Pool, uid string) string {
	t.Helper()
	u, err := users.NewRepo(pool).FindOrCreate(ctx, uid, uid+"@example.com")
	if err != nil {
		t.Fatal(err)
	}
	return u.ID
}

func register(t *testing.T, s *devices.Service, userID, token string) devices.Device {
	t.Helper()
	d, err := s.Register(ctx, userID, devices.RegisterInput{FCMToken: token, Platform: "ios", UserAgent: "iPhone"})
	if err != nil {
		t.Fatal(err)
	}
	return d
}

func tokenOf(t *testing.T, pool *pgxpool.Pool, userID string) string {
	t.Helper()
	var token string
	err := pool.QueryRow(ctx, `SELECT fcm_token FROM push_subscriptions WHERE user_id = $1`, userID).Scan(&token)
	if err != nil {
		return ""
	}
	return token
}

func TestRegisterAndGet(t *testing.T) {
	s, _, alice, _ := setup(t)

	none, err := s.Get(ctx, alice)
	if err != nil || none != nil {
		t.Fatalf("before registering: %v, %v; want nil, nil", none, err)
	}

	d := register(t, s, alice, "token-1")
	if d.ID == "" || d.Platform != "ios" || d.UserAgent == nil || *d.UserAgent != "iPhone" {
		t.Fatalf("registered %+v", d)
	}
	got, err := s.Get(ctx, alice)
	if err != nil || got == nil || got.ID != d.ID {
		t.Fatalf("Get = %+v, %v; want %s", got, err, d.ID)
	}
}

func TestSameTokenAgainKeepsTheDeviceAndRefreshesLastSeen(t *testing.T) {
	s, pool, alice, _ := setup(t)
	first := register(t, s, alice, "token-1")
	// Make "last seen" visibly old, then register the same token (the app does it on every start).
	if _, err := pool.Exec(ctx, `UPDATE push_subscriptions SET last_seen_at = now() - interval '3 days'`); err != nil {
		t.Fatal(err)
	}

	again := register(t, s, alice, "token-1")

	if again.ID != first.ID || !again.CreatedAt.Equal(first.CreatedAt) {
		t.Fatalf("same token gave a new device: %+v vs %+v", again, first)
	}
	if !again.LastSeenAt.After(first.LastSeenAt.AddDate(0, 0, -1)) {
		t.Fatalf("last seen not refreshed: %v", again.LastSeenAt)
	}
}

func TestNewTokenReplacesTheDevice(t *testing.T) {
	s, pool, alice, _ := setup(t)
	old := register(t, s, alice, "token-old-phone")

	now := register(t, s, alice, "token-new-phone")

	if now.ID == old.ID {
		t.Fatal("a new token kept the old device id; the old phone couldn't tell it was replaced")
	}
	var count int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM push_subscriptions WHERE user_id = $1`, alice).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 || tokenOf(t, pool, alice) != "token-new-phone" {
		t.Fatalf("devices for alice: %d, token %q; want 1, the new one", count, tokenOf(t, pool, alice))
	}
}

func TestATokenStillSavedForAnotherUserMovesToTheNewOne(t *testing.T) {
	s, pool, alice, bob := setup(t)
	register(t, s, alice, "shared-phone") // alice never signed out on this phone

	register(t, s, bob, "shared-phone")

	if tokenOf(t, pool, bob) != "shared-phone" {
		t.Fatal("bob didn't get the phone")
	}
	if d, err := s.Get(ctx, alice); err != nil || d != nil {
		t.Fatalf("alice still has a device: %+v, %v", d, err)
	}
}

func TestTwoUsersRegisteringTheSameTokenAtOnce(t *testing.T) {
	s, pool, alice, bob := setup(t)

	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i, user := range []string{alice, bob} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, errs[i] = s.Register(ctx, user, devices.RegisterInput{FCMToken: "race", Platform: "android"})
		}()
	}
	wg.Wait()

	for _, err := range errs {
		if err != nil {
			t.Fatalf("a registration failed: %v", err)
		}
	}
	var count int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM push_subscriptions WHERE fcm_token = 'race'`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("token saved %d times; want once", count)
	}
}

func TestRegisterChecksTheInput(t *testing.T) {
	s, _, alice, _ := setup(t)
	cases := map[string]devices.RegisterInput{
		"empty token":    {FCMToken: "", Platform: "ios"},
		"huge token":     {FCMToken: strings.Repeat("x", devices.MaxTokenLength+1), Platform: "ios"},
		"NUL in token":   {FCMToken: "a\x00b", Platform: "ios"},
		"other platform": {FCMToken: "t", Platform: "windows"},
	}
	for name, in := range cases {
		_, err := s.Register(ctx, alice, in)
		var v devices.ValidationError
		if !errors.As(err, &v) {
			t.Errorf("%s: err = %v; want a ValidationError", name, err)
		}
	}
}

func TestTheLongestTokenFitsTheDatabase(t *testing.T) {
	s, pool, alice, _ := setup(t)
	// Random-looking (not compressible), like a real token: Postgres's index limit is 2704 bytes.
	var b strings.Builder
	for i := 0; b.Len() < devices.MaxTokenLength; i++ {
		fmt.Fprintf(&b, "%x", i*2654435761)
	}
	token := b.String()[:devices.MaxTokenLength]

	register(t, s, alice, token)

	if tokenOf(t, pool, alice) != token {
		t.Fatal("the longest allowed token wasn't saved")
	}
}

func TestUserAgentIsCutAndCleaned(t *testing.T) {
	s, _, alice, _ := setup(t)

	d, err := s.Register(ctx, alice, devices.RegisterInput{
		FCMToken: "t", Platform: "web", UserAgent: "Mozilla\x00" + strings.Repeat("é", 600),
	})
	if err != nil {
		t.Fatal(err)
	}
	if d.UserAgent == nil || strings.ContainsRune(*d.UserAgent, 0) || len([]rune(*d.UserAgent)) != devices.MaxUserAgentLength {
		t.Fatalf("user agent not cleaned: %q", *d.UserAgent)
	}

	blank, err := s.Register(ctx, alice, devices.RegisterInput{FCMToken: "t", Platform: "web", UserAgent: "  "})
	if err != nil || blank.UserAgent != nil {
		t.Fatalf("blank user agent = %v, %v; want nil", blank.UserAgent, err)
	}
}

func TestDeleteOnlyTheUsersOwnDevice(t *testing.T) {
	s, _, alice, bob := setup(t)
	d := register(t, s, alice, "token-1")

	if err := s.Delete(ctx, bob, d.ID); !errors.Is(err, devices.ErrNotFound) {
		t.Fatalf("bob deleting alice's device: %v; want ErrNotFound", err)
	}
	if err := s.Delete(ctx, alice, "not-a-uuid"); !errors.Is(err, devices.ErrNotFound) {
		t.Fatalf("malformed id: %v; want ErrNotFound", err)
	}
	if err := s.Delete(ctx, alice, d.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.Delete(ctx, alice, d.ID); !errors.Is(err, devices.ErrNotFound) {
		t.Fatalf("deleting twice: %v; want ErrNotFound", err)
	}
}
