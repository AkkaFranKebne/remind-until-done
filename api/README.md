# RUD API (Go)

The backend that runs on Cloud Run. Layout follows design doc Appendix D.

```
cmd/api/main.go          wiring: config, logger, database pool, router, graceful shutdown
internal/config          env vars -> Config
internal/db              Postgres connection pool (pgx)
internal/httpapi         routes, JSON errors, request logging
internal/logging         JSON logs in the format Cloud Logging reads
db/migrations            Flyway files: V1__init.sql (schema from design doc 2.1)
```

## Run locally
Needs Go 1.27+ and Docker Desktop (running).
```
make db-up migrate                          # from the repo root: local Postgres + tables
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

Other variables set by Terraform (`ALLOWED_EMAILS`, ...) are read once the
features that need them are added.

## Routes
| Route | Notes |
|---|---|
| `GET /api/v1/healthz` | Liveness check: always `200 {"status":"ok"}`, plus `"database":"ok"` or `"unavailable"` |

Browser calls reach the API through the Firebase Hosting rewrite, which keeps
the full `/api/v1/...` path. Unknown routes return
`{"error":{"code":"not_found","message":"..."}}`.
