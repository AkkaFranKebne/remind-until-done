// Package users stores the signed-in people and their settings (table users).
//
// There is no separate sign-up: the first request with a valid token creates
// the row (FindOrCreate), every later one finds it.
package users

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type User struct {
	ID                    string
	Email                 string
	Timezone              string // IANA name, e.g. Europe/Stockholm
	DefaultTimeOfDay      string // "09:00"
	DefaultNagIntervalMin int
}

// Settings is a partial update: nil fields stay as they are.
type Settings struct {
	Timezone              *string
	DefaultTimeOfDay      *string
	DefaultNagIntervalMin *int
}

// ValidationError is a bad value from the caller (HTTP 400), not a server problem.
type ValidationError struct{ Message string }

func (e ValidationError) Error() string { return e.Message }

const (
	MinNagIntervalMin = 15   // same limits as the CHECK in V1__init.sql
	MaxNagIntervalMin = 1440 // 24 hours ("Tomorrow")
)

var timeOfDay = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)

type Repo struct {
	pool *pgxpool.Pool
}

func NewRepo(pool *pgxpool.Pool) *Repo { return &Repo{pool: pool} }

const columns = `id, email, timezone, to_char(default_time_of_day, 'HH24:MI'), default_nag_interval_min`

func scan(row pgx.Row) (User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Email, &u.Timezone, &u.DefaultTimeOfDay, &u.DefaultNagIntervalMin)
	return u, err
}

// FindOrCreate returns the user for this Firebase account, creating it on the
// first visit. The email is kept up to date if it changed in Google.
func (r *Repo) FindOrCreate(ctx context.Context, firebaseUID, email string) (User, error) {
	u, err := scan(r.pool.QueryRow(ctx, `SELECT `+columns+` FROM users WHERE firebase_uid = $1`, firebaseUID))
	switch {
	case err == nil:
		if u.Email == email {
			return u, nil
		}
		return scan(r.pool.QueryRow(ctx,
			`UPDATE users SET email = $2 WHERE firebase_uid = $1 RETURNING `+columns, firebaseUID, email))
	case !errors.Is(err, pgx.ErrNoRows):
		return User{}, fmt.Errorf("find user: %w", err)
	}

	// First visit. ON CONFLICT: two first requests at the same moment both get the same row.
	u, err = scan(r.pool.QueryRow(ctx,
		`INSERT INTO users (firebase_uid, email) VALUES ($1, $2)
		 ON CONFLICT (firebase_uid) DO NOTHING RETURNING `+columns, firebaseUID, email))
	if errors.Is(err, pgx.ErrNoRows) {
		// The other request created it first.
		return scan(r.pool.QueryRow(ctx, `SELECT `+columns+` FROM users WHERE firebase_uid = $1`, firebaseUID))
	}
	if err != nil {
		return User{}, fmt.Errorf("create user: %w", err)
	}
	return u, nil
}

// Update changes the given settings after checking them.
func (r *Repo) Update(ctx context.Context, id string, s Settings) (User, error) {
	if err := s.Validate(); err != nil {
		return User{}, err
	}
	u, err := scan(r.pool.QueryRow(ctx,
		`UPDATE users SET
		   timezone                 = COALESCE($2, timezone),
		   default_time_of_day      = COALESCE($3::time, default_time_of_day),
		   default_nag_interval_min = COALESCE($4, default_nag_interval_min)
		 WHERE id = $1
		 RETURNING `+columns,
		id, s.Timezone, s.DefaultTimeOfDay, s.DefaultNagIntervalMin))
	if err != nil {
		return User{}, fmt.Errorf("update user: %w", err)
	}
	return u, nil
}

// Validate checks the values without touching the database.
func (s Settings) Validate() error {
	if s.Timezone != nil {
		tz := *s.Timezone
		// LoadLocation also accepts "" (UTC) and "Local" (the server's zone); neither is a real choice.
		if len(tz) == 0 || len(tz) > 64 || tz == "Local" {
			return ValidationError{"timezone must be an IANA name, like Europe/Stockholm"}
		}
		if _, err := time.LoadLocation(tz); err != nil {
			return ValidationError{"timezone must be an IANA name, like Europe/Stockholm"}
		}
	}
	if s.DefaultTimeOfDay != nil && !timeOfDay.MatchString(*s.DefaultTimeOfDay) {
		return ValidationError{"defaultTimeOfDay must be HH:MM, like 09:00"}
	}
	if n := s.DefaultNagIntervalMin; n != nil && (*n < MinNagIntervalMin || *n > MaxNagIntervalMin) {
		return ValidationError{fmt.Sprintf("defaultNagIntervalMin must be between %d and %d", MinNagIntervalMin, MaxNagIntervalMin)}
	}
	return nil
}
