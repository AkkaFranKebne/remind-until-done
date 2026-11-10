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

# The browser key (auto created by Firebase): its apiKey is public by design, in
# /__/firebase/init.json and in every browser's network tab. So what protects it is where it may be
# used and for what. Before M7 it had neither: any website could use it for 27 APIs, some of them
# paid (firebasevertexai, firebaseml, sqladmin). Now (decision 86): only our own sites, and only
# the 4 APIs the app calls with it. Imported, like the Hosting site: Firebase made it, and the Web
# App above points at it.
import {
  to = google_apikeys_key.browser
  id = "projects/${var.project_id}/locations/global/keys/${var.firebase_browser_key_uid}"
}

locals {
  # Where the key may be used (the browser sends the page's address as Referer). The web.app site
  # is the app; firebaseapp.com is the project's other Hosting address, where Firebase's sign-in
  # helper pages can also live. Dev also allows the local dev server (npm run dev signs in to dev).
  browser_key_referrers = concat(
    ["https://${var.project_id}.web.app/*", "https://${var.project_id}.firebaseapp.com/*"],
    var.env == "dev" ? ["https://localhost:5173/*"] : [],
  )
  # What the app calls with it, and nothing else.
  browser_key_apis = [
    "identitytoolkit.googleapis.com",       # Google sign-in (Firebase Auth)
    "securetoken.googleapis.com",           # refreshing the sign-in token every hour
    "firebaseinstallations.googleapis.com", # FCM getToken registers the browser here first
    "fcmregistrations.googleapis.com",      # ... then gets the push token here
  ]
}

resource "google_apikeys_key" "browser" {
  provider     = google.quota
  name         = var.firebase_browser_key_uid
  display_name = "Browser key (auto created by Firebase)"

  restrictions {
    browser_key_restrictions {
      allowed_referrers = local.browser_key_referrers
    }
    dynamic "api_targets" {
      for_each = local.browser_key_apis
      content {
        service = api_targets.value
      }
    }
  }

  lifecycle {
    # Sign-in and every phone's push registration use this key: never delete or replace it.
    prevent_destroy = true
  }
}
