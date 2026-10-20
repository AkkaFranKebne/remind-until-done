package devices

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }

const columns = `id, platform, user_agent, created_at, last_seen_at`

func scan(row pgx.Row) (Device, error) {
	var d Device
	err := row.Scan(&d.ID, &d.Platform, &d.UserAgent, &d.CreatedAt, &d.LastSeenAt)
	return d, err
}

// Get returns the user's device, or nil when none is registered.
func (s *Service) Get(ctx context.Context, userID string) (*Device, error) {
	d, err := scan(s.pool.QueryRow(ctx,
		`SELECT `+columns+` FROM push_subscriptions WHERE user_id = $1`, userID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

// Register saves this browser's push token as the user's device (design doc 5.7):
//   - the same token again (the app re-registers on every start): same device, new last_seen_at;
//   - a new token (another phone, or a rotated token): a new device (new id) replaces the old one,
//     so the old phone can tell another one took over;
//   - a token still saved for another user (same phone, they never signed out): it moves to this
//     user, and the other user has no device until they register again (decision 40).
func (s *Service) Register(ctx context.Context, userID string, in RegisterInput) (Device, error) {
	if err := checkToken(in.FCMToken); err != nil {
		return Device{}, err
	}
	if err := checkPlatform(in.Platform); err != nil {
		return Device{}, err
	}
	ua := cleanUserAgent(in.UserAgent)

	d, err := s.register(ctx, userID, in.FCMToken, in.Platform, ua)
	// Two users registering the same token at the very same moment: the second insert hits the
	// UNIQUE(fcm_token) (23505); two users registering each other's tokens at once can deadlock
	// (40P01, Postgres cancels one). Either way, one more try settles it: whoever finished last.
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && (pgErr.Code == "23505" || pgErr.Code == "40P01") {
		d, err = s.register(ctx, userID, in.FCMToken, in.Platform, ua)
	}
	return d, err
}

func (s *Service) register(ctx context.Context, userID, token, platform string, ua *string) (Device, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Device{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op after Commit

	// The user's row first (the same lock order as reminders), so two registrations of one user
	// run one after the other and "one device per user" holds.
	if _, err := tx.Exec(ctx, `SELECT 1 FROM users WHERE id = $1 FOR UPDATE`, userID); err != nil {
		return Device{}, fmt.Errorf("lock user: %w", err)
	}

	var ownerID, deviceID string
	err = tx.QueryRow(ctx,
		`SELECT id, user_id FROM push_subscriptions WHERE fcm_token = $1 FOR UPDATE`, token).Scan(&deviceID, &ownerID)
	switch {
	case err == nil && ownerID == userID:
		d, err := scan(tx.QueryRow(ctx,
			`UPDATE push_subscriptions SET platform = $2, user_agent = $3, last_seen_at = now()
			 WHERE id = $1 RETURNING `+columns, deviceID, platform, ua))
		if err != nil {
			return Device{}, fmt.Errorf("refresh device: %w", err)
		}
		return d, tx.Commit(ctx)
	case err == nil:
		// Still saved for another user: the phone is this user's now.
		if _, err := tx.Exec(ctx, `DELETE FROM push_subscriptions WHERE id = $1`, deviceID); err != nil {
			return Device{}, fmt.Errorf("move device: %w", err)
		}
	case !errors.Is(err, pgx.ErrNoRows):
		return Device{}, fmt.Errorf("find token: %w", err)
	}

	// One device per user: the new one replaces whatever this user had.
	if _, err := tx.Exec(ctx, `DELETE FROM push_subscriptions WHERE user_id = $1`, userID); err != nil {
		return Device{}, fmt.Errorf("replace device: %w", err)
	}
	d, err := scan(tx.QueryRow(ctx,
		`INSERT INTO push_subscriptions (user_id, fcm_token, platform, user_agent)
		 VALUES ($1, $2, $3, $4) RETURNING `+columns, userID, token, platform, ua))
	if err != nil {
		return Device{}, fmt.Errorf("insert device: %w", err)
	}
	return d, tx.Commit(ctx)
}

// Delete unregisters one of the user's devices (sign-out). Unknown, malformed or another user's
// id: ErrNotFound.
func (s *Service) Delete(ctx context.Context, userID, id string) error {
	u, err := uuid.Parse(id)
	if err != nil {
		return ErrNotFound
	}
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM push_subscriptions WHERE id = $1 AND user_id = $2`, u.String(), userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
