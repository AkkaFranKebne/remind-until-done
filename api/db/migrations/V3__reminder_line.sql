-- The funny line the reminder page shows (design doc 3.8, decision 70): the latest push's line,
-- or the done line picked when it was marked done. NULL = none yet; the app has its own text.
-- Nullable, so the release still running keeps working: it never reads this column.
ALTER TABLE reminders ADD COLUMN line text;
