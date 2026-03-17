# WebGPU Future Agent Loop

This document defines the unattended two-agent loop for implementing the numbered `docs/WebGPU-Future/` roadmap through a dedicated `FUTURE-*` backlog:

- implementer: `PROMPT-WEBGPU-FUTURE-PROGRESS.md`
- evaluator: `PROMPT-WEBGPU-FUTURE-EVALUATOR.md`

For the generalized method behind this workflow, see:

- `docs/Spec-Constrained-Agent-Loop.md`
- `docs/WebGPU-Future/10-IMPLEMENTATION-PROOF-MATRIX.md`

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
   - the active `FUTURE-*` leaf ticket body in `lnks`
   - the shared evaluator note file `session-docs/WEBGPU-FUTURE-LOOP.md`
   - git history and the current worktree
2. Work on exactly one `FUTURE-*` leaf ticket per run.
3. The evaluator note is a hard ticket lock, not advisory queue metadata.
4. Earlier prerequisite leaf tickets preempt later ones immediately if reopened or invalidated.
5. The worktree must be clean at the end of every run.
6. The loop must preserve all previously accepted proof baselines unless the active ticket explicitly owns a temporary regression.
7. The loop must not treat unimplemented proof seams as permission to guess. If proof is missing, building the smallest proof seam is part of the ticket.
8. Acceptance proof requirements come only from `docs/WebGPU-Future/10-IMPLEMENTATION-PROOF-MATRIX.md`. Tickets and prompts may reference proof IDs, but they must not narrow acceptance to one exact verifier command or weaker local substitute.
9. `lnks ready` is informative, not authoritative. The active `FUTURE-*` leaf ticket plus the evaluator note own selection.
10. Non-`FUTURE-*` issues may coexist in the tracker, but they do not own numbered WebGPU-Future roadmap seams unless the evaluator explicitly routes work to them because they own a broken accepted baseline.

`// [LAW:dataflow-not-control-flow] Advancement through the roadmap happens by explicit ticket state and verifier state transitions, not by ad hoc “this seems next” control flow.`

## Filesystem Note

The evaluator owns one shared note file:

- `session-docs/WEBGPU-FUTURE-LOOP.md`

The implementer reads it before choosing or continuing work.

`// [LAW:one-source-of-truth] The evaluator note is the canonical run-to-run steering artifact.`

## Proof Authority

The canonical capability-proof source is:

- `docs/WebGPU-Future/10-IMPLEMENTATION-PROOF-MATRIX.md`

Starting accepted baseline:

- `P-00` bootstrap static contract
- `P-01` bootstrap runtime liveness

Each accepted `FUTURE-*` ticket adds one or more new proof IDs from that matrix. Once the evaluator accepts a ticket, those proof IDs become part of the replay set for the later tickets listed in the matrix.

The evaluator note should record:

- which proof IDs were replayed
- which proof IDs were newly created or promoted to baseline
- which capability claim or verifier boundary blocked the run when verification fails

## Proof Ladders By Ticket Family

The required proof depends on the active ticket.

### Render Boundary / Compatibility Tickets

Minimum proof ladder:

1. replay `P-00`
2. replay `P-01`
3. run the owning ticket proof (`P-02`, `P-03`, or `P-04`)
4. replay any previously accepted boundary proof IDs that the matrix marks as required for this ticket

### Patch / Authoring Model Tickets

Minimum proof ladder:

1. replay `P-00`
2. replay `P-01`
3. run the owning ticket proof (`P-05`, `P-06`, or `P-07`)
4. replay previously accepted proof IDs named by the matrix for that ticket

### UI Tickets

Minimum proof ladder:

1. replay `P-00`
2. replay `P-01`
3. replay the canonical runtime proof that the UI is supposed to expose (`P-08` for `FUTURE-08`, `P-10` for `FUTURE-10`)
4. run the owning browser proof (`P-09` or `P-11`)

Browser proof is mandatory. Do not replace it with “when available” wording or manual clicks.

### Simulation Tickets

Minimum proof ladder:

1. replay `P-00`
2. replay `P-01`
3. replay `P-08` when the simulation work depends on the canonical MVP authoring slice
4. run the owning simulation proof (`P-10` or `P-11`)

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
11. must satisfy the proof-matrix capability requirements for acceptance and baseline replay
12. must treat a missing or weak verifier as ticket work to add or strengthen, not as permission to accept weaker evidence

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
11. must reject weaker proof substitutions when a matrix capability exists, while allowing a stronger or newly added verifier that satisfies the same required observables
12. must block rather than waive browser proof when `P-01`, `P-09`, or `P-11` cannot be replayed after the standardized Playwright install fallback

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

## Tracker Authority And Overlap

The active implementation backlog for this loop is:

- `FUTURE-EPIC`
- `FUTURE-01` through `FUTURE-10`

The earlier design-doc tickets are not implementation authority for this loop once they are closed or superseded.

Cross-backlog rule:

1. if an accepted `RECOVER-*` or other non-`FUTURE-*` issue is reopened because it owns a broken accepted baseline, that earlier owning issue preempts the `FUTURE-*` stream
2. otherwise, overlapping non-`FUTURE-*` work does not take ownership of the numbered WebGPU-Future roadmap seam currently held by the active `FUTURE-*` ticket

`// [LAW:one-way-deps] Ownership preemption must flow to the earliest ticket that owns the broken accepted boundary, not to whatever issue most recently touched the same files.`

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
