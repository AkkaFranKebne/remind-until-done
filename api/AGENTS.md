# AGENTS.md: api/ (Go service)

Also read the root [`AGENTS.md`](../AGENTS.md). Design: design doc Appendix D (layout, interfaces) and section 3 (dispatcher).

## Commands
Run in `api/`. Needs Go (version in `go.mod`).

| Task | Command |
|---|---|
| Local database (from the repo root) | `make db-up migrate` · `make db-info` · `make psql` · `make db-reset` |
| Run on :8080 | `make run` (uses the local database) |
| Format check / vet / tests | `make fmt vet test` (Docker must be running) |
| Docker image | `make docker` (Docker Desktop must be running) |
| Known vulnerabilities | `go run golang.org/x/vuln/cmd/govulncheck@latest ./...` |

## Rules
- Use the `gopls` MCP server (root `AGENTS.md`) to find definitions, references and a package's API before changing shared code; run its diagnostics after a change.
- Layout follows Appendix D: `cmd/api` (wiring), `internal/config`, `internal/httpapi` (HTTP only), feature packages (`reminders`, `dispatch`, ...).
- `httpapi` only translates HTTP to service calls. Business rules live in the feature packages.
- Only `auth`, `scheduling` and `push` import Google SDKs. Everything else uses their interfaces (`httpapi.TokenVerifier`, ...), so tests can use fakes.
- Public routes live under `/api/v1/` (Firebase Hosting forwards the full path). Cloud Tasks and Scheduler call `/internal/*`.
- Internal routes are listed in `API.internalRoutes()` (not in `swagger.json`). `Router` wraps every `/internal/*` path in `requireInvoker`: a Google ID token (OIDC) signed by Google, issued by Google sign-in, made for `SERVICE_URL`, from `INVOKER_SA_EMAIL` with a verified email (`auth.Invoker`, design doc 7.1). The Cloud Run URL is public (Hosting must reach it), so this check is the only lock. Locally `make run` sets `INTERNAL_AUTH=off` (nothing signs tokens there); config refuses it in dev and prod.
- Routes are listed once in `API.routes()` (`internal/httpapi/router.go`). Every route except `/healthz` is wrapped in `requireUser` (401 without a valid token, 403 `not_invited` if not on the invite list). Every route must be in `swagger.json`, and every `swagger.json` route must be served or listed in `notBuiltYet` (with its milestone): `router_contract_test.go` fails otherwise. Building a route? Remove it from `notBuiltYet`. The web app's API code is generated from `swagger.json`.
- The invite list (`ALLOWED_EMAILS`) works the same everywhere: listed and verified emails only; empty = nobody (design doc decision 31). Locally, put your Gmail in `api/.env.local` (`ALLOWED_EMAILS=you@gmail.com`; git-ignored).
- Errors use one JSON shape: `{"error":{"code":"...","message":"..."}}` (`writeError` in `internal/httpapi/errors.go`).
- Every answer (errors too) gets `Cache-Control: no-store` and `X-Content-Type-Options: nosniff` from `apiHeaders` (`internal/httpapi/middleware_headers.go`). Answers are per user, so no phone or CDN may keep a copy. Don't override it in a handler.
- Logs: structured JSON through the logger from `internal/logging` (Cloud Logging reads `severity` and `message`).
- Settings come from env vars in `internal/config`. Terraform sets them on Cloud Run (`infra/cloud_run.tf`).
- Database: one pgx pool (`internal/db`), created in `cmd/api/main.go` and passed down. Packages take a small interface (like `httpapi.Pinger`), so tests can pass a fake.
- Schema changes are Flyway files in `db/migrations/` named `V<n>__<what>.sql`. They must work with the previous release too (design doc 6.5): add a nullable column, backfill, tighten later.
- Database tests use testcontainers (`dbtest.Start(t)`: a throwaway Postgres per test, same image as `docker-compose.yml`). Unit tests use fakes.
- Every reminder query filters by the signed-in `user_id`. Another user's row returns 404, not 403.
- Reminders (`internal/reminders`): creating one, or moving a done one to a new time, locks the user's row first (`lockUser`, `SELECT ... FOR UPDATE`), then counts active reminders. Always lock in the same order (user, then reminder), or two requests can wait for each other forever. `TestCreateWaitsForTheUsersLock` proves the lock is there.
- Devices (`internal/devices`, decision 40): one push device per user. The same token again keeps its id; a new token replaces the device with a new id; a token still saved for another user moves to the caller. Registering locks the user's row first (same order as reminders). Push tokens are never returned or logged.
- Scheduling (`internal/scheduling`, design doc 3.2): every push is one Cloud Task named `r-{id}-v{version}-n{n}`, booked through the `scheduling.Scheduler` interface (`CloudTasks` in dev and prod, `Log` locally with `SCHEDULER=log`, `Fake` in tests). Create, and an edit that moves `dueAt`, book push 0 inside the same transaction and set `enqueued_version`; if Cloud Tasks fails, everything rolls back and the API answers 503 `unavailable`. A first push beyond `scheduling.Horizon` (25 days) gets no task; the sweep books it later.
- Push (`internal/push`, design doc 3.3): `push.Sender` sends one data-only web push (no notification block: the service worker builds it) and answers an `Outcome`: `Accepted`, `TokenGone` (UNREGISTERED or SENDER_ID_MISMATCH: delete the device) or `TryLater` (everything else, including INVALID_ARGUMENT, which could be our own bug). `FCM` in dev and prod, `Log` locally, `Fake` in tests. Push tokens and reminder titles are never logged.
- A new schedule version always comes from `nextval('reminder_schedule_version_seq')`, never `+ 1` (decision 52): a rolled-back attempt may have booked its task, and a reused version would reuse its task name.
- A public route that touches the database must not let anonymous callers wake or flood it: check once at startup (like `CheckDatabase` for `/healthz`) or require sign-in.

## Never
- Never build SQL by string concatenation. Use query parameters.
- Never log secrets, ID tokens, emails or full connection strings (log the Firebase uid instead). Errors that could quote `DATABASE_URL` aren't wrapped (see `db.Open`).
- Never add an `/internal/*` route outside `internalRoutes()`, and never turn the OIDC check off outside `ENV=local`.
- Never edit an applied migration. Add a new one (design doc 6.5).
