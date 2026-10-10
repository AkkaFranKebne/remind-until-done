#!/usr/bin/env python3
"""Turns a Postgres URL (Neon's format) into Flyway's settings.

Neon gives:   postgresql://user:password@ep-x-pooler.eu-central-1.aws.neon.tech/rud?sslmode=require
Flyway needs: FLYWAY_URL=jdbc:postgresql://ep-x.eu-central-1.aws.neon.tech/rud?sslmode=require
              FLYWAY_USER=user
              FLYWAY_PASSWORD=password

- The URL is read from stdin, never from the command line, so it doesn't show up in the
  list of running processes.
- "-pooler" is removed from the host: migrations use Neon's direct connection (design doc 6.5).
- Only sslmode is kept from the query (the Java driver doesn't know Neon's other options).

Used by deploy.yml. Usage:
  printf '%s' "$DATABASE_URL" | scripts/to_jdbc.py
"""
import sys
from urllib.parse import parse_qs, unquote, urlsplit


def to_flyway(url: str) -> dict[str, str]:
    parts = urlsplit(url.strip())
    if parts.scheme not in ("postgres", "postgresql"):
        raise ValueError("not a postgres:// or postgresql:// URL")
    if not parts.hostname or not parts.username or parts.password is None:
        raise ValueError("the URL needs a user, a password and a host")
    database = parts.path.lstrip("/")
    if not database:
        raise ValueError("the URL needs a database name")

    first, dot, rest = parts.hostname.partition(".")
    host = first.removesuffix("-pooler") + dot + rest
    port = f":{parts.port}" if parts.port else ""
    sslmode = parse_qs(parts.query).get("sslmode", ["require"])[0]

    settings = {
        "FLYWAY_URL": f"jdbc:postgresql://{host}{port}/{database}?sslmode={sslmode}",
        "FLYWAY_USER": unquote(parts.username),
        "FLYWAY_PASSWORD": unquote(parts.password),
    }
    if any(c in v for v in settings.values() for c in "\r\n"):
        raise ValueError("the URL contains a line break")
    return settings


def main() -> int:
    try:
        settings = to_flyway(sys.stdin.read())
    except ValueError as e:
        # Never print the URL itself: it contains the password.
        print(f"to_jdbc: {e}", file=sys.stderr)
        return 1
    for key, value in settings.items():
        print(f"{key}={value}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
