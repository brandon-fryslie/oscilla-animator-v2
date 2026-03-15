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

## Unattended RECOVER Loop Mode (Local-Only)

Use this workflow instead of the GitHub Project + PR Review flow only when all of the following are true:

1. The active issue is a `RECOVER-*` leaf task in `lit`.
2. The agent is executing through `PROMPT-WEBGPU-PROGRESS.md` in unattended mode.
3. GitHub project / PR / review controls are not available in the current environment.
4. The ticket body already contains `Objective`, `Position In Queue`, `Source Docs`, `Scope Guard`, `Acceptance Criteria`, and `Verification`.
5. All cited source docs and `docs/WebGPU-Complete/` specs are available locally.

Workflow:

1. Preflight acceptance gate:
   - Verify the ticket is the highest-priority ready leaf task.
   - Verify blocker tickets are resolved.
   - Verify the ticket, roadmap, numbered source docs, and cited `docs/WebGPU-Complete/` specs do not conflict on scope, canonical owner, or stage boundary.
   - If any check fails, add a blocker comment, create a blocking ticket when needed and possible, and stop. Do not implement.
2. Design baseline:
   - Post a design comment before code with scope, touched files/modules, invariants/contracts, validation plan, and dependency assumptions.
   - In this mode, the accepted design baseline is the ticket body plus its cited docs/specs.
   - The design comment may narrow file and seam choices, but it may not widen scope or contradict the cited sources.
3. Implementation start:
   - Move the issue to `Status: In progress`.
   - Implement only the accepted design baseline.
4. Verification gate:
   - Run deterministic local verification that proves the ticket's acceptance criteria.
   - If the first implementation attempt fails verification but the failure is still inside the same accepted baseline, you may try another implementation approach within the same ticket.
   - Each alternative attempt must stay within the same ticket body plus cited docs/specs, preserve the same acceptance criteria, and avoid widening scope.
   - Before each alternative attempt, record the failed approach, the failure evidence, and the next hypothesis in a ticket comment.
   - Keep the attempt budget small and explicit. Default maximum: 3 implementation attempts per ticket per run.
   - If verification is unavailable, inconclusive, contradictory, or still failing after the attempt budget is exhausted, add a blocker comment and stop. Do not close or advance.
5. Closeout:
   - Add a completion summary comment.
   - Close the completed issue.
   - Create a git commit for the completed work.
6. PR/review exception:
   - Do not fabricate GitHub project, PR, or review state in this mode.
   - Resume the standard GitHub workflow for later tasks once those controls are available again.

Companion evaluator cycle:

1. Evaluate the latest implementation state against the same leaf ticket body plus cited docs/specs.
2. Re-run the local verification needed to confirm or reject the implementation result.
3. Add a standardized `Evaluator Note` comment to the active ticket with:
   - evaluated commit
   - repo base for the next implementer run
   - verdict
   - next action
   - concrete do/avoid guidance
   - gates passed/failed
   - evidence summary
4. If the implementation is correct and the ticket is complete, the evaluator may confirm advancement to the next ready leaf ticket.
5. If the implementation is a good base but needs bounded follow-up inside the same ticket, the evaluator may direct another in-scope implementer run on the same ticket.
6. If the implementation is wrong and the bad work is isolated to a safe revert target, the evaluator may revert it with `git revert`, reopen the ticket if needed, and direct the next implementer run.
7. If the implementation cannot be judged safely or the failure is architectural/spec-level, the evaluator must block rather than improvising a new plan.
8. If the evaluator changes repo state, for example by reverting a bad implementation commit, the evaluator must create a git commit for that repo change.
9. If the evaluator only changes tracker state or leaves steering comments, do not fabricate a no-op git commit.

Evaluator constraints:

- The evaluator note is derived steering only. It cannot widen scope or override the leaf ticket body plus cited docs/specs.
- Revert only isolated bad implementation commits. Do not use destructive history edits.
- If the evaluator reopens a previously closed ticket, the note must explain why the earlier completion was rejected.

Clean-tree invariant for unattended loop runs:

1. The working tree must be clean at the end of every implementer and evaluator run.
2. A dirty tree is not a valid reason to stop the run before first normalizing repo state.
3. When the tree is dirty at startup:
   - If the local changes are clearly the current role's intended in-scope work and can be completed safely, continue.
   - Otherwise, prefer safe cleanup of in-progress git operations first, for example `git revert --abort` when a revert is half-finished.
   - Then stash unknown or out-of-scope changes with a descriptive message and continue from a clean tree.
4. Before exiting a run:
   - commit intended repo changes, or
   - stash unknown leftovers, or
   - roll back the current role's own invalid partial changes safely
5. Do not leave the repo dirty for the next agent.

// [LAW:one-source-of-truth] In unattended RECOVER mode, the accepted design baseline is the leaf ticket body plus its cited local docs/specs.
// [LAW:verifiable-goals] Unattended execution may try bounded alternative implementations, but stops when correctness still cannot be proven locally and deterministically.
// [LAW:single-enforcer] This section is the only allowed local-only substitute for the GitHub project/PR workflow above, including evaluator steering and revert authority.

<!-- BEGIN LINKS INTEGRATION -->
## links Agent-Native Workflow

This repository is configured for agent-native issue tracking with `lit`.

Session bootstrap (every session / after compaction):
1. Run `lit quickstart --json`.
2. Run `lit workspace --json`.
3. If remotes are configured, run `lit sync pull --json` (uses upstream remote when configured, otherwise the single configured remote; debug override: `LINKS_DEBUG_DOLT_SYNC_BRANCH`).

Work acquisition:
1. Use the issue ID already assigned in context when present.
2. Check current ready work with `lit ready --json`.
3. If no issue exists for the task, create one with `lit new ... --json`.
4. Mark work in progress with `lit update <issue-id> --status in_progress --json` (or `lit start ... --json`).
5. Record work start with `lit comment add <issue-id> --body "Starting: <plan>" --json`.

Execution:
- Prefer `--json` on reads and writes.
- Keep structure current with `lit parent` / `lit dep` / `lit label` / `lit comment`.

Closeout:
1. Add completion summary: `lit comment add <issue-id> --body "Done: <summary>" --json`.
2. Close completed issue: `lit close <issue-id> --reason "<completion reason>" --json`.
3. You MUST create a git commit for the completed work: `git add -A && git commit -m "<summary>"`.
4. Work is NOT complete until the commit exists. Do NOT start the next issue before committing.

Traceability:
- `git push` triggers hook-driven `lit sync push` attempts (warn-only on failure).
- On failure, follow command remediation output; do not invent hidden fallback behavior.

<!-- END LINKS INTEGRATION -->
