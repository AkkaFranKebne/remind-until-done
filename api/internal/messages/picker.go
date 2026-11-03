package messages

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// FallbackLine goes out if a level has no lines, like a database that hasn't been loaded yet.
// A push is never blocked by the lines (design doc 3.8).
const FallbackLine = "Still waiting for you."

// LevelFor is the tone of a push, from its number: 1 is the first push (design doc 3.8). The last
// nag gets its own level, so it can say it's the last (decision 66).
func LevelFor(attempt int) int {
	switch {
	case attempt <= 3:
		return 1
	case attempt <= 8:
		return 2
	case attempt <= 11:
		return 3
	default:
		return 4
	}
}

// LevelForDone is the level of the line shown when a reminder is marked done. The done handler
// picks it, not the nag scheduler (design doc 3.8).
func LevelForDone() int { return 5 }

// Picked is a line for one push. ID 0 is the fallback line, which isn't in the table.
type Picked struct {
	ID   int
	Text string
}

// Picker chooses lines from nag_messages.
type Picker struct {
	pool *pgxpool.Pool
}

func NewPicker(pool *pgxpool.Pool) *Picker {
	return &Picker{pool: pool}
}

// Pick returns a random active line of the level that the user hasn't seen. Once they've seen
// them all, their seen lines of that level are forgotten and the level starts over. It doesn't
// mark the line as seen: MarkSeen does, after the push is accepted, so a failed send doesn't use it up.
func (p *Picker) Pick(ctx context.Context, userID string, level int) (Picked, error) {
	line, ok, err := p.unseen(ctx, userID, level)
	if err != nil || ok {
		return line, err
	}
	tag, err := p.pool.Exec(ctx,
		`DELETE FROM user_seen_messages s USING nag_messages m
		 WHERE s.message_id = m.id AND s.user_id = $1 AND m.level = $2`, userID, level)
	if err != nil {
		return Picked{}, fmt.Errorf("start the level over: %w", err)
	}
	if tag.RowsAffected() > 0 {
		line, ok, err = p.unseen(ctx, userID, level)
		if err != nil || ok {
			return line, err
		}
	}
	return Picked{Text: FallbackLine}, nil
}

func (p *Picker) unseen(ctx context.Context, userID string, level int) (Picked, bool, error) {
	var line Picked
	err := p.pool.QueryRow(ctx,
		`SELECT m.id, m.text FROM nag_messages m
		 WHERE m.active AND m.level = $2
		   AND NOT EXISTS (SELECT 1 FROM user_seen_messages s WHERE s.user_id = $1 AND s.message_id = m.id)
		 ORDER BY random() LIMIT 1`, userID, level).Scan(&line.ID, &line.Text)
	if errors.Is(err, pgx.ErrNoRows) {
		return Picked{}, false, nil
	}
	if err != nil {
		return Picked{}, false, fmt.Errorf("pick a line: %w", err)
	}
	return line, true, nil
}

// MarkSeen remembers that the user got this line. Saving it twice is fine: a retried push, or
// two reminders firing together, can pick the same line.
func MarkSeen(ctx context.Context, pool *pgxpool.Pool, userID string, line Picked) error {
	if line.ID == 0 {
		return nil // the fallback line isn't in the table
	}
	_, err := pool.Exec(ctx,
		`INSERT INTO user_seen_messages (user_id, message_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, userID, line.ID)
	if err != nil {
		return fmt.Errorf("mark line seen: %w", err)
	}
	return nil
}
