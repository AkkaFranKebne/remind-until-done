# Local development shortcuts (design doc 6.7). Needs Docker Desktop running.
.PHONY: db-up db-down db-reset migrate db-info psql api

# Start the local Postgres (docker-compose.yml) and wait until it accepts connections
db-up:
	docker compose up -d --wait db

db-down:
	docker compose down

# Delete the local database and start again from an empty one
db-reset:
	docker compose down -v
	$(MAKE) db-up migrate

# Apply the migrations in api/db/migrations that this database doesn't have yet
migrate:
	docker compose run --rm flyway migrate

# Show which migrations are applied
db-info:
	docker compose run --rm flyway info

# SQL prompt on the local database
psql:
	docker compose exec db psql -U rud -d rud

# Start the API on http://localhost:8080 (uses the local database)
api:
	$(MAKE) -C api run
