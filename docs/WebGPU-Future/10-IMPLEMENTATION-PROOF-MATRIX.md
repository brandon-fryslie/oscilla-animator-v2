# WebGPU-Future Capability Proof Matrix

This document defines the canonical capability claims and mechanical proof requirements for the unattended `FUTURE-*` loop.

It is the single source of truth for:

- proof IDs
- owning tickets
- capability claims
- required observable evidence
- machine-readable artifact expectations
- replay obligations

It is not the source of truth for:

- exact shell commands
- exact verifier file paths
- exact harness implementations
- exact fixture filenames, unless a named fixture is itself part of accepted product behavior

`// [LAW:one-source-of-truth] Proof identity and acceptance semantics live here once. Loop docs, prompts, and tickets should reference proof IDs and capability claims from this document instead of duplicating verifier mechanics.`
`// [LAW:verifiable-goals] Every proof below names observable consequences that a local deterministic verifier must record as pass or fail.`

## 1. Shared Rules

### Artifact Root

All proof artifacts for this loop live under:

- `artifacts/webgpu-future/`

### Proof Record Requirements

Every acceptance proof must emit machine-readable evidence.

The preferred form is a JSON file. If a proof needs multiple files, it must also emit an index JSON that records:

- `proof_id`
- `capability`
- `owner`
- `verifier_kind`
- `inputs`
- `passed`
- `observed`
- `failures`

Artifact filenames should be stable and include the proof ID, but the exact filename is not the acceptance boundary.

Representative inputs may change as the codebase evolves. The exact cases used for a run must be named in the artifact so the evaluator can replay the same coverage.

### Acceptance Discipline

A verifier is acceptable only when it would fail if the old wrong behavior were still active.

Allowed verifier kinds include:

- static contract tests
- compiler/diagnostic tests
- dependency or boundary audits
- runtime/browser automation
- render/readback probes

If no trustworthy verifier exists yet, creating the smallest verifier that produces the required observables is part of the owning ticket.

Supporting signals such as `pnpm build`, `pnpm typecheck`, screenshots, or manual clicking are useful but never sufficient on their own when a proof ID exists.

`// [LAW:behavior-not-structure] A proof must establish the required behavior or boundary, not merely preserve a convenient implementation shape.`

### Browser Proof Rules

Automated browser proof is mandatory for `P-01`, `P-09`, and `P-11`.

Manual clicking, screenshots alone, or “works on my machine” reports are never acceptance proof for those capabilities.

The repository’s standard browser harness is Playwright. If the chosen Playwright-backed verifier fails only because Chromium is missing, install it once:

```bash
pnpm exec playwright install chromium chromium-headless-shell
```

Then rerun the same browser verifier. If the rerun still fails, the ticket is blocked.

`// [LAW:single-enforcer] Browser-proof enforcement is standardized here so acceptance does not drift into local exceptions or manual waivers.`

## 2. Common Baselines

### `P-00` Bootstrap Static Contract

Owner:

- shared baseline

Capability claim:

- the bootstrap demo path and GPU compatibility boundary still compile and validate statically

Representative coverage:

- the bootstrap triangle path
- at least one additional minimal compatibility case

Required observables:

- every named case passes the static contract verifier
- compatibility checks report no regression
- the artifact records the exact cases covered

Pass conditions:

- the artifact reports `passed: true`
- zero named cases fail
- the verifier would fail if bootstrap compilation or GPU compatibility regressed

Evidence class:

- acceptance proof

Replay required:

- `FUTURE-01`
- `FUTURE-02`
- `FUTURE-03`
- `FUTURE-04`
- `FUTURE-05`
- `FUTURE-06`
- `FUTURE-07`
- `FUTURE-08`
- `FUTURE-09`
- `FUTURE-10`

### `P-01` Bootstrap Runtime Liveness

Owner:

- shared baseline

Capability claim:

- the bootstrap demo reaches a live runtime state in automated browser execution

Representative coverage:

- one canonical bootstrap URL or equivalent runtime entry that loads the bootstrap triangle path

Required observables:

- bootstrap state reaches `succeeded`
- frame advance is detected after bootstrap
- console error count is zero
- page error count is zero
- the artifact records the exact URL or input used

Pass conditions:

- the artifact reports `passed: true`
- runtime bootstrap does not stall or fail before first frame advance
- the verifier would fail if the runtime/frame-contract seam were still broken

Evidence class:

- acceptance proof

Replay required:

- `FUTURE-01`
- `FUTURE-02`
- `FUTURE-03`
- `FUTURE-04`
- `FUTURE-05`
- `FUTURE-06`
- `FUTURE-07`
- `FUTURE-08`
- `FUTURE-09`
- `FUTURE-10`

## 3. Ticket-Owned Capabilities

