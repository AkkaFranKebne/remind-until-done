terraform {
  required_version = ">= 1.6"

  required_providers {
    google      = { source = "hashicorp/google", version = "~> 6.0" }
    google-beta = { source = "hashicorp/google-beta", version = "~> 6.0" }
  }

  # Bucket and prefix are passed with -backend-config (see README)
  backend "gcs" {}
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# For the APIs that need a project to bill their quota to when you apply with your own login (ADC):
# the Budget API (monitoring.tf) and the API Keys API (firebase.tf). Only resources that name this
# alias use it, so nothing else changes how it calls Google.
provider "google" {
  alias                 = "quota"
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
}

# This project's number (the budget filters by it).
data "google_project" "this" {}
