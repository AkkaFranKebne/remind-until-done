---
name: edit-nag-lines
description: Edit, add or retire rud.'s nag lines and done lines (api/db/seed/messages.csv), check them with make messages, and ship them to the local, dev and prod databases. Use for any change to the text of a push or a done message.
---

# Edit the nag lines

Rules it relies on: `api/AGENTS.md` ("Nag lines" and "Writing nag lines"), design doc 3.8 and decisions 67, 68 and 89.

## What updates what

The CSV is the source. `make messages` builds a SQL file from it. Flyway runs that SQL file in each database. Nothing reaches a database until Flyway runs there.

| Step | Changes | Database touched |
|---|---|---|
| Edit `api/db/seed/messages.csv` | the file | none |
| `make messages` (in `api/`) | checks the CSV, rewrites `api/db/migrations/R__nag_messages.sql` | none |
| `make migrate` (repo root) | runs the SQL file with Flyway | your local Docker database |
| Merge to `main` | the automatic deploy runs Flyway, then starts the new API | dev |
| Manual run of `deploy.yml` with `prod` (the owner) | the same | prod |

`R__nag_messages.sql` is generated, like a build output, but it's committed. Never edit it by hand: a test fails if it doesn't match the CSV.

## 1. Edit the CSV

Each row is `id,level,text,active`. Levels: 1 gentle (pushes 1 to 3), 2 teasing (4 to 8), 3 last calls (9 to 11), 4 final nag (12), 5 done (shown when a reminder is marked done).

- **Change a line:** edit its text and keep its id and level.
- **Retire a line:** set `active` to `false`. Never delete a row, renumber, or reuse an id: `user_seen_messages` remembers ids. A retired line keeps its text.
- **Add a line:** a new row at the end, with the next id (ids run 1, 2, 3… with no gaps), its level and `true`.
- **Write it to the rules** in `api/AGENTS.md` under "Writing nag lines": at most 60 characters, the voice of its level, and none of the rejected styles. When the owner reviews lines, add what they liked and rejected to those rules.

## 2. Check and build

In `api/`:

- `make messages`: checks every rule `messages.Check` knows (60 characters for active lines, no exact counts, no brackets or long dashes, no "pending", no duplicates, every level has a line) and rewrites the SQL file. It names each line that breaks a rule, by id.
- `go test ./internal/messages/` for a quick check, or `make fmt vet test` for everything (Docker must be running).

The tone rules (no "we", no lines about the notification, and so on) aren't checked by code. Read the changed lines against them.

## 3. Look at them locally (optional)

From the repo root: `make db-up migrate`, then `make psql`, then:

```sql
SELECT level, text FROM nag_messages WHERE active ORDER BY level, id;
```

## 4. Ship

- Branch `api/<topic>`, commit **both** files (the CSV and `R__nag_messages.sql`), open the PR with `/create-pr`. CI runs the Go tests and the real Flyway against a fresh database.
- Run the `security-reviewer` agent (it touches a migration).
- After the merge, watch the automatic dev deploy. The owner runs the prod deploy.

## What users notice

- The next push picks from the new lines. Retired lines are never sent again.
- A reworded line keeps its id, so a user who already saw it counts it as seen until that level reshuffles.
- A reminder page already showing a line keeps it until its next push (`reminders.line` is a copy of the text).

Keep this skill true: a PR that changes how lines are edited or shipped updates it too.
