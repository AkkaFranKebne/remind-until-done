# RUD API (Go)

The backend that runs on Cloud Run. Layout follows design doc Appendix D.

```
cmd/api/main.go          wiring: config, logger, router, graceful shutdown
internal/config          env vars -> Config
internal/httpapi         routes, JSON errors, request logging
internal/logging         JSON logs in the format Cloud Logging reads
```

## Run locally
Needs Go 1.27+.
```
make run                                    # http://localhost:8080
curl localhost:8080/api/v1/healthz          # {"status":"ok"}
make test vet fmt
```

## Settings
| Env var | Default | Notes |
|---|---|---|
| `ENV`  | `local` | `local`, `dev` or `prod` |
| `PORT` | `8080`  | Cloud Run sets it |

Other variables set by Terraform (`DATABASE_URL`, `ALLOWED_EMAILS`, ...) are
read once the features that need them are added.

## Routes
| Route | Notes |
|---|---|
| `GET /api/v1/healthz` | Liveness check, `{"status":"ok"}` |

Browser calls reach the API through the Firebase Hosting rewrite, which keeps
the full `/api/v1/...` path. Unknown routes return
`{"error":{"code":"not_found","message":"..."}}`.
