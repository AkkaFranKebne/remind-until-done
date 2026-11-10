variable "project_id" {
  type        = string
  description = "GCP / Firebase project ID"
}

variable "region" {
  type        = string
  description = "Region for Cloud Run and Artifact Registry. europe-west3 = Frankfurt, next to the Neon database. Not Stockholm (europe-north2): Firebase Hosting cannot rewrite /api to Cloud Run there."
  default     = "europe-west3"
}

variable "tasks_region" {
  type        = string
  description = "Region for the Cloud Tasks queue (Frankfurt, same as the API). Tasks carry only ids, no personal data"
  default     = "europe-west3"
}

variable "scheduler_region" {
  type        = string
  description = "Region for the Cloud Scheduler job (Frankfurt, same as the API)"
  default     = "europe-west3"
}

variable "env" {
  type        = string
  description = "dev or prod"
  validation {
    condition     = contains(["dev", "prod"], var.env)
    error_message = "env must be dev or prod."
  }
}

variable "image" {
  type        = string
  description = "Initial container image; CI deploys newer ones"
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "service_url" {
  type        = string
  description = "Cloud Run URL, used as OIDC audience. Use the predictable form https://rud-api-<project number>.<region>.run.app"
  default     = ""
}

variable "max_instances" {
  type    = number
  default = 2
}

variable "github_repo" {
  type        = string
  description = "GitHub repository allowed to deploy, as owner/name"
}

variable "github_repository_id" {
  type        = string
  description = "Numeric id of the GitHub repository (gh api repos/OWNER/NAME -q .id)"
}

variable "github_owner_id" {
  type        = string
  description = "Numeric id of the GitHub repository owner (gh api repos/OWNER/NAME -q .owner.id)"
}

variable "firebase_browser_key_uid" {
  type        = string
  description = "UID of the project's \"Browser key (auto created by Firebase)\" (gcloud services api-keys list): the key the Web App, and so init.json, uses. A UID, not the key itself."
}

variable "alert_email" {
  type        = string
  description = "Where budget and monitoring alerts are mailed. Personal, so it lives in envs/<env>.local.tfvars (git-ignored), not in the repo."
}

variable "billing_account" {
  type        = string
  description = "Billing account id (gcloud billing projects describe <project>), for the budget. In envs/<env>.local.tfvars (git-ignored)."
}

variable "budget_sek" {
  type        = number
  description = "Monthly budget for this project, in SEK (the billing account's currency): about $5 (design doc 7.6). Mails at 50% and 100%; nothing is switched off."
  default     = 50
}
