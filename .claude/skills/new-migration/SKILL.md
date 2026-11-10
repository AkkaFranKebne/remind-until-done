---
name: new-migration
description: Add a database schema change in api/ as a Flyway migration (api/db/migrations/V<n>__<what>.sql) that is safe with the release still running, test it locally and in Go tests, and keep the design doc's schema in step. Use for any new table, column, index, constraint or data fix.
---

# New database migration

Rules it relies on: `api/AGENTS.md` and design doc 6.5 (migration policy), 6.6 (rollback). The schema lives in design doc 2.1 and Appendix E.

## 0. Know what to change
- Read design doc 2.1 (schema) and the feature's section. If the change isn't designed there, or the doc and `V*.sql` disagree: **stop and ask the owner**. Record the answer as a 9.1 decision.

## 1. A new file, never an edited one
- `ls api/db/migrations`, take the next number: `V2__add_reminder_message.sql` (Flyway: `V<n>__<what>.sql`, two underscores, lowercase words).
- **Never edit an applied migration** (anything merged to `main` has run on dev). Flyway checks each file's checksum and refuses to start if one changed. A mistake is fixed by the next migration.
- Plain SQL, one change per file where possible, with a comment line saying why.
- **Never put a password or any other secret in a migration** (it would sit in Git and run in every environment). Database roles that log in are created outside Flyway; a migration may only `GRANT` to a role that already exists.

## 2. Safe while the old release still runs (design doc 6.5)
Deploys migrate first, then start the new API; for a while the **old** API runs on the **new** schema. So every migration must work with the code that's live now. There's no automatic database rollback (6.6).
- **Add a column:** nullable, or with a default. `NOT NULL` without a default breaks the old code's inserts.
- **Make a column required:** three steps over two releases: add it nullable (+ code writes it) → backfill in a migration → `SET NOT NULL` in a later release.
- **Rename or remove:** add the new one, copy the data, switch the code; drop the old one in a later release, after no live code reads it. Never drop something the running release uses.
- **New table or index:** safe. Tables are tiny (5 active reminders per user), so plain `CREATE INDEX` is fine.
- **New enum value** (`ALTER TYPE ... ADD VALUE`): only after the code that reads it can handle it.
- **Data the app needs (rows, not schema):** say so in the PR. The nag lines are the exception with their own path: edit `api/db/seed/messages.csv`, then `make messages` in `api/`; never a `V` file (`api/AGENTS.md`).

## 3. Try it locally (repo root, Docker running)
- `make db-up migrate`: applies the new file to your local Postgres. `make db-info` lists what's applied. `make psql` opens a SQL prompt to look.
- Try it from scratch too: `make db-reset` (deletes the local data) runs every migration in order.

## 4. Tests
- Go database tests (`dbtest.Start(t)`) apply every `V*.sql`, then `R__*.sql`, to a fresh Postgres, so `make fmt vet test` in `api/` runs your migration.
- **At V10:** `applyMigrations` in `api/internal/dbtest/dbtest.go` sorts file names as text (`V10` before `V2`). Make it sort by the number before adding `V10`.
- Add or update service tests for the new column or table (`internal/<feature>/service_test.go`).
- The tests' pool works as the app's role `rud_app` (rows only). A new table gets its rights from `V4`'s default privileges; something the app must do beyond rows needs its own `GRANT` in the migration.
- CI also runs the real Flyway (`migrate` + `validate`) against a fresh database.

## 5. Code that uses it
- Queries list columns by name (never `SELECT *`), so a new column doesn't change old code.
- An API field from the new column: follow the `new-endpoint` skill (swagger.json, regenerated web client).

## 6. Docs and review
- Design doc 2.1: update the schema (and the ERD) in the same change. Appendix E shows `V1__init.sql` only; if a migration changes what it says, note it there.
- PR description: say which release step this is (e.g. "step 1 of 2: nullable now, NOT NULL next release").
- Run the `security-reviewer` agent (database code). Fix and re-run until NO BLOCKING FINDINGS.
- Deploys run the migration for you (`deploy.yml`: Flyway before Cloud Run, dev on merge, prod on the manual run). **Never run Flyway against Neon by hand.**
- PR with `/create-pr`; branch `api/<topic>`.
