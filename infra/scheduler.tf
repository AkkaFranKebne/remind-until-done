# Daily safety net (03:00 UTC): recovers stuck sends, schedules far-future reminders,
# repairs lost tasks and broken nag chains, runs retention cleanup
resource "google_cloud_scheduler_job" "sweep" {
  name      = "rud-sweep-${var.env}"
  region    = var.scheduler_region
  schedule  = "0 3 * * *"
  time_zone = "Etc/UTC"

  retry_config {
    retry_count = 1
  }

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.api.uri}/internal/sweep"

    oidc_token {
      service_account_email = google_service_account.invoker.email
      audience              = google_cloud_run_v2_service.api.uri
    }
  }

  depends_on = [google_project_service.enabled]
}
