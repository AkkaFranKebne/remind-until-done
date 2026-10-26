#!/usr/bin/env python3
"""Decides which CI jobs a pull request needs, from the files it changes.

GitHub Free gives a private repo 2,000 Actions minutes a month. A PR that only changes
web/ doesn't need the api job (Go tests, Postgres in Docker, image build), and a PR that
only changes docs needs none of the code jobs.

Reads the changed paths from stdin, separated by NUL (or by newlines when there is no NUL), and prints one
"<job>=true|false" line per job, for $GITHUB_OUTPUT. It never prints a path. The secrets
scan isn't here: it always runs, because a secret can hide in any file.

Give it the paths raw, with renames split into a delete and an add. Otherwise git lists
only a rename's new name (code moved to notes.md would look like docs) and quotes unusual
names ("web/\303\251.ts" doesn't start with web/). Used by ci.yml. Usage:
  git -c core.quotePath=false diff --no-renames -z --name-only main | scripts/ci_changes.py
"""
import sys

# A change here runs every job: it changes how CI itself works.
EVERYTHING = ("scripts/ci_changes.py", ".github/workflows/ci.yml")

# Files only people and agents read. They never run the code jobs, even inside web/ or api/.
DOCS_DIRS = (".claude/", ".zed/")

# What each job checks. A path ending in "/" is a folder.
JOBS = {
    # The web client is generated from api/swagger.json, so a contract change rebuilds it.
    "web": ("web/", "api/swagger.json", ".nvmrc"),
    "api": ("api/", "docker-compose.yml", "Makefile", "scripts/to_jdbc.py", "scripts/test_to_jdbc.py"),
    "infra": ("infra/",),
}


def is_doc(path):
    return path.endswith(".md") or path.startswith(DOCS_DIRS)


def matches(path, patterns):
    return any(path.startswith(p) if p.endswith("/") else path == p for p in patterns)


def needed(paths):
    paths = [p for p in paths if p]  # names are raw: "a.md " with a space is not Markdown
    if any(p in EVERYTHING for p in paths):
        return {job: True for job in (*JOBS, "semgrep")}
    code = [p for p in paths if not is_doc(p)]
    jobs = {job: any(matches(p, patterns) for p in code) for job, patterns in JOBS.items()}
    # Semgrep also scans workflows, scripts and Dockerfiles: any code or config change.
    jobs["semgrep"] = bool(code)
    return jobs


def main():
    raw = sys.stdin.buffer.read().decode("utf-8", errors="surrogateescape")
    # With -z a name may contain a newline, so only NUL separates. Typed by hand: newlines.
    paths = raw.split("\0") if "\0" in raw else raw.splitlines()
    for job, run in needed(paths).items():
        print(f"{job}={'true' if run else 'false'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
