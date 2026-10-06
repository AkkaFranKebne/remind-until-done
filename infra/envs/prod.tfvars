project_id = "rud-prod-4f7k2" # Permanent: it becomes the app URL https://<project_id>.web.app
env        = "prod"
region     = "europe-north2" # Stockholm: Cloud Run, Artifact Registry
# tasks_region     = "europe-west1"   # Cloud Tasks queue
# scheduler_region = "europe-west1"   # Cloud Scheduler job
github_repo = "AkkaFranKebne/remind-until-done"
service_url = "https://rud-api-q623gdpgbq-ma.a.run.app" # api_url output from the first apply
