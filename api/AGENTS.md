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
- Routes are listed once in `API.routes()` (`internal/httpapi/router.go`). Every route except `/healthz` is wrapped in `requireUser` (401 without a valid token, 403 `not_invited` if not on the invite list). Every route must be in `swagger.json`: `router_contract_test.go` fails otherwise.
- The invite list (`ALLOWED_EMAILS`) works the same everywhere: listed and verified emails only; empty = nobody (design doc decision 31). Locally, put your Gmail in `api/.env.local` (`ALLOWED_EMAILS=you@gmail.com`; git-ignored).
- Errors use one JSON shape: `{"error":{"code":"...","message":"..."}}` (`writeError` in `internal/httpapi/errors.go`).
- Every answer (errors too) gets `Cache-Control: no-store` and `X-Content-Type-Options: nosniff` from `apiHeaders` (`internal/httpapi/middleware_headers.go`). Answers are per user, so no phone or CDN may keep a copy. Don't override it in a handler.
- Logs: structured JSON through the logger from `internal/logging` (Cloud Logging reads `severity` and `message`).
- Settings come from env vars in `internal/config`. Terraform sets them on Cloud Run (`infra/cloud_run.tf`).
- Database: one pgx pool (`internal/db`), created in `cmd/api/main.go` and passed down. Packages take a small interface (like `httpapi.Pinger`), so tests can pass a fake.
- Schema changes are Flyway files in `db/migrations/` named `V<n>__<what>.sql`. They must work with the previous release too (design doc 6.5): add a nullable column, backfill, tighten later.
- Database tests use testcontainers (`dbtest.Start(t)`: a throwaway Postgres per test, same image as `docker-compose.yml`). Unit tests use fakes.
- Every reminder query filters by the signed-in `user_id`. Another user's row returns 404, not 403.
- A public route that touches the database must not let anonymous callers wake or flood it: check once at startup (like `CheckDatabase` for `/healthz`) or require sign-in.

## Never
- Never build SQL by string concatenation. Use query parameters.
- Never log secrets, ID tokens, emails or full connection strings (log the Firebase uid instead). Errors that could quote `DATABASE_URL` aren't wrapped (see `db.Open`).
- Never add an `/internal/*` route without the OIDC check (from M4).
- Never edit an applied migration. Add a new one (design doc 6.5).
