#!/usr/bin/env python3
"""Turns a Postgres URL (Neon's format) into Flyway's settings.

Neon gives:   postgresql://user:password@ep-x-pooler.eu-central-1.aws.neon.tech/rud?sslmode=require
Flyway needs: FLYWAY_URL=jdbc:postgresql://ep-x.eu-central-1.aws.neon.tech/rud?sslmode=verify-full&sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory
              FLYWAY_USER=user
              FLYWAY_PASSWORD=password

- The URL is read from stdin, never from the command line, so it doesn't show up in the
  list of running processes.
- "-pooler" is removed from the host: migrations use Neon's direct connection (design doc 6.5).
- TLS is always verify-full: encrypted, and the certificate must be valid for the host
  (decision 86). DefaultJavaSSLFactory checks it against Java's trusted roots, which include
  Let's Encrypt (Neon's); the driver's own default wants a root.crt file instead. The URL's
  sslmode is still checked, but can't weaken this. The Java driver doesn't know Neon's other
  options, so they're dropped.
- Everything that ends up in FLYWAY_URL is checked against a strict pattern, so a crafted
  value can't add extra driver settings (some of them load code).

Used by deploy.yml. Usage:
  printf '%s' "$DATABASE_URL" | scripts/to_jdbc.py
"""
import re
import sys
from urllib.parse import parse_qs, unquote, urlsplit

SSL_MODES = {"disable", "require", "verify-ca", "verify-full"}
VERIFY_FULL = "sslmode=verify-full&sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory"
HOST = re.compile(r"[A-Za-z0-9.-]+")
DATABASE = re.compile(r"[A-Za-z0-9_-]+")


def to_flyway(url: str) -> dict[str, str]:
    parts = urlsplit(url.strip())
    if parts.scheme not in ("postgres", "postgresql"):
        raise ValueError("not a postgres:// or postgresql:// URL")
    if not parts.hostname or not parts.username or not parts.password:
        raise ValueError("the URL needs a user, a password and a host")
    if not HOST.fullmatch(parts.hostname):
        raise ValueError("the host may only contain letters, digits, dots and dashes")
    database = parts.path.lstrip("/")
    if not DATABASE.fullmatch(database):
        raise ValueError("the database name may only contain letters, digits, _ and -")

    first, dot, rest = parts.hostname.partition(".")
    host = first.removesuffix("-pooler") + dot + rest
    port = f":{parts.port}" if parts.port else ""
    sslmode = parse_qs(parts.query).get("sslmode", ["require"])[0]
    if sslmode not in SSL_MODES:
        raise ValueError(f"sslmode must be one of {sorted(SSL_MODES)}")

    settings = {
        "FLYWAY_URL": f"jdbc:postgresql://{host}{port}/{database}?{VERIFY_FULL}",
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
