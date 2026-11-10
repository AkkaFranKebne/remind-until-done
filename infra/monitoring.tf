# Budget, uptime check and alerts (design doc 7.6, decision 86). Every alert mails var.alert_email.
#
# Frontend comparison: like an error tracker that emails you, but for the server and the bill.

# Where alerts go. The address lives in envs/<env>.local.tfvars, which git ignores: it's
# personal, not secret, so it stays out of the repo (Terraform state keeps it, in the private bucket).
resource "google_monitoring_notification_channel" "email" {
  display_name = "rud ${var.env} alerts"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }
  depends_on = [google_project_service.enabled]
}

locals {
  alert_channels = [google_monitoring_notification_channel.email.id]
  # Our app's own JSON logs (stdout). Not Cloud Run's request log, which marks every 5xx answer
  # as ERROR too: the api_errors alert counts those.
  app_logs = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${google_cloud_run_v2_service.api.name}\" AND logName=\"projects/${var.project_id}/logs/run.googleapis.com%2Fstdout\""
}

# Is the app reachable from the internet? Through Firebase Hosting, like the browser.
# Every 5 minutes, from several regions: /healthz never touches the database (it reports the
# check made when the instance started), and checks this often keep an instance warm most of
# the time, so they rarely start a new one (each pings the database once). Cloud Run bills by
# request, so a warm, idle instance costs nothing.
resource "google_monitoring_uptime_check_config" "healthz" {
  display_name = "rud ${var.env} /api/v1/healthz"
  timeout      = "10s"
  period       = "300s"

  http_check {
    path         = "/api/v1/healthz"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = "${var.project_id}.web.app"
    }
  }
  depends_on = [google_project_service.enabled]
}

resource "google_monitoring_alert_policy" "api_down" {
  display_name          = "rud ${var.env}: the app is unreachable"
  combiner              = "OR"
  notification_channels = local.alert_channels

  conditions {
    display_name = "/api/v1/healthz failing from more than one region for 10 minutes"
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.label.check_id=\"${google_monitoring_uptime_check_config.healthz.uptime_check_id}\" AND resource.type=\"uptime_url\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "600s"
      aggregations {
        alignment_period     = "1200s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.*"]
      }
    }
  }

  documentation {
    mime_type = "text/markdown"
    content   = "https://${var.project_id}.web.app/api/v1/healthz doesn't answer. Check Firebase Hosting and the Cloud Run service rud-api (Logs tab)."
  }
}

