# AGENTS.md: infra/ (Terraform)

Also read the root [`AGENTS.md`](../AGENTS.md) and [`README.md`](README.md) (setup steps).

## Commands
Run in `infra/`. Needs `gcloud auth application-default login`.

| Task | Command |
|---|---|
| Format + validate | `terraform fmt -check -recursive && terraform validate` |
| Switch environment | `terraform init -reconfigure -backend-config="bucket=rud-tfstate-<env>" -backend-config="prefix=rud"` |
| Dry run | `terraform plan -var-file=envs/<env>.tfvars -out=<env>.tfplan` |
| Apply (dev only, see below) | `terraform apply <env>.tfplan` |

## Rules
- One root module, one state per environment. Settings per environment: `envs/dev.tfvars`, `envs/prod.tfvars`.
- Always change **dev first**, check it, then prepare prod.
- **Prod: never apply.** Save a plan file and give the owner the exact `terraform apply` command.
- Show the plan summary (`N to add, N to change, N to destroy`) before applying. Explain every "destroy" or "must be replaced".
- After an apply, run `plan` again and expect "No changes".
- Secret **values** never go into Terraform (code or state). `secrets.tf` creates empty secrets; values are added with `gcloud secrets versions add`.
- Least privilege: give each service account only the roles it uses. Explain every new role in a comment.
- Terraform never manages the Cloud Run image (`ignore_changes`). CI deploys images.

## Never
- Never commit `*.tfstate`, `*.tfplan` or `.terraform/` (already in `.gitignore`).
- Never widen the Workload Identity condition in `wif.tf` (only `deploy.yml` on `main`, matching environment).
- Never grant `roles/owner`, `roles/editor` or IAM admin roles to a service account.
