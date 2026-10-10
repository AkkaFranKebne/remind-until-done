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
- Layout follows Appendix D: `cmd/api` (wiring), `internal/config`, `internal/httpapi` (HTTP only), feature packages (`reminders`, `dispatch`, ...).
- `httpapi` only translates HTTP to service calls. Business rules live in the feature packages.
- Only `scheduling` and `push` import Google SDKs for those jobs. Everything else uses their interfaces, so tests can use fakes.
- Public routes live under `/api/v1/` (Firebase Hosting forwards the full path). Cloud Tasks and Scheduler call `/internal/*`.
- Errors use one JSON shape: `{"error":{"code":"...","message":"..."}}` (`writeError` in `internal/httpapi/errors.go`).
- Logs: structured JSON through the logger from `internal/logging` (Cloud Logging reads `severity` and `message`).
- Settings come from env vars in `internal/config`. Terraform sets them on Cloud Run (`infra/cloud_run.tf`).
- Database: one pgx pool (`internal/db`), created in `cmd/api/main.go` and passed down. Packages take a small interface (like `httpapi.Pinger`), so tests can pass a fake.
- Schema changes are Flyway files in `db/migrations/` named `V<n>__<what>.sql`. They must work with the previous release too (design doc 6.5): add a nullable column, backfill, tighten later.
- Database tests use testcontainers (a throwaway Postgres per test, same image as `docker-compose.yml`). Unit tests use fakes.
- Every reminder query filters by the signed-in `user_id`. Another user's row returns 404, not 403.

## Never
- Never build SQL by string concatenation. Use query parameters.
- Never log secrets, tokens or full connection strings. Errors that could quote `DATABASE_URL` aren't wrapped (see `db.Open`).
- Never add an `/internal/*` route without the OIDC check (from M4).
- Never edit an applied migration. Add a new one (design doc 6.5).
