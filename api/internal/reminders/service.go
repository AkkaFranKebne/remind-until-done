package reminders

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/messages"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/scheduling"
)

// doneLineTimeout limits each step of the done line, picking and marking it seen: Done must not
// wait long for a joke, or fail because of one (decision 70).
const doneLineTimeout = 2 * time.Second

type Service struct {
	pool  *pgxpool.Pool
	sched scheduling.Scheduler
	lines *messages.Picker
	log   *slog.Logger
	now   func() time.Time // tests can stop the clock
}

func NewService(pool *pgxpool.Pool, sched scheduling.Scheduler, log *slog.Logger) *Service {
	return &Service{pool: pool, sched: sched, lines: messages.NewPicker(pool), log: log, now: time.Now}
}

const columns = `id, title, note, due_at, nag_interval_min, status::text, nag_count, next_nag_at,
	schedule_version, line, sent_at, done_at, created_at, updated_at`

func scan(row pgx.Row) (Reminder, error) {
	var r Reminder
	var status string
	err := row.Scan(&r.ID, &r.Title, &r.Note, &r.DueAt, &r.NagIntervalMin, &status, &r.NagCount,
		&r.NextNagAt, &r.ScheduleVersion, &r.Line, &r.SentAt, &r.DoneAt, &r.CreatedAt, &r.UpdatedAt)
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

// scheduleFirstPush books push 0 of the reminder's current schedule version (design doc 3.2)
// and records that it has one (enqueued_version). It runs inside the caller's transaction:
// if Cloud Tasks fails, the caller rolls back, so nothing is saved and a retry is safe.
// A reminder due beyond scheduling.Horizon gets no task yet; the daily sweep books it later.
func (s *Service) scheduleFirstPush(ctx context.Context, tx pgx.Tx, r Reminder) error {
	if r.DueAt.After(s.now().Add(scheduling.Horizon)) {
		return nil
	}
	task := scheduling.Task{ReminderID: r.ID, Version: r.ScheduleVersion, N: 0, At: r.DueAt}
	if err := s.sched.Enqueue(ctx, task); err != nil {
		return fmt.Errorf("%w: %w", ErrScheduleFailed, err)
	}
	if _, err := tx.Exec(ctx, `UPDATE reminders SET enqueued_version = $2 WHERE id = $1`, r.ID, r.ScheduleVersion); err != nil {
		return fmt.Errorf("set enqueued_version: %w", err)
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
	if err := s.scheduleFirstPush(ctx, tx, r); err != nil {
		return Reminder{}, err
	}
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
// status pending, nag count 0, a new schedule_version and a task for its first push.
// On a done reminder that makes it active again, so the 5-active limit applies.
//
// A new nag interval on a nagging reminder moves its next nag at once (decision 62): to the
// last push plus the new interval, or, if that has passed, the new interval from now. It never
// nags right after the save. The count goes on; a new
// schedule_version makes the task booked with the old interval do nothing. A push being sent
// right now is left alone: when it's recorded it books the next nag with the new interval.
//
// The new version comes from a sequence, not + 1 (decision 52): a sequence never hands
// out a number twice, even after a rollback. So if this edit booked its task and then
// failed, the next edit gets a new task name instead of colliding with that task.
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
	moveNextNag := !restart && in.NagIntervalMin != nil && *in.NagIntervalMin != current.NagIntervalMin &&
		current.Status == StatusSent && current.NextNagAt != nil
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
		   next_nag_at      = CASE WHEN $8::bool THEN NULL
		                           WHEN $9::bool AND sent_at + make_interval(mins => $6::int) > now()
		                                THEN sent_at + make_interval(mins => $6::int)
		                           WHEN $9::bool THEN now() + make_interval(mins => $6::int)
		                           ELSE next_nag_at END,
		   claimed_at       = CASE WHEN $8::bool THEN NULL ELSE claimed_at END,
		   done_at          = CASE WHEN $8::bool THEN NULL ELSE done_at END,
		   line             = CASE WHEN $8::bool THEN NULL ELSE line END,
		   schedule_version = CASE WHEN $8::bool OR $9::bool THEN nextval('reminder_schedule_version_seq')::int ELSE schedule_version END,
		   updated_at       = now()
		 WHERE id = $1 AND user_id = $2
		 RETURNING `+columns,
		id, userID, title, in.NoteSet, note, in.NagIntervalMin, in.DueAt, restart, moveNextNag))
	if err != nil {
		return Reminder{}, fmt.Errorf("update reminder: %w", err)
	}
	if restart {
		// A new cycle: the sweep's count towards giving up starts over (decision 76).
		if _, err := tx.Exec(ctx, `DELETE FROM reminder_events WHERE reminder_id = $1 AND type = 'sweep_rebooked'`, r.ID); err != nil {
			return Reminder{}, fmt.Errorf("reset rebookings: %w", err)
		}
		if err := s.scheduleFirstPush(ctx, tx, r); err != nil {
			return Reminder{}, err
		}
	}
	if moveNextNag {
		// Like push 0: booked inside the transaction, so a Cloud Tasks failure saves nothing.
		task := scheduling.Task{ReminderID: r.ID, Version: r.ScheduleVersion, N: r.NagCount, At: *r.NextNagAt}
		if err := s.sched.Enqueue(ctx, task); err != nil {
			return Reminder{}, fmt.Errorf("%w: %w", ErrScheduleFailed, err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return Reminder{}, err
	}
	return r, nil
}

// MarkDone stops the reminder and picks its done line. Done twice is fine: the second call
// changes nothing, so the line stays the one picked the first time.
func (s *Service) MarkDone(ctx context.Context, userID, id string) (Reminder, error) {
	return s.markDone(ctx, userID, id, nil)
}

// MarkDoneFromAction is Done from a notification's button: the same as MarkDone, but the signed-in
// user is unknown, and the token only works for the schedule version it was made for, so an edit
// stops older buttons (ErrActionStale). Done again is fine, whatever the version: it's what the
// button asks for.
//
// It has no user to filter by, so id must come from a verified action token, never from a request.
func (s *Service) MarkDoneFromAction(ctx context.Context, id string, version int) (Reminder, error) {
	id, err := parseID(id)
	if err != nil {
		return Reminder{}, err
	}
	var userID string
	err = s.pool.QueryRow(ctx, `SELECT user_id FROM reminders WHERE id = $1`, id).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Reminder{}, ErrNotFound
	}
	if err != nil {
		return Reminder{}, fmt.Errorf("find reminder owner: %w", err)
	}
	return s.markDone(ctx, userID, id, &version)
}

// markDone: version nil means any version.
func (s *Service) markDone(ctx context.Context, userID, id string, version *int) (Reminder, error) {
	current, err := s.Get(ctx, userID, id)
	if err != nil {
		return Reminder{}, err
	}
	if current.Status == StatusDone {
		return current, nil
	}
	if version != nil && current.ScheduleVersion != *version {
		return Reminder{}, ErrActionStale
	}
	id = current.ID
	line := s.pickDoneLine(ctx, userID, id)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Reminder{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var text *string
	if line.ID != 0 {
		text = &line.Text
	}
	r, err := scan(tx.QueryRow(ctx,
		`UPDATE reminders SET status = 'done', done_at = now(), next_nag_at = NULL,
		   claimed_at = NULL, line = $3, updated_at = now()
		 WHERE id = $1 AND user_id = $2 AND status <> 'done' AND ($4::int IS NULL OR schedule_version = $4)
		 RETURNING `+columns, id, userID, text, version))
	if errors.Is(err, pgx.ErrNoRows) {
		// Another Done got there first (returned as is), an edit just stopped this token, or it
		// was deleted just now. Same transaction: no second connection.
		r, err = scan(tx.QueryRow(ctx, `SELECT `+columns+` FROM reminders WHERE id = $1 AND user_id = $2`, id, userID))
		if errors.Is(err, pgx.ErrNoRows) {
			return Reminder{}, ErrNotFound
		}
		if err == nil && version != nil && r.Status != StatusDone {
			return Reminder{}, ErrActionStale
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
	s.markDoneLineSeen(ctx, userID, id, line)
	return r, nil
}

// pickDoneLine returns a done line, or ID 0 if there's none: no lines loaded (the picker's
// fallback is a nag, not a done line), or a database problem. The app then uses its own text.
func (s *Service) pickDoneLine(ctx context.Context, userID, id string) messages.Picked {
	ctx, cancel := context.WithTimeout(ctx, doneLineTimeout)
	defer cancel()
	line, err := s.lines.Pick(ctx, userID, messages.LevelForDone())
	if err != nil {
		s.log.ErrorContext(ctx, "done line not picked", "reminder_id", id, "err", err)
		return messages.Picked{}
	}
	return line
}

// markDoneLineSeen runs after the reminder is done, so a failure is only logged: the worst case
// is that the user sees the line again one day (like decision 69).
func (s *Service) markDoneLineSeen(ctx context.Context, userID, id string, line messages.Picked) {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), doneLineTimeout)
	defer cancel()
	if err := messages.MarkSeen(ctx, s.pool, userID, line); err != nil {
		s.log.ErrorContext(ctx, "done line not marked as seen", "reminder_id", id, "message_id", line.ID, "err", err)
	}
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
