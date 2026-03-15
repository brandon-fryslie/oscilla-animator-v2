# WebGPU Agent Loop

This document defines the unattended two-agent loop for the `RECOVER-*` backlog:

- implementer: [PROMPT-WEBGPU-PROGRESS.md](/Users/bmf/.codex/worktrees/a1b6/oscilla-animator-v2/PROMPT-WEBGPU-PROGRESS.md)
- evaluator: [PROMPT-WEBGPU-EVALUATOR.md](/Users/bmf/.codex/worktrees/a1b6/oscilla-animator-v2/PROMPT-WEBGPU-EVALUATOR.md)

`// [LAW:one-source-of-truth] The active `RECOVER-*` leaf ticket plus its cited docs/specs are the only implementation authority.`
`// [LAW:verifiable-goals] Each run must end with a concrete verdict backed by local evidence.`

## Scope

Use this loop only for the `RECOVER-*` WebGPU migration backlog.

The loop does not replace the repo-wide workflow in [AGENTS.md](/Users/bmf/.codex/worktrees/a1b6/oscilla-animator-v2/AGENTS.md). It is a task-specific operating procedure used by the two prompt files above.

## Shared Rules

1. Loop memory lives only in:
   - the active ticket body and comments in `lit`
   - git history and the current worktree
2. The active leaf ticket plus cited docs/specs outrank everything else.
3. Evaluator guidance is steering only. It cannot widen scope or override the ticket/spec.
4. Work on exactly one `RECOVER-*` leaf ticket per run.
5. The worktree must be clean at the end of every run.

## Dirty Tree Normalization

A dirty tree is not a valid reason to stop immediately.

Normalize first:

1. Abort safe half-finished git operations when present, for example `git revert --abort`.
2. If the dirty changes are clearly the current role's in-scope work and can be completed safely, continue.
3. Otherwise stash unknown or out-of-scope changes with a descriptive message.
4. Do not begin normal work until `git status --short` is clean.

## Implementer Contract

The implementer:

1. Chooses the active leaf ticket.
2. Reads the latest valid evaluator note for that ticket, if one exists.
3. Works only inside the active ticket's accepted boundary.
4. May try bounded alternative implementations inside the same ticket.
5. Must verify the ticket's acceptance criteria locally.
6. Must leave a clean tree and a commit when repo state changed.

## Evaluator Contract

The evaluator:

1. Identifies the ticket that owns current repo state.
2. Re-runs enough verification to judge the latest implementation independently.
3. Chooses one bounded verdict.
4. Prepares the next run by leaving a structured evaluator note.
5. May safely revert isolated bad implementation commits with `git revert`.
6. Must leave a clean tree and a commit when repo state changed.

## Evaluator Note

The evaluator writes a ticket comment whose first line is exactly:

`Evaluator Note`

Required fields:

- `evaluated_commit:`
- `repo_base_for_next_run:`
- `verdict:`
- `next_action:`
- `do:`
- `avoid:`
- `gates_passed:`
- `gates_failed:`
- `evidence:`

Allowed `verdict:` values:

- `accept-complete`
- `accept-good-base`
- `revise`
- `revert-and-retry`
- `blocked`

Allowed `next_action:` values:

- `advance-to-next-ready-ticket`
- `continue-active-ticket`
- `revise-active-ticket`
- `stop-blocked`

## Gates

Every run should be explainable as gates:

1. source/ticket alignment
2. design or verdict alignment
3. static verification
4. runtime/readback verification when relevant
5. ownership/spec alignment
6. clean closeout

If a gate fails because of implementation choice, the implementer may try another bounded approach inside the same ticket.

If a gate fails because of spec mismatch, doc mismatch, missing prerequisite, missing verifier, or environment trouble, block instead of improvising.

## Reverts

The evaluator may revert only when all of the following are true:

1. The implementation is wrong enough that it should not remain as the next base.
2. The bad work is isolated to safe revert targets.
3. `git revert` can undo it without destructive history edits.

Never use destructive history edits like `git reset --hard` or `git checkout --`.
