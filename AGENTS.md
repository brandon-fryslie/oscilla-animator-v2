# AGENTS.md — Repository Workflow Rules

## PR Review Workflow

1. Open a PR as soon as implementation is in reviewable shape.
2. Wait for Copilot review and human review feedback.
3. For each review thread, comment before making changes with the proposed resolution approach or the explicit reason for no change.
4. After pushing changes, add a follow-up comment describing exactly how the thread was addressed.
5. Do not resolve review threads; leave them open for user resolution or follow-up requests.
6. Wait for required checks and address every failing check before requesting final review.
7. When review feedback is addressed and checks are green, notify the user.

// [LAW:single-enforcer] This file is the single enforcement boundary for PR review-thread handling.
// [LAW:verifiable-goals] Review thread comments, PR status, and check results are deterministic evidence.
// [LAW:one-source-of-truth] The PR timeline and review threads are the canonical review record.

<!-- BEGIN LINKS INTEGRATION -->
## links Agent-Native Workflow

This repository is configured for agent-native issue tracking with `lit`.

Session bootstrap (every session / after compaction):
1. Run `lit quickstart`.

Work acquisition:
1. Use the issue ID already assigned in context when present.
2. Check current ready work with `lit ready`.
3. Create a new issue only for an independent app work item that needs its own tracking.
4. Do not create a new issue for small tweaks, doc wording changes, prompt edits, minor cleanups, or a few-line changes. Fold that work into an existing issue when one already owns it, or commit it directly without opening a ticket.
5. Mark work in progress with `lit update <issue-id> --status in_progress` (or `lit start ...`) only when an issue already exists for the work.
6. Record work start with `lit comment add <issue-id> --body "Starting: <plan>"` only when an issue already exists for the work.

Execution:
- Prefer `--json` on reads and writes.
- Keep structure current with `lit parent` / `lit dep` / `lit label` / `lit comment`.

Closeout:
1. Add implementation summary comments as work progresses and when the PR reaches reviewable shape.
2. You MUST create a git commit for the work before starting the next issue: `git add -A && git commit -m "<summary>"`.
3. Do not close the issue at local implementation or commit time. Keep it open through review/checks and move it to `Status: Ready to Merge` when that workflow is satisfied.
4. Work is complete only after the change is merged into `master`; close the issue then with `lit close <issue-id> --reason "<merge summary>"`.

Traceability:
- `git push` triggers hook-driven `lit sync push` attempts (warn-only on failure).
- On failure, follow command remediation output; do not invent hidden fallback behavior.

<!-- END LINKS INTEGRATION -->
