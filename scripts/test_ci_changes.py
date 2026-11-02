#!/usr/bin/env python3
"""Tests for ci_changes.py. Run: python3 scripts/test_ci_changes.py"""
import subprocess
import sys
import unittest
from pathlib import Path

import ci_changes as c

SCRIPT = Path(__file__).with_name("ci_changes.py")


def run(*paths):
    """The jobs that run, as a sorted list."""
    return sorted(job for job, yes in c.needed(paths).items() if yes)


class CiChanges(unittest.TestCase):
    def test_web_only(self):
        self.assertEqual(run("web/src/app.tsx"), ["semgrep", "web"])

    def test_api_only(self):
        self.assertEqual(run("api/internal/httpapi/router.go"), ["api", "semgrep"])

    def test_migration_is_api(self):
        self.assertEqual(run("api/db/migrations/V3__x.sql"), ["api", "semgrep"])

    def test_infra_only(self):
        self.assertEqual(run("infra/main.tf"), ["infra", "semgrep"])

    def test_swagger_runs_api_and_web(self):
        self.assertEqual(run("api/swagger.json"), ["api", "semgrep", "web"])

    def test_docs_only_runs_no_code_jobs(self):
        self.assertEqual(run("AGENTS.md", "web/AGENTS.md", ".claude/agents/designer.md"), [])

    def test_claude_settings_are_docs(self):
        self.assertEqual(run(".claude/settings.json"), [])

    def test_docs_next_to_code_still_run_the_code_job(self):
        self.assertEqual(run("web/AGENTS.md", "web/src/app.tsx"), ["semgrep", "web"])

    def test_deploy_workflow_runs_semgrep_only(self):
        self.assertEqual(run(".github/workflows/deploy.yml"), ["semgrep"])

    def test_ci_workflow_runs_everything(self):
        self.assertEqual(run(".github/workflows/ci.yml"), ["api", "infra", "semgrep", "web"])

    def test_this_script_runs_everything(self):
        self.assertEqual(run("scripts/ci_changes.py"), ["api", "infra", "semgrep", "web"])

    def test_root_makefile_and_compose_are_api(self):
        self.assertEqual(run("Makefile"), ["api", "semgrep"])
        self.assertEqual(run("docker-compose.yml"), ["api", "semgrep"])

    def test_nvmrc_is_web(self):
        self.assertEqual(run(".nvmrc"), ["semgrep", "web"])

    def test_folder_prefix_needs_the_slash(self):
        self.assertEqual(run("webpack-notes.txt"), ["semgrep"])

    def test_empty_entries_ignored(self):
        self.assertEqual(run("", ""), [])

    def test_trailing_space_is_not_markdown(self):
        self.assertEqual(run("web/src/x.md "), ["semgrep", "web"])

    def test_newline_inside_a_nul_separated_name(self):
        out = subprocess.run(
            [sys.executable, str(SCRIPT)], input=b"web/src/a.md\nb.ts\0", capture_output=True, check=True
        ).stdout.decode()
        self.assertIn("web=true", out)

    def test_non_ascii_name(self):
        self.assertEqual(run("web/src/é.ts"), ["semgrep", "web"])

    def test_rename_out_of_code_runs_the_code_job(self):
        # git diff --no-renames lists a rename as the old and the new path.
        self.assertEqual(run("api/internal/auth.go", "notes.md"), ["api", "semgrep"])

    def test_stdin_nul_separated_raw_bytes(self):
        out = subprocess.run(
            [sys.executable, str(SCRIPT)],
            input="notes.md\0web/src/é.ts\0".encode(),
            capture_output=True,
            check=True,
        ).stdout.decode()
        self.assertEqual(out, "web=true\napi=false\ninfra=false\nsemgrep=true\n")

    def test_stdin_newline_separated(self):
        out = subprocess.run(
            [sys.executable, str(SCRIPT)], input=b"infra/main.tf\n", capture_output=True, check=True
        ).stdout.decode()
        self.assertIn("infra=true", out)

    def test_output_format(self):
        self.assertEqual(c.needed(["infra/x.tf"]), {"web": False, "api": False, "infra": True, "semgrep": True})


if __name__ == "__main__":
    unittest.main()
