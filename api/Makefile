.PHONY: run test vet fmt build docker

# Your personal local settings, not in git (.gitignore has .env.*). For example:
#   ALLOWED_EMAILS=you@gmail.com
-include .env.local
export ALLOWED_EMAILS

# Local sign-in uses the dev Firebase project (design doc decision 32).
export GCP_PROJECT ?= rud-dev-4f7k2

# Start the API on http://localhost:8080 (local database: make db-up migrate in the repo root)
run:
	go run ./cmd/api

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