# The API answering 5xx: our bug, the database, or Firebase/FCM trouble. Includes the 503 that
# makes Cloud Tasks retry a push, so a push outage shows here too.
resource "google_monitoring_alert_policy" "api_errors" {
  display_name          = "rud ${var.env}: the API answers errors"
  combiner              = "OR"
  notification_channels = local.alert_channels

  conditions {
    display_name = "More than 5 answers with 5xx in 10 minutes"
    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND resource.label.service_name=\"${google_cloud_run_v2_service.api.name}\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.label.response_code_class=\"5xx\""
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      duration        = "0s"
      aggregations {
        alignment_period     = "600s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  alert_strategy {
    auto_close = "3600s"
  }

  documentation {
    mime_type = "text/markdown"
    content   = "Cloud Run → rud-api → Logs: filter for severity ERROR and the requests with status 5xx."
  }
}

# Anything our code logs as ERROR: a nag that couldn't be booked, an event not saved, a sweep that
# failed, gave up or didn't finish, an account half deleted ("firebase user deleted, row still
# there"). At most one mail an hour.
resource "google_monitoring_alert_policy" "app_errors" {
  display_name          = "rud ${var.env}: the API logged an error"
  combiner              = "OR"
  notification_channels = local.alert_channels

  conditions {
    display_name = "A log line with severity ERROR"
    condition_matched_log {
      filter = "${local.app_logs} AND severity>=ERROR"
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = "3600s"
    }
    auto_close = "1800s"
  }

  documentation {
    mime_type = "text/markdown"
    content   = "Cloud Run → rud-api → Logs, severity ERROR. The message says what failed; a reminder's history: the runbook in design doc 7.6."
  }
}

# FCM refusing pushes for a while (each one is retried by Cloud Tasks). Counted from the log, so
# no database query is needed.
resource "google_logging_metric" "push_failed" {
  name   = "rud_push_failed"
  filter = "${local.app_logs} AND jsonPayload.message=\"push failed, Cloud Tasks retries\""
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

resource "google_monitoring_alert_policy" "push_failures" {
  display_name          = "rud ${var.env}: pushes keep failing"
  combiner              = "OR"
  notification_channels = local.alert_channels

  conditions {
    display_name = "More than 3 failed pushes in an hour"
    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND metric.type=\"logging.googleapis.com/user/${google_logging_metric.push_failed.name}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 3
      duration        = "0s"
      aggregations {
        alignment_period     = "3600s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  alert_strategy {
    auto_close = "7200s"
  }

  documentation {
    mime_type = "text/markdown"
    content   = "Logs: \"push failed, Cloud Tasks retries\" with the reason. FCM or the push token; check the Firebase status page."
  }
}

# Cloud Tasks couldn't deliver pushes to the API: a 401 here means the /internal login is broken
# (invoker account or SERVICE_URL), and then no reminder goes out at all.
resource "google_monitoring_alert_policy" "task_failures" {
  display_name          = "rud ${var.env}: Cloud Tasks can't deliver pushes"
  combiner              = "OR"
  notification_channels = local.alert_channels

  conditions {
    display_name = "More than 5 failed task attempts in an hour"
    condition_threshold {
      filter          = "resource.type=\"cloud_tasks_queue\" AND resource.label.queue_id=\"${google_cloud_tasks_queue.reminders.name}\" AND metric.type=\"cloudtasks.googleapis.com/queue/task_attempt_count\" AND metric.label.response_code!=\"OK\""
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      duration        = "0s"
      aggregations {
        alignment_period     = "3600s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  alert_strategy {
    auto_close = "7200s"
  }

  documentation {
    mime_type = "text/markdown"
    content   = "Cloud Tasks → queue reminders → its attempts, and rud-api's logs for /internal/tasks/fire. A 401: check INVOKER_SA_EMAIL and SERVICE_URL."
  }
}

# The daily sweep found a lost push and booked it again (steps c and d): the main path missed
# something. Once a day at most, since the sweep runs once a day.
resource "google_monitoring_alert_policy" "lost_tasks" {
  display_name          = "rud ${var.env}: the sweep repaired lost pushes"
  combiner              = "OR"
  notification_channels = local.alert_channels

  conditions {
    display_name = "sweep_repaired with rebooked above 0"
    condition_matched_log {
      filter = "${local.app_logs} AND jsonPayload.message=\"sweep_repaired\" AND jsonPayload.rebooked>0"
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = "86400s"
    }
    auto_close = "86400s"
  }

  documentation {
    mime_type = "text/markdown"
    content   = "One-off after a deploy or an outage is normal. Day after day: a push chain breaks somewhere. Look up the reminders with sweep_rebooked events (runbook in design doc 7.6)."
  }
}

# The bill. The billing account is in SEK, so the budget is too: about $5 a month (7.6).
# Mails at 50% and 100% of what this project spends, to the alert address and, as Google does by
# default, to the billing account's admins. It only warns: nothing is switched off.
resource "google_billing_budget" "monthly" {
  provider        = google.quota
  billing_account = var.billing_account
  display_name    = "rud ${var.env} monthly"

  budget_filter {
    projects = ["projects/${data.google_project.this.number}"]
    # Count spending before credits: the free-trial credit would otherwise hide a cost spike until
    # it's used up, with no mail at all.
    credit_types_treatment = "EXCLUDE_ALL_CREDITS"
  }

  amount {
    specified_amount {
      currency_code = "SEK"
      units         = tostring(var.budget_sek)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }
  threshold_rules {
    threshold_percent = 1.0
  }

  all_updates_rule {
    monitoring_notification_channels = local.alert_channels
  }
  depends_on = [google_project_service.enabled]
}
