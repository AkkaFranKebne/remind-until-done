-- V2: new schedule versions come from a sequence, not schedule_version + 1 (design doc decision 52).
-- A sequence never hands out the same number twice, even when the transaction that took it
-- rolls back. So an edit that booked its Cloud Task and then failed can't leave a task with
-- the same name (r-{id}-v{version}-n0) for the next edit to collide with.
--
-- Start well above every version in use: the old release, still running during the deploy,
-- keeps doing + 1, and its numbers must not catch up with the sequence.
CREATE SEQUENCE reminder_schedule_version_seq AS integer;
SELECT setval('reminder_schedule_version_seq', COALESCE((SELECT max(schedule_version) FROM reminders), 0) + 1000);
