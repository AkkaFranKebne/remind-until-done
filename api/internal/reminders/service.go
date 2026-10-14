package reminders

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	pool *pgxpool.Pool
	now  func() time.Time // tests can stop the clock
}

func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool, now: time.Now} }

const columns = `id, title, note, due_at, nag_interval_min, status::text, nag_count, next_nag_at,
	schedule_version, sent_at, done_at, created_at, updated_at`

func scan(row pgx.Row) (Reminder, error) {
	var r Reminder
	var status string
	err := row.Scan(&r.ID, &r.Title, &r.Note, &r.DueAt, &r.NagIntervalMin, &status, &r.NagCount,
		&r.NextNagAt, &r.ScheduleVersion, &r.SentAt, &r.DoneAt, &r.CreatedAt, &r.UpdatedAt)
	r.Status = Status(status)
	return r, err
}

// parseID: anything that isn't a UUID can't be a reminder (404, not a database error).
func parseID(id string) (string, error) {
	u, err := uuid.Parse(id)
	if err != nil {
		return "", ErrNotFound
	}
	return u.String(), nil
}

// lockUser locks the user's row until the transaction ends, so two requests can't
// both pass the "at most 5 active" check at the same moment (design doc 2.1).
// It returns the user's default nag interval.
func lockUser(ctx context.Context, tx pgx.Tx, userID string) (defaultNagMin int, err error) {
	err = tx.QueryRow(ctx, `SELECT default_nag_interval_min FROM users WHERE id = $1 FOR UPDATE`, userID).Scan(&defaultNagMin)
	if err != nil {
		return 0, fmt.Errorf("lock user: %w", err)
	}
	return defaultNagMin, nil
}

func checkActiveLimit(ctx context.Context, tx pgx.Tx, userID string) error {
	var active int
	if err := tx.QueryRow(ctx,
		`SELECT count(*) FROM reminders WHERE user_id = $1 AND status <> 'done'`, userID).Scan(&active); err != nil {
		return fmt.Errorf("count active: %w", err)
	}
	if active >= MaxActive {
		return ErrLimitReached
	}
	return nil
}

func addEvent(ctx context.Context, tx pgx.Tx, reminderID, eventType string) error {
	_, err := tx.Exec(ctx, `INSERT INTO reminder_events (reminder_id, type) VALUES ($1, $2)`, reminderID, eventType)
	return err
}

