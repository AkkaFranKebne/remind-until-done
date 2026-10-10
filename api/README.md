# RUD API (Go)

The backend that runs on Cloud Run. Layout follows design doc Appendix D.

```
cmd/api/main.go          wiring: config, logger, database pool, router, graceful shutdown
internal/config          env vars -> Config
internal/auth            Firebase ID token check + invite list (the only Firebase SDK user)
internal/db              Postgres connection pool (pgx)
internal/dbtest          throwaway Postgres for tests (testcontainers)
internal/httpapi         routes, sign-in middleware, /me, JSON errors, request logging
internal/users           users table: find-or-create, settings
internal/logging         JSON logs in the format Cloud Logging reads
db/migrations            Flyway files: V1__init.sql (schema from design doc 2.1)
swagger.json             the API contract (design doc Appendix A); the web app's API code is generated from it
```

## Run locally
Needs Go 1.27+ and Docker Desktop (running).
```
make db-up migrate                          # from the repo root: local Postgres + tables
echo 'ALLOWED_EMAILS=you@gmail.com' > .env.local   # once: your Gmail on the local invite list
make run                                    # http://localhost:8080
curl localhost:8080/api/v1/healthz          # {"database":"ok","status":"ok"}
make test vet fmt                           # database tests start their own Postgres
```

## Settings
| Env var | Default | Notes |
|---|---|---|
| `ENV`  | `local` | `local`, `dev` or `prod` |
| `PORT` | `8080`  | Cloud Run sets it |
| `DATABASE_URL` | local: the docker-compose database | Required in dev and prod (Secret Manager) |
| `GCP_PROJECT` | none (`make run` sets `rud-dev-4f7k2`) | Firebase project whose sign-in tokens are accepted. Required |
| `ALLOWED_EMAILS` | empty = nobody can sign in | Invite list, comma-separated (Secret Manager; locally `api/.env.local`) |

Other variables set by Terraform (`ACTION_TOKEN_KEY`, ...) are read once the
features that need them are added.

## Routes
| Route | Notes |
|---|---|
| `GET /api/v1/me` | Signed-in user and settings. Creates the user on the first visit. `401` without a valid token, `403 not_invited` if not on the list |
| `PATCH /api/v1/me` | Change `timezone`, `defaultTimeOfDay`, `defaultNagIntervalMin` (15–1440). `400 validation_failed` for bad values |
| `GET /api/v1/healthz` | Liveness check: always `200 {"status":"ok"}`, plus `"database":"ok"` or `"unavailable"` (checked once when the instance starts, never by callers) |

Browser calls reach the API through the Firebase Hosting rewrite, which keeps
the full `/api/v1/...` path. Unknown routes return
`{"error":{"code":"not_found","message":"..."}}`.
