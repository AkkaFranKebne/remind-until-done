# RUD infrastructure (Terraform)

One root module, one state per environment (`dev`, `prod`).
Source: design doc, Appendix B. `terraform validate` passes.

## Layout
```
infra/
  versions.tf          providers + GCS backend
  variables.tf         inputs
  apis.tf              enable GCP APIs
  artifact_registry.tf Docker repo for the Go image
  service_accounts.tf  runtime SA + invoker SA (OIDC for Tasks/Scheduler)
  wif.tf               GitHub Actions deploy identity (Workload Identity Federation)
  secrets.tf           Secret Manager containers (values set out-of-band)
  cloud_run.tf         Go API service
  cloud_tasks.tf       reminders queue
  scheduler.tf         daily /internal/sweep job (03:00 UTC)
  outputs.tf
  envs/dev.tfvars
  envs/prod.tfvars
```
`firebase.json` (Hosting config, `/api/**` -> Cloud Run) lives outside Terraform.

## One-time bootstrap (done)
GCP projects, Firebase (Blaze, Google sign-in, Hosting), state buckets
`rud-tfstate-dev` / `rud-tfstate-prod`, Neon databases and the action-token key.
See design doc section 10.1.

## Apply (dev shown; use prod for prod)
Cloud Run reads the secrets at start, so they must have values before the
full apply. Otherwise the service fails to deploy. Apply in two steps.

```
gcloud auth login
gcloud auth application-default login
terraform init -reconfigure -backend-config="bucket=rud-tfstate-dev" -backend-config="prefix=rud"
```
Use `-reconfigure` when switching between dev and prod state.

1. Enable the APIs and create the empty secrets:
```
terraform apply -var-file=envs/dev.tfvars \
  -target='google_project_service.enabled' -target='google_secret_manager_secret.app'
```
2. Add the secret values (into the matching project):
```
printf '%s' "$NEON_URL"       | gcloud secrets versions add database-url     --data-file=- --project=rud-dev-4f7k2
printf '%s' "$ACTION_KEY"     | gcloud secrets versions add action-token-key --data-file=- --project=rud-dev-4f7k2
printf '%s' "$ALLOWED_EMAILS" | gcloud secrets versions add allowed-emails   --data-file=- --project=rud-dev-4f7k2   # comma-separated tester Google emails
```
3. Create everything else:
```
terraform plan  -var-file=envs/dev.tfvars
terraform apply -var-file=envs/dev.tfvars
```

Copy the `wif_provider` and `deployer_sa_email` outputs into GitHub environment
variables `WIF_PROVIDER` and `DEPLOYER_SA`. Terraform is applied manually from a
laptop in v1; the CI identity cannot change infrastructure.

## Notes
- The Cloud Run service allows unauthenticated invocation, because the browser reaches it through the Firebase Hosting rewrite. `/internal/*` is protected in the Go app by verifying the OIDC token (audience = service URL, email = invoker SA).
- `SERVICE_URL` is not known until the first apply. Copy the `api_url` output into `service_url` in the tfvars and apply again.
- Neon is managed outside Terraform on purpose (keeps the state small and avoids a third-party provider).
