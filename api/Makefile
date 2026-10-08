.PHONY: run test vet fmt build docker

# Start the API on http://localhost:8080
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
