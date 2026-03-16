# WebGPU Agent Loop

This document defines the unattended two-agent loop for the `RECOVER-*` backlog:

- implementer: `PROMPT-WEBGPU-PROGRESS.md`
- evaluator: `PROMPT-WEBGPU-EVALUATOR.md`

For the generalized method behind this WebGPU-specific operating procedure, see:

- `docs/Spec-Constrained-Agent-Loop.md`

`// [LAW:one-source-of-truth] The active `RECOVER-*` leaf ticket plus its cited docs/specs are the only implementation authority.`
`// [LAW:verifiable-goals] Each run must end with a concrete verdict backed by local evidence.`

## Scope

Use this loop only for the `RECOVER-*` WebGPU migration backlog.

The loop does not replace the repo-wide workflow in `AGENTS.md`. It is a task-specific operating procedure used by the two prompt files above.

## Shared Rules

1. Loop memory lives only in:
   - the active ticket body in `lit`
   - the shared evaluator note file `session-docs/WEBGPU-LOOP.md`
   - git history and the current worktree
2. The active leaf ticket plus cited docs/specs outrank everything else.
3. Evaluator guidance is steering only. It cannot widen scope or override the ticket/spec.
4. Work on exactly one `RECOVER-*` leaf ticket per run.
5. The worktree must be clean at the end of every run.
6. `session-docs/WEBGPU-LOOP.md` is also the run-to-run ticket lock. The implementer must not advance to a different leaf ticket unless that note explicitly authorizes advancement and the previously active ticket is already evaluator-closed.
7. Once the loop has an accepted visible runtime baseline, later tickets must preserve that baseline unless the active ticket explicitly allows a temporary regression.
8. If an earlier prerequisite leaf ticket is reopened, it immediately preempts later tickets and becomes the active boundary again.
9. A broken visible runtime baseline is not excused by being pre-existing. If the baseline is broken, the loop must route to the earliest ticket that owns restoring it and must not advance past that breakage.

## Filesystem Notes

`// [LAW:one-source-of-truth] Evaluator note files are the canonical loop-memory artifact for run-to-run steering.`

Use one shared file:

- `session-docs/WEBGPU-LOOP.md`

The evaluator owns writing that file. The implementer reads it when present.
The evaluator note is a hard handoff artifact, not advisory queue metadata.

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
2. Reads `session-docs/WEBGPU-LOOP.md` before choosing or continuing work.
3. Works only inside the active ticket's accepted boundary.
4. May try bounded alternative implementations inside the same ticket.
5. Must verify the ticket's acceptance criteria locally.
6. Must never close the active `RECOVER-*` ticket.
7. Must leave a clean tree and a commit when repo state changed.
8. Must treat the evaluator note as an exclusive lock on the named `active_ticket:` until the evaluator both closes that ticket and writes `next_action: advance-to-next-ready-ticket`.
9. Must not treat `lit ready` as authority to advance when an active ticket remains open.
10. Must re-prove the accepted visible runtime baseline after changing a live-path boundary unless the active ticket explicitly allows temporary regression.
11. Must not work a later leaf ticket while an earlier prerequisite leaf ticket is open.
12. Must not treat a broken accepted baseline as "out of scope because it was already broken" unless the evaluator note explicitly authorizes a ticket that owns that regression.

## Evaluator Contract

The evaluator:

1. Identifies the ticket that owns current repo state.
2. Re-runs enough verification to judge the latest implementation independently.
3. Audits whether the tests and checks actually verify the intended behavior rather than only the current implementation shape.
4. Chooses one bounded verdict.
5. Prepares the next run by leaving a structured evaluator note.
6. Owns `RECOVER-*` ticket closure when the verdict is `accept-complete`.
7. May safely revert isolated bad implementation commits with `git revert`.
8. Must leave a clean tree and a commit when repo state changed.
9. Must never authorize advancement while the active ticket remains open.
10. Must not accept or advance work that regresses the last accepted visible runtime baseline unless the active ticket explicitly allowed that regression.
11. Must reopen and preempt to the earliest violated prerequisite leaf ticket when current repo state no longer satisfies that prerequisite's boundary.
12. Must treat a broken accepted baseline as a live ownership problem, not historical trivia; if it is still broken, route to the earliest owning ticket and do not advance.

## Evaluator Note

The evaluator writes `session-docs/WEBGPU-LOOP.md` whose first line is exactly:

`Evaluator Note`

Required fields:

- `active_ticket:`
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

`advance-to-next-ready-ticket` is valid only when the evaluator has just accepted and closed the `active_ticket:`. Otherwise the active ticket remains locked for the implementer.

If tracker writes work, the evaluator may also mirror a summary to the ticket, but the filesystem note is the canonical steering artifact.

## Gates

Every run should be explainable as gates:

1. source/ticket alignment
2. design or verdict alignment
3. live-path alignment: seam/cutover tickets alter the active path required by the ticket, not only helper code
4. verification quality: checks and tests prove the intended behavior
5. static verification
6. runtime/readback verification when relevant
7. baseline liveness: previously accepted visible runtime behavior still works after later live-path changes
8. ownership/spec alignment
9. clean closeout
10. prerequisite integrity: no earlier leaf ticket has become false again in current repo state
11. explicit validation gates: any ticket/doc-required pause or validation checkpoint happened before implementation continued
12. baseline ownership: if the visible runtime baseline is broken, the run is attached to the ticket that owns repairing it rather than a later unrelated ticket

If a gate fails because of implementation choice, the implementer may try another bounded approach inside the same ticket.

If a gate fails because of spec mismatch, doc mismatch, missing prerequisite, missing verifier, or environment trouble, block instead of improvising.

## Proof Strategy

The loop must treat proof-building as part of the work.

When a ticket changes live behavior and no trustworthy verifier exists yet, the next correct step is often to create the smallest proof seam required to judge that behavior safely.

Acceptable proof-building work includes:

- adding canonical fixtures
- exposing readback or telemetry
- adding runtime probes
- adding contract tests around ownership boundaries
- turning a visible baseline into a replayable check

The loop should prefer proof ladders over single weak checks:

1. boot / no fatal failure
2. canonical fixture compiles
3. readback / indirect args / ownership signal
4. visible baseline still works

`// [LAW:verifiable-goals] A ticket is not safely complete if the loop cannot tell, mechanically, whether the intended behavior actually changed.`

## Proof Quality

Not every check is strong enough to unlock advancement.

Use this rubric:

1. **Acceptance proof**
   - required to advance
2. **Supporting signal**
   - useful but insufficient
3. **Diagnostic tool**
   - helps debug but proves nothing on its own

The evaluator should reject a proposed proof when it can still pass while the ticket is wrong, when it proves only implementation structure, or when it does not distinguish the old path from the new one.

The key test is:

> Would this check still pass if the old wrong behavior were still active?

If yes, it is not acceptance proof.

## Reverts

The evaluator may revert only when all of the following are true:

1. The implementation is wrong enough that it should not remain as the next base.
2. The bad work is isolated to safe revert targets.
3. `git revert` can undo it without destructive history edits.

Never use destructive history edits like `git reset --hard` or `git checkout --`.
