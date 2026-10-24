.PHONY: run test vet fmt build docker fire

# Your personal local settings, not in git (.gitignore has .env.*). For example:
#   ALLOWED_EMAILS=you@gmail.com
-include .env.local
export ALLOWED_EMAILS

# Local sign-in uses the dev Firebase project (design doc decision 32).
export GCP_PROJECT ?= rud-dev-4f7k2

# Locally nothing signs Google ID tokens, so /internal/* is open (the API refuses this in dev and prod).
export INTERNAL_AUTH ?= off

# Cloud Tasks can't call a laptop, so locally pushes are only logged (the API refuses this in dev and prod).
export SCHEDULER ?= log

# Locally pushes are only logged. To send real ones to your phone: make run PUSH= (needs
# gcloud auth application-default login with access to the dev project).
export PUSH ?= log

# Start the API on http://localhost:8080 (local database: make db-up migrate in the repo root)
run:
	go run ./cmd/api

# Do what Cloud Tasks would: fire push N of a reminder (the API log shows each booked task).
#   make fire ID=<reminder id> V=<version> N=<push number, 0 = first>
fire:
	@test -n "$(ID)" -a -n "$(V)" -a -n "$(N)" || (echo "usage: make fire ID=<reminder id> V=<version> N=<push number>" && exit 1)
	curl -sS -i -X POST http://localhost:$${PORT:-8080}/internal/tasks/fire \
	  -H "Authorization: Bearer local" -H "Content-Type: application/json" \
	  -d '{"reminderId":"$(ID)","version":$(V),"n":$(N)}'

test:
	go test ./...

vet:
	go vet ./...

# Fails if any file is not gofmt-formatted
fmt:
	@test -z "$$(gofmt -l .)" || (gofmt -l . && exit 1)

build:
	CGO_ENABLED=0 go build -o bin/api ./cmd/api

docker:
	docker build -t rud-api .
