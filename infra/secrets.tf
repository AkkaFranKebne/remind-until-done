# Only the containers are managed here; values are added out-of-band (see README)
locals {
  # database-url: the API's login (role rud_app: rows only, decision 86).
  # database-migrate-url: the owner's login, for Flyway's schema changes in deploy.yml only.
  secrets = ["database-url", "database-migrate-url", "action-token-key", "allowed-emails"]
  # What the API reads. Not the migrate URL: the running app never gets the owner's login.
  api_secrets = toset(["database-url", "action-token-key", "allowed-emails"])
}

resource "google_secret_manager_secret" "app" {
  for_each  = toset(local.secrets)
  secret_id = each.value

  replication {
    auto {}
  }

  depends_on = [google_project_service.enabled]
}

resource "google_secret_manager_secret_iam_member" "api_reads" {
  for_each  = { for name, s in google_secret_manager_secret.app : name => s if contains(local.api_secrets, name) }
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}
