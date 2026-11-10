#!/usr/bin/env python3
"""Tests for to_jdbc.py. Run: python3 scripts/test_to_jdbc.py"""
import unittest

import to_jdbc as t

NEON = "postgresql://rud_owner:s3cret@ep-cool-name-123-pooler.eu-central-1.aws.neon.tech/rud?sslmode=require&channel_binding=require"


class ToJdbc(unittest.TestCase):
    def test_neon_url(self):
        self.assertEqual(
            t.to_flyway(NEON),
            {
                "FLYWAY_URL": "jdbc:postgresql://ep-cool-name-123.eu-central-1.aws.neon.tech/rud?sslmode=verify-full&sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory",
                "FLYWAY_USER": "rud_owner",
                "FLYWAY_PASSWORD": "s3cret",
            },
        )

    def test_direct_host_stays_as_is(self):
        url = NEON.replace("-pooler", "")
        self.assertIn("//ep-cool-name-123.eu-central-1", t.to_flyway(url)["FLYWAY_URL"])

    def test_port_kept(self):
        s = t.to_flyway("postgres://u:p@localhost:5433/rud")
        self.assertEqual(s["FLYWAY_URL"], f"jdbc:postgresql://localhost:5433/rud?{t.VERIFY_FULL}")

    def test_percent_encoded_password_is_decoded(self):
        self.assertEqual(t.to_flyway("postgres://u:a%40b%2Fc@h/rud")["FLYWAY_PASSWORD"], "a@b/c")

    def test_trailing_newline_is_ignored(self):
        self.assertEqual(t.to_flyway(NEON + "\n")["FLYWAY_PASSWORD"], "s3cret")

    def test_tls_is_always_verify_full_whatever_the_url_says(self):
        for mode in t.SSL_MODES:
            with self.subTest(mode=mode):
                url = t.to_flyway(f"postgres://u:p@h/rud?sslmode={mode}")["FLYWAY_URL"]
                self.assertTrue(url.endswith("?" + t.VERIFY_FULL), url)

    def test_bad_urls_are_refused(self):
        for bad in [
            "mysql://u:p@h/rud",
            "postgres://h/rud",
            "postgres://u@h/rud",
            "postgres://u:p@h/",
            "postgres://u:a%0Ab@h/rud",
            "postgres://u:@h/rud",  # empty password
            "postgres://u:p@h/rud?sslmode=require%26socketFactory%3Dx.Y",  # extra driver setting
            "postgres://u:p@h/rud?sslmode=allow",  # not encrypted
            "postgres://u:p@h/rud%3Fssl%3Dfalse",  # setting hidden in the name
            "postgres://u:p@h/r/u/d",
            "postgres://u:p@[::1]/rud",  # IPv6 isn't needed for Neon
        ]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                t.to_flyway(bad)


if __name__ == "__main__":
    unittest.main()
