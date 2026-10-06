resource "google_cloud_tasks_queue" "reminders" {
  name     = "reminders"
  location = var.tasks_region

  rate_limits {
    max_dispatches_per_second = 10
    max_concurrent_dispatches = 10
  }

  retry_config {
    max_attempts  = 5
    min_backoff   = "30s"
    max_backoff   = "300s"
    max_doublings = 3
  }

  depends_on = [google_project_service.enabled]
}
