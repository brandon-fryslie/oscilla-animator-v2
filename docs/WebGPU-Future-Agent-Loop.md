# WebGPU Future Agent Loop

This document defines the unattended two-agent loop for implementing the numbered `docs/WebGPU-Future/` roadmap through a dedicated `FUTURE-*` backlog:

- implementer: `PROMPT-WEBGPU-FUTURE-PROGRESS.md`
- evaluator: `PROMPT-WEBGPU-FUTURE-EVALUATOR.md`

For the generalized method behind this workflow, see:

- `docs/Spec-Constrained-Agent-Loop.md`

`// [LAW:one-source-of-truth] The active `FUTURE-*` leaf ticket plus its cited roadmap docs/specs are the only implementation authority for a run.`
`// [LAW:verifiable-goals] Every run must end with a verdict backed by local, replayable evidence.`

## Scope

Use this loop only for the implementation backlog that realizes the numbered `docs/WebGPU-Future/` roadmap in code.

This loop does not target:

- the earlier design-document tickets that produced the numbered docs
- unrelated `RECOVER-*` runtime recovery work
- opportunistic architecture cleanups outside the active `FUTURE-*` ticket

## Shared Rules

1. Loop memory lives only in:
   - the active `FUTURE-*` leaf ticket body in `lit`
   - the shared evaluator note file `session-docs/WEBGPU-FUTURE-LOOP.md`
   - git history and the current worktree
2. Work on exactly one `FUTURE-*` leaf ticket per run.
3. The evaluator note is a hard ticket lock, not advisory queue metadata.
4. Earlier prerequisite leaf tickets preempt later ones immediately if reopened or invalidated.
5. The worktree must be clean at the end of every run.
6. The loop must preserve all previously accepted proof baselines unless the active ticket explicitly owns a temporary regression.
7. The loop must not treat unimplemented proof seams as permission to guess. If proof is missing, building the smallest proof seam is part of the ticket.

`// [LAW:dataflow-not-control-flow] Advancement through the roadmap happens by explicit ticket state and verifier state transitions, not by ad hoc “this seems next” control flow.`

## Filesystem Note

The evaluator owns one shared note file:

- `session-docs/WEBGPU-FUTURE-LOOP.md`

The implementer reads it before choosing or continuing work.

`// [LAW:one-source-of-truth] The evaluator note is the canonical run-to-run steering artifact.`

## Baselines

This loop has a growing proof ladder.

### Baseline 0: Render Liveness

The existing first-triangle WebGPU path remains alive.

### Baseline 1: Canonical Scene Submission

Once `FUTURE-01` and `FUTURE-03` land, the loop must preserve proof that a scene can reach:

`RenderPrimitive[] + RenderView -> SceneRenderSink -> RenderPrepare -> DrawQueueBuilder -> render`

### Baseline 2: Legacy Compatibility

Once the compatibility seam is accepted, the loop must preserve proof that selected legacy patches render through the canonical boundary rather than a legacy renderer path.

### Baseline 3: Canonical Authoring MVP

Once the MVP authoring surface is accepted, the loop must preserve proof that canonical authoring data lowers to canonical scene submission and reaches visible output.

The evaluator note should record which of these baselines were replayed during a run.

## Proof Ladders By Ticket Family

The required proof depends on the active ticket.

### Render Boundary / Compatibility Tickets

Minimum expected proof ladder:

1. static checks (`typecheck`, targeted tests, build as needed)
2. contract proof for canonical scene submission or adapter output
3. runtime or readback proof that the canonical path is the live path
4. replay of the last accepted visible render baseline

### Patch / Authoring Model Tickets

Minimum expected proof ladder:

1. schema / compiler / lowering tests
2. proof that canonical patch data lowers to `RenderPrimitive[] + RenderView`
3. proof that no renderer transport concepts leak upward
4. replay of the last accepted render baseline if the live path is touched

### UI Tickets

Minimum expected proof ladder:

1. static checks
2. targeted UI/component/editor tests
3. deterministic browser/UI smoke for the changed workflow when local automation exists
4. replay of the last accepted compiler/render baseline that the UI depends on

### Simulation Tickets

Minimum expected proof ladder:

1. simulation contract tests
2. proof that simulation-owned domains feed scene assembly through the canonical bridge
3. visible or readback proof for the new path when the render/runtime path changes
4. replay of all earlier accepted baselines

## Dirty Tree Normalization

Normalize before normal work:

1. abort safe half-finished git operations such as `git revert --abort`
2. if the dirty changes are clearly the current role's in-scope work and can be completed safely, continue
3. otherwise stash unknown or out-of-scope changes with a descriptive message
4. do not begin normal work until `git status --short` is clean

## Implementer Contract

The implementer:

1. chooses the active `FUTURE-*` leaf ticket
2. reads `session-docs/WEBGPU-FUTURE-LOOP.md` before choosing or continuing work
3. works only inside the active ticket boundary
4. may try bounded alternative implementations inside the same ticket
5. must verify the ticket’s acceptance criteria locally
6. must never close the active `FUTURE-*` ticket
7. must leave a clean tree and a commit when repo state changed
8. must not advance past the evaluator note lock
9. must not work a later leaf ticket while an earlier prerequisite ticket is open
10. must re-prove accepted baselines after touching a live-path boundary

## Evaluator Contract

The evaluator:

1. identifies the `FUTURE-*` ticket that owns current repo state
2. replays enough verification to judge the work independently
3. audits whether the proof actually proves the intended behavior
4. chooses one bounded verdict
5. writes the evaluator note
6. owns `FUTURE-*` ticket closure when the verdict is `accept-complete`
7. may revert isolated bad implementation commits with `git revert`
8. must leave a clean tree and a commit when repo state changed
9. must never authorize advancement while the active ticket remains open
10. must route back to the earliest violated prerequisite ticket when repo state invalidates it

`// [LAW:single-enforcer] The evaluator is the single acceptance boundary. The implementer never self-accepts.`

## Evaluator Note

The evaluator writes `session-docs/WEBGPU-FUTURE-LOOP.md` whose first line is exactly:

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

`advance-to-next-ready-ticket` is valid only when the evaluator has accepted and closed the active `FUTURE-*` ticket.

## Gates

Every run should be explainable as gates:

1. source/ticket alignment
2. dependency/prerequisite alignment
3. ownership alignment
4. live-path alignment
5. static verification
6. behavior verification
7. runtime or UI verification when relevant
8. baseline preservation
9. clean closeout

If a gate fails because the implementation choice was bad, retry is allowed inside the same ticket.

If a gate fails because the ticket boundary is wrong, proof is missing, or a prerequisite is incomplete, block instead of improvising.

## Ticket Taxonomy

The loop should operate on one explicit implementation chain:

- one `FUTURE-EPIC` container
- ordered `FUTURE-*` leaf tickets that correspond to the numbered roadmap phases and compatibility bridge

Do not use this loop on the earlier design-doc tickets with empty or document-authoring titles. Those are not the implementation backlog.

## Recommended Work Order

The expected implementation order for the loop is:

1. freeze the canonical render boundary
2. build the legacy compatibility adapter
3. prove legacy patches through the canonical boundary
4. implement the canonical patch root/compiler path
5. enforce the canonical authoring model
6. harden guardrails mechanically
7. implement the render-only MVP authoring surface
8. build the MVP authoring UI
9. add simulation authoring
10. extend the UI for simulation

`// [LAW:one-way-deps] This order keeps dependencies flowing downward into `SceneRenderSink` and prevents UI or simulation work from defining renderer boundaries.`
