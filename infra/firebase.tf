# The Firebase Web App ("rud."). Push needs it: FCM's getToken first registers the browser with
# Firebase Installations, which needs an appId. Sign-in doesn't, so the project ran without one
# until M3. It uses the project's existing browser key, named here so Firebase can't pick
# another one: that key's apiKey is in /__/firebase/init.json, and sign-in uses it.
resource "google_firebase_web_app" "rud" {
  provider     = google-beta
  display_name = "rud."
  api_key_id   = var.firebase_browser_key_uid
  # Don't delete it with Terraform: every registered phone's push token belongs to it.
  deletion_policy = "ABANDON"
}

# The default Hosting site (created with the project, https://<project_id>.web.app), linked to
# the Web App: Hosting then puts its appId into /__/firebase/init.json, which the app reads
# (one build for dev and prod, decision 33).
import {
  to = google_firebase_hosting_site.default
  id = "projects/${var.project_id}/sites/${var.project_id}"
}

resource "google_firebase_hosting_site" "default" {
  provider = google-beta
  site_id  = var.project_id
  app_id   = google_firebase_web_app.rud.app_id

  lifecycle {
    prevent_destroy = true # the app's address; it can't be recreated with the same name
  }
}