### `P-02` Canonical Scene Boundary Contract

Owner:

- `FUTURE-01`

Capability claim:

- one canonical scene submission boundary exists in code, centered on `RenderPrimitive`, `RenderView`, and `SceneRenderSink`, and renderer stages below extraction/prepare consume that boundary instead of legacy authoring semantics

Required observables:

- a contract-level verifier exercises the canonical scene submission types
- a boundary verifier proves renderer stages below extraction/prepare do not depend on legacy render-block or authoring-block semantics
- the artifact records which modules or boundaries were checked

Pass conditions:

- the artifact reports `passed: true`
- no forbidden dependency or interpretation path is observed below the canonical boundary
- the verifier would fail if renderer code below the boundary still required legacy block semantics

Evidence class:

- acceptance proof

Replay required after acceptance:

- `FUTURE-02`
- `FUTURE-03`
- `FUTURE-04`
- `FUTURE-07`
- `FUTURE-09`

### `P-03` Legacy Compatibility Adapter Contract

Owner:

- `FUTURE-02`

Capability claim:

- exactly one legacy compatibility adapter family translates current patch/block semantics into canonical scene submission

Representative coverage:

- representative legacy patch classes that exercise geometry, material, transform, visibility, and view translation

Required observables:

- representative legacy inputs lower into canonical `RenderPrimitive[] + RenderView`
- the translation boundary is singular and explicit
- code below `SceneRenderSink` does not interpret legacy patch/block semantics
- the artifact records the exact representative inputs and adapter boundary examined

Pass conditions:

- the artifact reports `passed: true`
- translation ownership is centralized in one adapter boundary
- the verifier would fail if compatibility logic leaked below the canonical boundary or split across multiple authorities

Evidence class:

- acceptance proof

Replay required after acceptance:

- `FUTURE-03`
- `FUTURE-04`
- `FUTURE-07`
- `FUTURE-09`

### `P-04` Legacy Runtime Proof Set

Owner:

- `FUTURE-03`

Capability claim:

- representative legacy patches render through the canonical runtime path

Representative coverage:

- one single-instance visible primitive case
- one animated primitive case
- one repeated-instance case

Required observables for every named case:

- bootstrap state reaches `succeeded`
- frame advance is detected
- console error count is zero
- page error count is zero
- the artifact records the exact cases used

Pass conditions:

- the artifact reports `passed: true`
- every representative case passes the same runtime-capability bar
- the verifier would fail if any class still depended on a legacy renderer path

Evidence class:

- acceptance proof

Replay required after acceptance:

- `FUTURE-04`
- `FUTURE-07`
- `FUTURE-08`
- `FUTURE-09`
- `FUTURE-10`

### `P-05` Canonical Patch Root Roundtrip

Owner:

- `FUTURE-04`

Capability claim:

- the canonical patch root and lowering path round-trip canonical patch data into canonical scene submission

Representative coverage:

- one canonical single-primitive patch
- one canonical repeated-instance patch

Required observables:

- canonical patch-root data parses or loads successfully
- roundtrip or equivalent persistence checks preserve canonical strata
- lowering emits canonical scene submission rather than legacy render-block semantics
- the artifact records the exact canonical inputs used

Pass conditions:

- the artifact reports `passed: true`
- no tested path requires the legacy compatibility adapter for canonical patch data
- the verifier would fail if canonical patch strata collapsed back into one flat render-boundary graph

Evidence class:

- acceptance proof

Replay required after acceptance:

- `FUTURE-05`
- `FUTURE-06`
- `FUTURE-07`
- `FUTURE-08`
- `FUTURE-09`
- `FUTURE-10`

### `P-06` Canonical Authoring Model Diagnostics

Owner:

- `FUTURE-05`

Capability claim:

- the compiler/editor boundary accepts legal canonical authoring families and rejects illegal layer crossings or renderer-leaking concepts with deterministic diagnostics

Representative coverage:

- positive cases for the accepted canonical authoring families
- negative cases for illegal layer crossings
- negative cases for renderer transport leakage into authoring

Required observables:

- legal cases are accepted
- illegal cases are rejected at the compiler/editor boundary
- deterministic diagnostic identifiers or equivalent stable failure markers are recorded
- the artifact records the exact case set used

Pass conditions:

- the artifact reports `passed: true`
- every negative case fails for the intended reason
- the verifier would fail if illegal authoring concepts still crossed the boundary undetected

Evidence class:

- acceptance proof

Replay required after acceptance:

- `FUTURE-06`
- `FUTURE-07`
- `FUTURE-08`
- `FUTURE-09`
- `FUTURE-10`

### `P-07` Guardrail Regression Boundary

Owner:

- `FUTURE-06`

Capability claim:

- forbidden sink-like blocks, hidden transport outputs, and renderer-leaking authoring types are mechanically blocked

Representative coverage:

- sink-like authoring attempts
- hidden transport output attempts
- renderer-leaking authoring type attempts

Required observables:

- each forbidden pattern is rejected by the accepted enforcement boundary
- if both compiler and UI surfaces exist, they agree on the same forbidden outcomes
- the artifact records the exact forbidden pattern cases used

Pass conditions:

- the artifact reports `passed: true`
- every forbidden pattern fails mechanically
- the verifier would fail if a sink-like or transport-leaking authoring form could still enter the system

Evidence class:

- acceptance proof

Replay required after acceptance:

- `FUTURE-07`
- `FUTURE-08`
- `FUTURE-09`
- `FUTURE-10`

### `P-08` Canonical MVP Authoring Runtime Proof

Owner:

- `FUTURE-07`

Capability claim:

- the minimal canonical authoring slice reaches visible runtime output through the canonical scene submission path

Representative coverage:

- one canonical single-primitive authoring case
- one canonical repeated-instance authoring case

Required observables:

- both named canonical authoring cases lower into canonical scene submission
- both cases reach automated runtime success
- for each runtime case: bootstrap state reaches `succeeded`, frame advance is detected, console error count is zero, and page error count is zero
- the artifact records the exact cases used

Pass conditions:

- the artifact reports `passed: true`
- both representative authoring cases satisfy the static and runtime consequences of the canonical path
- the verifier would fail if canonical authoring still depended on legacy render-block semantics

Evidence class:

- acceptance proof

Replay required after acceptance:

- `FUTURE-08`
- `FUTURE-09`
- `FUTURE-10`

### `P-09` Canonical MVP UI Browser Workflow

Owner:

- `FUTURE-08`

Capability claim:

- the MVP authoring UI exposes the canonical workspaces and supports end-to-end construction or editing of the render-only canonical authoring slice

Required automated workflow coverage:

- use dedicated `Resources`, `Modulation`, `Scene`, and `Output` surfaces
- create or edit one canonical single-primitive case
- create or edit one canonical repeated-instance case
- avoid legacy render-boundary or transport-oriented controls
- reload, reopen, or otherwise re-enter the resulting state and confirm preview/runtime still renders

Required observables:

- the artifact records step-level outcomes for each required workflow segment
- no required step is skipped
- the resulting preview/runtime remains live after the persisted-state check
- the artifact records which canonical cases were exercised

Pass conditions:

- the artifact reports `passed: true`
- the full required workflow completes through canonical UI seams only
- the verifier would fail if the UI still depended on hidden legacy renderer controls or could not recreate the accepted canonical cases

Evidence class:

- acceptance proof

Replay required after acceptance:

- `FUTURE-10`

### `P-10` Simulation Bridge Runtime Proof

Owner:

- `FUTURE-09`

Capability claim:

- simulation-owned authoring data bridges into canonical scene assembly and drives visible runtime output without leaking transport concepts upward

Representative coverage:

- at least one accepted simulation authoring case that exercises simulation-owned domains feeding scene assembly

Required observables:

- a bridge-level verifier proves simulation-owned data lowers into canonical scene assembly
- the representative simulation case reaches automated runtime success
- runtime evidence records bootstrap state `succeeded`, frame advance detected, console error count zero, and page error count zero
- the artifact records the exact simulation case exercised

Pass conditions:

- the artifact reports `passed: true`
- simulation authoring reaches visible output through canonical scene assembly
- the verifier would fail if low-level transport concepts still leaked into simulation authoring APIs

Evidence class:

- acceptance proof

Replay required after acceptance:

- `FUTURE-10`

### `P-11` Simulation UI Browser Workflow

Owner:

- `FUTURE-10`

Capability claim:

- the UI supports dedicated end-to-end simulation authoring without falling back to raw renderer/runtime transport controls

Required automated workflow coverage:

- use dedicated `Simulation`, `Scene`, and `Output` surfaces
- create or edit one accepted simulation authoring case
- make simulation-to-scene wiring visible in the UI
- confirm preview/runtime renders without exposing low-level transport controls as required user steps
- reload, reopen, or otherwise re-enter the resulting state and confirm the same simulation case still executes

Required observables:

- the artifact records step-level outcomes for each required workflow segment
- no required step is skipped
- preview/runtime remains live after the persisted-state check
- the artifact records the exact simulation case exercised

Pass conditions:

- the artifact reports `passed: true`
- the full required workflow completes through simulation-aware UI seams
- the verifier would fail if simulation authoring still required low-level transport controls or hidden graph-spaghetti fallbacks

Evidence class:

- acceptance proof

Replay required after acceptance:

- none; this is the terminal UI proof in the current roadmap
