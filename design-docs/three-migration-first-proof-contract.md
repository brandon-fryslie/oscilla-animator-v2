# Three Migration First Proof Contract

**Date:** 2026-04-12  
**Status:** Groundwork  
**Backlog:** `oscilla-pillars-cleanup-x80.3`

## Purpose

Choose the first implementation proof target for the Three migration and define how implementation proves it works.

`// [LAW:verifiable-goals]` The migration needs one explicit target patch, one explicit proof procedure, and one explicit artifact location before backend code starts landing.  
`// [LAW:one-source-of-truth]` This note is the canonical proof contract for `oscilla-pillars-cleanup-ulu.5`. Do not substitute ad hoc demo scenes or ticket-local success criteria.

## Chosen Target

The first implementation proof target is **`Grid of Squares`** from [design-docs/DEMO-PATCHES.md](./DEMO-PATCHES.md).

`// [LAW:one-source-of-truth]` `Grid of Squares` is the one canonical first proof patch. `Spirograph Trace` remains a later follow-up patch, not an equal first target.  
`// [LAW:verifiable-goals]` This target is preferred because it can be proven with one instanced draw path, one unlit material path, and visible time-driven motion without adding postprocessing, external assets, or solver complexity.

## Why `Grid of Squares`

- It exercises one instanced geometry path rather than a point-only special case.
- It requires per-instance transform and per-instance color, which are core `ScenePlan` responsibilities.
- It needs time-driven animation every frame, so it proves the `AnimationLoop` to renderer handoff.
- It does not require external asset loading, compute resources, postprocessing, or Rust/WASM fallback behavior.

## Required Compiler Capabilities

`// [LAW:one-way-deps]` The compiler emits backend-neutral execution data; the renderer consumes it without reading patch state or compiler IR directly.

The first proof patch must compile from authored Oscilla graph semantics into one `ScenePlan` with these capabilities:

- one instance domain with `count = 100`
- per-instance `index` and `rank` semantics available as authored inputs
- scalar time input as a runtime-updated input channel, not a compile-time constant
- pure math expressions for grid layout and rotation
- one canonical rectangle geometry resource reference
- one unlit color material description
- one draw item targeting the preview canvas
- one per-instance transform payload with position and rotation
- one per-instance color payload

The `ScenePlan` produced for this proof target must not contain:

- Three scene objects
- Three material instances
- `PipelineInstallPayload`
- shape-bank headers
- sink-table word packing
- Rust worker message payloads

`// [LAW:locality-or-seam]` Those runtime objects belong behind the renderer seam, not in compiler output.

## Required Runtime And Renderer Capabilities

`// [LAW:single-enforcer]` Runtime lifecycle remains owned by `RuntimeService`; renderer execution remains owned behind `createWebGPURenderer()`.

Implementation for the first proof target may depend on these runtime/render capabilities only:

- `src/services/RuntimeService.ts`
  - creates the renderer
  - installs the compiled `ScenePlan`
  - owns fault handling and disposal
- `src/services/AnimationLoop.ts`
  - publishes the canonical per-frame input envelope
  - advances time every frame
- `src/render/index.ts`
  - remains the only app-facing renderer construction seam
- `src/render/webgpu/index.ts`
  - hosts the Three-backed renderer implementation

The renderer implementation must be able to:

- create one scene, one camera, and one preview-canvas render path
- realize one instanced rectangle draw from `ScenePlan`
- realize one unlit material from `ScenePlan`
- update time-driven animation every frame from the existing animation loop
- render continuously without Rust worker or WASM renderer bootstrap

The renderer implementation must not depend directly on:

- `Patch`
- editor graph state
- `CompiledProgramIR`
- legacy Rust worker message contracts
- `src/render/rust/boundary-contract.ts`

## Verification Contract

`// [LAW:verifiable-goals]` The first proof target is complete only when an automated check produces the required artifacts and all failure signals remain absent.

### Automated Check

Implementation must add one automated browser check at:

- `tests/e2e/webgpu/three-grid-of-squares.spec.ts`

That check must:

1. boot the existing app shell
2. load the `Grid of Squares` authored patch path
3. wait for the preview canvas to render
4. capture two screenshots separated by a fixed frame interval
5. assert that the rendered output is non-blank and changes over time
6. assert that no Rust worker / WASM renderer path is required for the render to appear

### Required Artifacts

The automated check must write artifacts under:

- `artifacts/three-migration/ulu.5-grid-of-squares/`

Required files:

- `frame-000.png`
- `frame-001.png`
- `summary.json`

The `summary.json` file must include:

- selected patch id/name
- whether the preview booted successfully
- whether the renderer path was Three-backed
- whether the two frames differed
- whether either frame was blank
- any captured console errors or runtime bootstrap failures

### Success Signals

The proof target succeeds when all of these are true:

- the app boots in the existing shell
- the selected patch is `Grid of Squares`
- the preview canvas renders visible content in both frames
- the two frames differ because time-driven animation is active
- no Rust worker / WASM renderer dependency is required to produce the image
- no fatal runtime/bootstrap error is captured

### Failure Signals

The proof target fails when any of these occur:

- the app fails to boot the preview
- the rendered output is blank in either screenshot
- the two screenshots are identical within the test threshold
- the implementation substitutes a hand-authored Three scene for authored patch compilation
- the render path requires `PipelineInstallPayload`, Rust worker bootstrap, or WASM renderer installation
- the proof depends on renderer-internal telemetry that is unavailable from the app-facing seam

## Handoff To Implementation Tickets

`// [LAW:one-source-of-truth]` This note fixes the first proof target for the implementation stack.

- `oscilla-pillars-cleanup-ulu.1` must expose enough `ScenePlan` structure to represent `Grid of Squares`.
- `oscilla-pillars-cleanup-ulu.2` must realize that `ScenePlan` behind `createWebGPURenderer()`.
- `oscilla-pillars-cleanup-ulu.3` must lower authored patch semantics to that `ScenePlan`.
- `oscilla-pillars-cleanup-ulu.5` must prove the result using the automated check and artifact path above.

## Related References

- [three-fork-integration-proposal.md](./three-fork-integration-proposal.md)
- [three-migration-renderer-seam-inventory.md](./three-migration-renderer-seam-inventory.md)
