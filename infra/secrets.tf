# Only the containers are managed here; values are added out-of-band (see README)
locals {
  secrets = ["database-url", "action-token-key", "allowed-emails"]
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
  for_each  = google_secret_manager_secret.app
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}