// Create saves a new reminder (status pending, push cycle 1).
func (s *Service) Create(ctx context.Context, userID string, in CreateInput) (Reminder, error) {
	title, err := cleanTitle(in.Title)
	if err != nil {
		return Reminder{}, err
	}
	note, err := cleanNote(in.Note)
	if err != nil {
		return Reminder{}, err
	}
	if err := checkDueAt(in.DueAt, s.now()); err != nil {
		return Reminder{}, err
	}
	if in.NagIntervalMin != nil {
		if err := checkNagInterval(*in.NagIntervalMin); err != nil {
			return Reminder{}, err
		}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Reminder{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op after Commit

	nagMin, err := lockUser(ctx, tx, userID)
	if err != nil {
		return Reminder{}, err
	}
	if in.NagIntervalMin != nil {
		nagMin = *in.NagIntervalMin
	}
	if err := checkActiveLimit(ctx, tx, userID); err != nil {
		return Reminder{}, err
	}
	r, err := scan(tx.QueryRow(ctx,
		`INSERT INTO reminders (user_id, title, note, due_at, nag_interval_min)
		 VALUES ($1, $2, $3, $4, $5) RETURNING `+columns,
		userID, title, note, in.DueAt, nagMin))
	if err != nil {
		return Reminder{}, fmt.Errorf("insert reminder: %w", err)
	}
	if err := addEvent(ctx, tx, r.ID, "created"); err != nil {
		return Reminder{}, fmt.Errorf("add event: %w", err)
	}
	// M4 plugs the scheduler in here (design doc 3.2): create the Cloud Task for
	// push 0, set enqueued_version, and roll back with a 503 if that fails. Until
	// then enqueued_version stays NULL, which is exactly what the M4 sweep looks
	// for, so reminders saved now get their task once scheduling exists.
	if err := tx.Commit(ctx); err != nil {
		return Reminder{}, err
	}
	return r, nil
}

// Get returns one of the user's reminders.
func (s *Service) Get(ctx context.Context, userID, id string) (Reminder, error) {
	id, err := parseID(id)
	if err != nil {
		return Reminder{}, err
	}
	r, err := scan(s.pool.QueryRow(ctx,
		`SELECT `+columns+` FROM reminders WHERE id = $1 AND user_id = $2`, id, userID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Reminder{}, ErrNotFound
	}
	return r, err
}

// Update edits a reminder. A new dueAt restarts the push cycle (design doc 2.1):
// status pending, nag count 0, schedule_version + 1. On a done reminder that makes
// it active again, so the 5-active limit applies.
func (s *Service) Update(ctx context.Context, userID, id string, in UpdateInput) (Reminder, error) {
	id, err := parseID(id)
	if err != nil {
		return Reminder{}, err
	}
	var title *string
	if in.Title != nil {
		t, err := cleanTitle(*in.Title)
		if err != nil {
			return Reminder{}, err
		}
		title = &t
	}
	note, err := cleanNote(in.Note)
	if err != nil {
		return Reminder{}, err
	}
	if in.NagIntervalMin != nil {
		if err := checkNagInterval(*in.NagIntervalMin); err != nil {
			return Reminder{}, err
		}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Reminder{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Always the same order (user, then reminder), like Create, so two requests
	// can never wait for each other forever.
	if _, err := lockUser(ctx, tx, userID); err != nil {
		return Reminder{}, err
	}
	current, err := scan(tx.QueryRow(ctx,
		`SELECT `+columns+` FROM reminders WHERE id = $1 AND user_id = $2 FOR UPDATE`, id, userID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Reminder{}, ErrNotFound
	}
	if err != nil {
		return Reminder{}, err
	}

	restart := in.DueAt != nil && !in.DueAt.Equal(current.DueAt)
	if restart {
		if err := checkDueAt(*in.DueAt, s.now()); err != nil {
			return Reminder{}, err
		}
		if current.Status == StatusDone {
			if err := checkActiveLimit(ctx, tx, userID); err != nil {
				return Reminder{}, err
			}
		}
	}

	r, err := scan(tx.QueryRow(ctx,
		`UPDATE reminders SET
		   title            = COALESCE($3, title),
		   note             = CASE WHEN $4::bool THEN $5::text ELSE note END,
		   nag_interval_min = COALESCE($6, nag_interval_min),
		   due_at           = COALESCE($7, due_at),
		   status           = CASE WHEN $8::bool THEN 'pending'::reminder_status ELSE status END,
		   nag_count        = CASE WHEN $8::bool THEN 0 ELSE nag_count END,
		   next_nag_at      = CASE WHEN $8::bool THEN NULL ELSE next_nag_at END,
		   claimed_at       = CASE WHEN $8::bool THEN NULL ELSE claimed_at END,
		   done_at          = CASE WHEN $8::bool THEN NULL ELSE done_at END,
		   schedule_version = schedule_version + CASE WHEN $8::bool THEN 1 ELSE 0 END,
		   updated_at       = now()
		 WHERE id = $1 AND user_id = $2
		 RETURNING `+columns,
		id, userID, title, in.NoteSet, note, in.NagIntervalMin, in.DueAt, restart))
	if err != nil {
		return Reminder{}, fmt.Errorf("update reminder: %w", err)
	}
	// M4: on restart, create the task for the new schedule_version here (design doc 3.2).
	// Until then the M4 sweep finds it (enqueued_version differs from schedule_version).
	if err := tx.Commit(ctx); err != nil {
		return Reminder{}, err
	}
	return r, nil
}

// MarkDone stops the reminder. Done twice is fine: the second call changes nothing.
func (s *Service) MarkDone(ctx context.Context, userID, id string) (Reminder, error) {
	id, err := parseID(id)
	if err != nil {
		return Reminder{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Reminder{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	r, err := scan(tx.QueryRow(ctx,
		`UPDATE reminders SET status = 'done', done_at = now(), next_nag_at = NULL,
		   claimed_at = NULL, updated_at = now()
		 WHERE id = $1 AND user_id = $2 AND status <> 'done'
		 RETURNING `+columns, id, userID))
	if errors.Is(err, pgx.ErrNoRows) {
		// Already done (returned as is), or not found. Same transaction: no second connection.
		r, err = scan(tx.QueryRow(ctx, `SELECT `+columns+` FROM reminders WHERE id = $1 AND user_id = $2`, id, userID))
		if errors.Is(err, pgx.ErrNoRows) {
			return Reminder{}, ErrNotFound
		}
		return r, err
	}
	if err != nil {
		return Reminder{}, fmt.Errorf("mark done: %w", err)
	}
	if err := addEvent(ctx, tx, r.ID, "done"); err != nil {
		return Reminder{}, fmt.Errorf("add event: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return Reminder{}, err
	}
	return r, nil
}

// Delete removes the reminder and its events.
func (s *Service) Delete(ctx context.Context, userID, id string) error {
	id, err := parseID(id)
	if err != nil {
		return err
	}
	tag, err := s.pool.Exec(ctx, `DELETE FROM reminders WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return fmt.Errorf("delete reminder: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

const (
	defaultPageSize = 50
	maxPageSize     = 100
)

// List returns one page of the user's reminders.
//
//	upcoming (not done): soonest due first
//	done:                most recently done first
//
// The cursor is "where the last page ended" (time + id), so a reminder added or
// finished while you scroll doesn't make a page skip or repeat items.
func (s *Service) List(ctx context.Context, userID string, in ListInput) (Page, error) {
	limit := in.Limit
	if limit == 0 {
		limit = defaultPageSize
	}
	if limit < 1 || limit > maxPageSize {
		return Page{}, ValidationError{fmt.Sprintf("limit must be between 1 and %d", maxPageSize)}
	}

	var query string
	switch in.Status {
	case "", "upcoming":
		query = `SELECT ` + columns + ` FROM reminders
		 WHERE user_id = $1 AND status <> 'done' AND ($2::timestamptz IS NULL OR (due_at, id) > ($2, $3::uuid))
		 ORDER BY due_at, id LIMIT $4`
	case "done":
		query = `SELECT ` + columns + ` FROM reminders
		 WHERE user_id = $1 AND status = 'done' AND ($2::timestamptz IS NULL OR (done_at, id) < ($2, $3::uuid))
		 ORDER BY done_at DESC, id DESC LIMIT $4`
	default:
		return Page{}, ValidationError{"status must be upcoming or done"}
	}

	var after *time.Time
	var afterID *string
	if in.Cursor != "" {
		t, id, err := decodeCursor(in.Cursor)
		if err != nil {
			return Page{}, err
		}
		after, afterID = &t, &id
	}

	rows, err := s.pool.Query(ctx, query, userID, after, afterID, limit+1) // one extra: is there a next page?
	if err != nil {
		return Page{}, fmt.Errorf("list reminders: %w", err)
	}
	items, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Reminder, error) { return scan(row) })
	if err != nil {
		return Page{}, fmt.Errorf("list reminders: %w", err)
	}

	page := Page{Items: items}
	if len(items) > limit {
		page.Items = items[:limit]
		last := page.Items[limit-1]
		at := last.DueAt
		if in.Status == "done" && last.DoneAt != nil {
			at = *last.DoneAt
		}
		c := encodeCursor(at, last.ID)
		page.NextCursor = &c
	}
	return page, nil
}

// The cursor looks random to the app on purpose ("opaque" in swagger.json): the app
// only passes it back, so its contents can change without breaking anything.
func encodeCursor(at time.Time, id string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(at.UTC().Format(time.RFC3339Nano) + "|" + id))
}

func decodeCursor(c string) (time.Time, string, error) {
	bad := ValidationError{"cursor is not valid, start from the first page"}
	raw, err := base64.RawURLEncoding.DecodeString(c)
	if err != nil {
		return time.Time{}, "", bad
	}
	ts, id, ok := strings.Cut(string(raw), "|")
	if !ok {
		return time.Time{}, "", bad
	}
	t, err := time.Parse(time.RFC3339Nano, ts)
	if err != nil {
		return time.Time{}, "", bad
	}
	if _, err := uuid.Parse(id); err != nil {
		return time.Time{}, "", bad
	}
	return t, id, nil
}
