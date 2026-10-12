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
