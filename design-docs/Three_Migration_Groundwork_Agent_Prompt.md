# Prompt: Three Migration Groundwork Agent

Use this prompt for pre-implementation migration work. This prompt is for deciding what the new backend model should be, what old backend machinery must be removed, and what seams/APIs must remain so a Three.js-first backend can be implemented cleanly.

This is not the implementation prompt.

## Mission

Oscilla is shifting from a custom Rust/WebGPU renderer architecture to a forked Three.js `WebGPURenderer` + TSL backend.

Your job is not to preserve the old renderer architecture through adapters.

Your job is to:

- identify everything in the current repo that is renderer-specific and should be replaced by a Three-native backend model
- identify everything that should be removed to clear the path
- define the surviving seams and minimal APIs the rest of the app should depend on

The correct mental model is:

- keep Oscilla's authored patch semantics, editor concepts, project model, and runtime lifecycle ownership
- redesign the backend model around Three.js from the beginning
- remove old renderer-specific concepts instead of treating them as the future architecture

`// [LAW:one-source-of-truth]` There must be one backend direction in the repo: Oscilla semantics lowered into a Three-native execution model.
`// [LAW:locality-or-seam]` If old renderer concepts are still leaking across the app, identify the seam and cut them off there.
`// [LAW:verifiable-goals]` Groundwork is only done when the removal list, replacement list, and seam/API list are explicit enough that implementation can proceed mechanically.

## The Core Decision

Do not think of this migration as:

- existing payload IR
- translated old payload
- Three adapter

Think of it as:

- authored Oscilla patch
- semantic compile result
- Three-native runtime plan
- Three-backed renderer implementation

That is the canonical migration direction.

## What This Groundwork Must Produce

Unless your ticket explicitly narrows the scope, groundwork output should answer these three questions first:

1. What are we replacing with Three.js?
2. What are we removing from the old backend path?
3. What seams and APIs survive so the rest of the app can talk to the new backend cleanly?

Good groundwork produces concrete lists, not general strategy language.

## What Must Survive The Migration

These remain canonical unless a ticket explicitly says otherwise:

- authored patch semantics
  - `src/graph/Patch.ts`
  - `src/pillars/types.ts`
- editor and authoring UX
  - `src/ui/graphEditor`
- runtime lifecycle ownership
  - `src/services/RuntimeService.ts`
  - `src/services/AnimationLoop.ts`
  - `src/services/CompileOrchestrator.ts`
- top-level runtime-to-render boundary
  - `src/render/index.ts`
  - `src/render/types.ts`

`// [LAW:one-source-of-truth]` Three classes, node IDs, materials, meshes, loaders, and scene objects must not become authored graph state.

## What Is Expected To Be Replaced

You should assume the following categories are under replacement unless a ticket says otherwise:

- the current renderer implementation
- the Rust worker / WASM render path
- the `PipelineInstallPayload` compiler target
- the shape-bank / sink-table render model
- GPU-IR as the active renderer architecture
- old payload-driven test shells and debug tools whose purpose is to exercise the Rust boundary

## What Cleanup Means Here

Cleanup does not mean preserving the old backend behind one more abstraction layer.

Cleanup means:

- name the old backend-specific concepts
- mark which ones are removed entirely
- mark which ones are replaced by new Three-native concepts
- mark the few app-level seams that survive unchanged

Do not spend effort “freezing” or extending legacy contracts. If a thing is old-backend-only, classify it for removal or replacement.

## Primary References

Read these first:

- `design-docs/three-fork-integration-proposal.md`
- `design-docs/three-migration-renderer-seam-inventory.md`
- `AGENTS.md`

Relevant old-backend context:

- `design-docs/gpu-ir-gap-analysis.md`
- `design-docs/renderer-webgpu-coverage-audit.md`

## Current Reality To Inspect

The current app-facing renderer seam:

- `src/render/index.ts`
- `src/render/webgpu/index.ts`

The current old-backend compiler target:

- `src/pillars/compile.ts`
- `src/pillars/block-api.ts`
- `src/pillars/assembly/payload.ts`

The current compile worker boundary:

- `src/services/compile.worker.ts`
- `src/services/compile-worker-protocol.ts`
- `src/compiler/backend/compiled-runtime-install-contract.ts`

The current runtime lifecycle owners:

- `src/services/RuntimeService.ts`
- `src/services/AnimationLoop.ts`
- `src/services/CompileOrchestrator.ts`

The current old renderer path:

- `src/render/rust`
- `src/render/wasm`
- `src/render/gpu-ir`
- `src/render/webgpu/ShapeBankGeometrySeam.ts`
- `src/render/webgpu/WebGPUShapeBankManager.ts`

## Non-Negotiable Architectural Rules

From `AGENTS.md`, obey these in both code and docs:

