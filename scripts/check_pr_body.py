#!/usr/bin/env python3
"""Checks that a PR description has every section from .github/pull_request_template.md.

The same check runs in CI (.github/workflows/pr-check.yml) and in the /create-pr
command (.claude/commands/create-pr.md). The template is the only list of sections.

Usage:
  scripts/check_pr_body.py body.md         # check a file
  scripts/check_pr_body.py --event         # check the PR body from $GITHUB_EVENT_PATH (CI)
"""
import json
import os
import re
import sys
from pathlib import Path

TEMPLATE = Path(__file__).resolve().parent.parent / ".github" / "pull_request_template.md"


def required_sections(template: str) -> list[str]:
    return re.findall(r"^## (.+?)\s*$", template, flags=re.MULTILINE)


def section_bodies(body: str) -> dict[str, str]:
    """Maps each '## Heading' to the text under it, until the next '## '."""
    parts = re.split(r"^## (.+?)\s*$", body, flags=re.MULTILINE)
    return {parts[i].strip(): parts[i + 1] for i in range(1, len(parts) - 1, 2)}


def has_content(text: str) -> bool:
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)  # template hints don't count
    # Lines that are only a bullet marker ("-", "*") are the empty template placeholders.
    lines = [line.strip() for line in text.splitlines()]
    return any(line and line not in ("-", "*") for line in lines)


def problems(body: str, template: str) -> list[str]:
    found = section_bodies(body)
    errors = []
    for name in required_sections(template):
        if name not in found:
            errors.append(f'missing section "## {name}"')
        elif not has_content(found[name]):
            errors.append(f'section "## {name}" is empty')
    return errors


def main() -> int:
    if sys.argv[1:] == ["--event"]:
        event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
        body = event["pull_request"].get("body") or ""
    elif len(sys.argv) == 2:
        body = Path(sys.argv[1]).read_text()
    else:
        print(__doc__)
        return 2

    errors = problems(body, TEMPLATE.read_text())
    if errors:
        print("PR description check failed:")
        for e in errors:
            print(f"  - {e}")
        print(f"Required sections come from {TEMPLATE.relative_to(TEMPLATE.parent.parent)}.")
        return 1
    print("PR description check passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
