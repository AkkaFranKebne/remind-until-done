-- V1__init.sql: the first schema (design doc section 2.1 and Appendix E).
-- Applied migrations are never edited. Change the schema with a new file (V2__...).

CREATE TABLE users (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid              text NOT NULL UNIQUE,
  email                     text NOT NULL,
  timezone                  text NOT NULL DEFAULT 'UTC',      -- IANA name
  default_nag_interval_min  int  NOT NULL DEFAULT 60 CHECK (default_nag_interval_min BETWEEN 15 AND 1440),
  default_time_of_day       time NOT NULL DEFAULT '09:00',
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE reminder_status AS ENUM ('pending', 'sending', 'sent', 'done');

CREATE TABLE reminders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title             text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  note              text,
  due_at            timestamptz NOT NULL,                  -- when the first push of the cycle fires
  nag_interval_min  int  NOT NULL DEFAULT 60 CHECK (nag_interval_min BETWEEN 15 AND 1440),
  status            reminder_status NOT NULL DEFAULT 'pending',
  nag_count         int  NOT NULL DEFAULT 0,               -- pushes sent in the current cycle (max 12)
  next_nag_at       timestamptz,                           -- when the next push is due; NULL = none scheduled
  schedule_version  int  NOT NULL DEFAULT 1,               -- bumped whenever the cycle restarts (edit)
  enqueued_version  int,                                   -- schedule_version that has its first task; NULL = none yet
  claimed_at        timestamptz,                           -- set when the fire handler picks a push up
  sent_at           timestamptz,                           -- time of the latest push
  done_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Sweep: pending rows that may need a first task
CREATE INDEX reminders_due_idx ON reminders (due_at) WHERE status = 'pending';
-- Sweep: broken nag chains
CREATE INDEX reminders_nag_idx ON reminders (next_nag_at) WHERE status = 'sent' AND next_nag_at IS NOT NULL;
-- Recovery of crashed sends
CREATE INDEX reminders_sending_idx ON reminders (claimed_at) WHERE status = 'sending';
-- List screen
CREATE INDEX reminders_user_idx ON reminders (user_id, status, due_at);

-- One device per user (v1 limit). Registering a new device replaces the row.
CREATE TABLE push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  fcm_token     text NOT NULL UNIQUE,
  platform      text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);

-- Optional audit trail; useful for debugging "why didn't I get it?"
CREATE TABLE reminder_events (
  id           bigserial PRIMARY KEY,
  reminder_id  uuid NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  type         text NOT NULL,     -- created | sent | send_failed | nag_schedule_failed | done
  detail       jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reminder_events_reminder_idx ON reminder_events (reminder_id, created_at);

-- Nag messages (section 3.8): curated lines, loaded from messages.csv by the seed command
CREATE TABLE nag_messages (
  id      int PRIMARY KEY,                                   -- permanent id from messages.csv
  level   smallint NOT NULL CHECK (level BETWEEN 1 AND 5),   -- 1 gentle, 2 teasing, 3 dramatic, 4 overdue-final (guard, unreachable at max 12 pushes), 5 done (celebratory)
  text    text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 140),
  active  boolean NOT NULL DEFAULT true                      -- retire a line without deleting it
);

-- Which lines each user has already seen (so they never repeat)
CREATE TABLE user_seen_messages (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id  int  NOT NULL REFERENCES nag_messages(id) ON DELETE CASCADE,
  seen_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);

-- Retention cleanup (section 7.4)
CREATE INDEX reminders_done_at_idx       ON reminders (done_at) WHERE status = 'done';
CREATE INDEX reminder_events_created_idx ON reminder_events (created_at);
CREATE INDEX push_subs_last_seen_idx     ON push_subscriptions (last_seen_at);
