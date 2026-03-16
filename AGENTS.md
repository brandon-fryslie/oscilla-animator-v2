# AGENTS.md — Repository Workflow Rules

## Issue Workflow (GitHub Project + PR Review)

Use this workflow for each implementation ticket in project `oscilla work items`:

1. Start ticket:
   - Move the issue to `Status: Design`.
2. Design proposal:
   - Post a design comment on the issue before writing implementation code.
   - The comment must include scope, touched files/modules, invariants/contracts, validation plan, and explicit dependency assumptions.
3. Design acceptance gate:
   - Do not begin implementation until design acceptance is confirmed on the issue.
4. Implementation start:
   - Move the issue to `Status: In progress`.
   - Implement exactly what was accepted in design.
5. PR creation:
   - Open a PR as soon as implementation is in reviewable shape.
6. Copilot/code review handling:
   - Wait for Copilot review and human review feedback.
   - For each review thread, comment before making changes with the proposed resolution approach (or explicit reason for no change).
   - After pushing changes, add a follow-up comment describing exactly how the thread was addressed.
   - Do not resolve review threads; leave them open for user resolution or follow-up requests.
7. Checks and regressions:
   - Wait for required checks and address every failing check before requesting final review.
8. Ready-for-review handoff:
   - When review feedback is addressed and checks are green, move the issue to `Status: Ready to Merge` and notify the user.

// [LAW:single-enforcer] This file is the single enforcement boundary for ticket-state/review-thread handling.
// [LAW:verifiable-goals] State transitions, issue comments, review thread comments, PR status, and check results are deterministic evidence.
// [LAW:one-source-of-truth] Project `Status` + issue/PR timeline are the canonical workflow record.

<!-- BEGIN LINKS INTEGRATION -->
## links Agent-Native Workflow

This repository is configured for agent-native issue tracking with `lit`.

Session bootstrap (every session / after compaction):
1. Run `lit quickstart`.

Work acquisition:
1. Use the issue ID already assigned in context when present.
2. Check current ready work with `lit ready`.
3. For significant , create one with `lit new ...`.
4. Mark work in progress with `lit update <issue-id> --status in_progress` (or `lit start ...`).
5. Record work start with `lit comment add <issue-id> --body "Starting: <plan>"`.

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