- `// [LAW:one-source-of-truth]` Patch semantics belong to Oscilla. Backend runtime objects are derived, never canonical.
- `// [LAW:single-enforcer]` Backend selection, verification, and asset loading policy each need one owner.
- `// [LAW:one-way-deps]` Runtime and compiler may depend on backend seams. The backend must not call upward into editor, patch state, or authoring modules.
- `// [LAW:locality-or-seam]` If removal would force edits in unrelated modules, define the seam first.
- `// [LAW:behavior-not-structure]` Tests should assert surviving app contracts, not preserve old renderer internals.
- `// [LAW:verifiable-goals]` End with explicit artifacts or lists, not “implementation can figure this out later.”

When a law materially influences a decision, cite it in code comments or docs.

## What Agents Should Produce

Depending on the ticket, expected outputs include:

- a concrete list of backend systems being replaced by Three
- a concrete removal list for old renderer-specific codepaths
- a seam map showing what app surfaces survive unchanged
- a minimal API list for compiler -> runtime -> renderer -> assets
- a short canon note about what Oscilla still owns vs what Three owns
- a vendor/fork strategy note if the ticket is about Three fork deltas

The deliverable should make the next implementation task smaller by removing ambiguity, not by partially implementing the backend.

## What Agents Must Not Do

Do not:

- implement the real Three backend unless the ticket explicitly changed scope
- preserve `PipelineInstallPayload`, shape-bank headers, sink tables, or Rust worker messages as the future backend architecture
- hardcode a Three scene as a substitute for the backend model
- re-open the old GPU-IR renderer roadmap as an equal alternative path
- mutate authored patch state to carry derived Three-specific runtime data

## Recommended Inspection Order

1. Read the proposal, seam inventory note, and assigned `lit` ticket.
2. Inspect the authored patch model so you know what must survive:
   - `src/graph/Patch.ts`
   - `src/pillars/types.ts`
3. Inspect the current compile target and worker boundary:
   - `src/pillars/compile.ts`
   - `src/pillars/block-api.ts`
   - `src/pillars/assembly/payload.ts`
   - `src/services/compile.worker.ts`
   - `src/services/compile-worker-protocol.ts`
   - `src/compiler/backend/compiled-runtime-install-contract.ts`
4. Inspect runtime/render seams:
   - `src/services/RuntimeService.ts`
   - `src/services/AnimationLoop.ts`
   - `src/render/index.ts`
   - `src/render/webgpu/index.ts`
5. Inspect the old backend only to classify it for removal or replacement:
   - `src/render/rust`
   - `src/render/wasm`
   - `src/render/gpu-ir`
   - `src/render/webgpu/ShapeBankGeometrySeam.ts`
   - `src/render/webgpu/WebGPUShapeBankManager.ts`

## Verification Commands

Use the smallest relevant set for your task:

```bash
pnpm typecheck
pnpm vitest run src/services/__tests__/RuntimeService.test.ts
pnpm build
lit ls --status open --format lines
lit dep ls <issue-id>
```

If a task changes docs or tracker state only, say so explicitly.

## Ticket-Specific Guidance

### If you are on `oscilla-pillars-cleanup-x80.1`

Focus on baseline health only.

- make the current runtime/render shell mechanically verifiable
- remove or fix baseline failures that block cleanup work
- do not start backend design or implementation work here

### If you are on `oscilla-pillars-cleanup-x80.2`

This is the core cleanup task.

Produce these lists:

- what is being replaced by Three.js
- what is being removed from the old backend path
- what survives as the stable seam
- what APIs the new backend needs to expose

Name exact files, directories, and concepts. Prefer explicit removal/replacement language over “freeze” or “maybe later” language.

### If you are on `oscilla-pillars-cleanup-x80.3`

This is not steel-thread implementation.

Only define the future implementation proof target after the removal and seam lists are already clear. Treat it as a handoff contract into implementation, not as the center of cleanup.

### If you are on `oscilla-pillars-cleanup-x80.4`

Produce the shortest canon note that answers:

- what Oscilla still owns
- what Three owns
- what old renderer concepts are explicitly dead
- what seams remain stable
- what implementation work must not preserve from the old backend

### If you are on `oscilla-pillars-cleanup-ulu.6`

Treat this as a Three-native backend capability and vendoring task.

- define where a fork is actually needed
- define what app-facing capabilities implementation may depend on
- define how vendored Three code stays isolated from app semantics

Do not start implementing the fork itself unless the ticket scope changes.

## Deliverable Format

Unless told otherwise, end with:

1. what you changed
2. what you verified
3. the concrete replacement list
4. the concrete removal list
5. the concrete seam/API list
6. exact files or tickets touched

If you produce a design note, place it under `design-docs`.

## Pasteable Assignment Template

Use this as the top of an agent assignment:

```md
Please work on `<ticket-id>` from the Three migration groundwork stack.

Start by reading:
- `design-docs/Three_Migration_Groundwork_Agent_Prompt.md`
- `design-docs/three-fork-integration-proposal.md`
- `design-docs/three-migration-renderer-seam-inventory.md`
- `AGENTS.md`

This is groundwork only. The goal is to make the replacement list, removal list, and seam/API list explicit enough that the new backend can be designed around Three.js from the beginning.
```
