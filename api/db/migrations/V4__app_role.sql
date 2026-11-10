-- The API's own database role (design doc 7.1, decision 86): it may read and write rows, and
-- nothing else. Flyway keeps the owner role for schema changes, so a bug or an injected query in
-- the API can't drop or change a table.
-- No password here: the role is made without login. In Neon the owner turns login on with a
-- password, outside the repo (ALTER ROLE rud_app WITH LOGIN PASSWORD '...', infra/README.md).
-- Locally and in tests it stays without login; the tests use it through SET ROLE.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rud_app') THEN
    CREATE ROLE rud_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO rud_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rud_app;
-- nextval: reminder_schedule_version_seq, and the event ids (bigserial).
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rud_app;
-- Tables and sequences that later migrations make (run by the same owner) get the same rights.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rud_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO rud_app;

-- Flyway's own bookkeeping is none of the app's business.
DO $$
BEGIN
  IF to_regclass('public.flyway_schema_history') IS NOT NULL THEN
    REVOKE ALL ON public.flyway_schema_history FROM rud_app;
  END IF;
END
$$;
