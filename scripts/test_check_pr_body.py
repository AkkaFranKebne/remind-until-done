#!/usr/bin/env python3
"""Tests for check_pr_body.py. Run: python3 scripts/test_check_pr_body.py"""
import unittest
from pathlib import Path

import check_pr_body as c

TEMPLATE = c.TEMPLATE.read_text()
FULL = "\n".join(f"## {name}\n- something\n" for name in c.required_sections(TEMPLATE))


class CheckPrBody(unittest.TestCase):
    def test_template_has_sections(self):
        self.assertGreaterEqual(len(c.required_sections(TEMPLATE)), 5)

    def test_full_body_passes(self):
        self.assertEqual(c.problems(FULL, TEMPLATE), [])

    def test_untouched_template_fails(self):
        errors = c.problems(TEMPLATE, TEMPLATE)
        self.assertTrue(errors)
        self.assertTrue(all("is empty" in e for e in errors))

    def test_missing_section_fails(self):
        first = c.required_sections(TEMPLATE)[0]
        body = FULL.replace(f"## {first}\n- something\n", "")
        self.assertIn(f'missing section "## {first}"', c.problems(body, TEMPLATE))

    def test_comment_only_section_is_empty(self):
        first = c.required_sections(TEMPLATE)[0]
        body = FULL.replace(f"## {first}\n- something\n", f"## {first}\n<!-- todo -->\n")
        self.assertIn(f'section "## {first}" is empty', c.problems(body, TEMPLATE))

    def test_command_and_ci_use_this_script(self):
        root = Path(__file__).resolve().parent.parent
        self.assertIn("scripts/check_pr_body.py", (root / ".claude/commands/create-pr.md").read_text())
        self.assertIn("scripts/check_pr_body.py", (root / ".github/workflows/pr-check.yml").read_text())


if __name__ == "__main__":
    unittest.main()
