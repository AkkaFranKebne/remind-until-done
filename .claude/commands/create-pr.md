---
description: Open a PR for the current branch with a plain-language description that passes the CI check
---

Open a pull request for the current branch.

1. Check: on a branch (not `main`), the branch is pushed, and the checks for the changed areas pass (commands in `AGENTS.md`).
2. Write the description to a file in the scratchpad, following `.github/pull_request_template.md` exactly: every section, plain language, short sentences, bullets, frontend comparisons for new ideas. End with the Claude Code attribution line.
3. Run `python3 scripts/check_pr_body.py <file>`. If it fails, fix the description and run it again. CI runs the same script.
4. Open the PR: `gh pr create --base main --title "<title>" --body-file <file>`.
5. Report the PR URL and watch the checks (`gh pr checks <number> --watch`).
