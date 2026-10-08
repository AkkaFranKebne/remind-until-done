# Build stage: compile a static binary.
FROM golang:1.27 AS build
WORKDIR /src
# go.* also matches go.sum once the module has dependencies.
COPY go.* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

# Run stage: a minimal image with no shell, running as a non-root user.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/api /api
# Cloud Run injects PORT; the app listens on it (default 8080).
ENTRYPOINT ["/api"]
