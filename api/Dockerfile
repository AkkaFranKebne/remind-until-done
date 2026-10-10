# Build stage: compile a static binary.
FROM golang:1.27 AS build
WORKDIR /src
# Dependencies first, so this layer is reused while only our code changes.
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

# Run stage: a minimal image with no shell, running as a non-root user.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/api /api
# Cloud Run injects PORT; the app listens on it (default 8080).
ENTRYPOINT ["/api"]
