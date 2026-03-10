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
