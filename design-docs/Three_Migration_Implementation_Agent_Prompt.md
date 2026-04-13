# Prompt: Three Migration Implementation Agent

Use this prompt for agents working on the actual Three.js backend migration after groundwork is complete or sufficiently unblocked. This is the implementation prompt, not the groundwork/cleanup prompt.

## Mission

You are implementing the new rendering path for Oscilla:

- Oscilla remains the owner of authored patch semantics, live modulation, runtime lifecycle, and project data model.
- A forked Three.js `WebGPURenderer` + TSL stack becomes the render/material/post/compute execution substrate.

Your job is to move the codebase from the current stubbed renderer and Rust-boundary-first pipeline toward:

- a backend-neutral `ScenePlan` / `RenderPlan`
- a `ThreeForkRenderer` behind the existing renderer seam
- an end-to-end steel thread where an Oscilla-authored patch renders through the existing app shell

`// [LAW:one-source-of-truth]` The canonical authored graph remains Oscilla’s patch model.
`// [LAW:locality-or-seam]` Three integration belongs behind explicit backend seams.
`// [LAW:verifiable-goals]` The migration is only real when an authored patch renders with automated proof.

## Why This Work Exists

Oscilla is a product for live visual performance, not a project to own a general-purpose shader frontend or custom renderer stack.

The old direction was widening the custom GPU-IR / Rust renderer path. That path has been superseded because:

- it trends toward reimplementing a large part of Naga / a shader frontend
- it duplicates infrastructure that already exists in Three/TSL
- it slows delivery of the actual product value: live, ergonomic, high-capability visual authoring

This migration exists so Oscilla can:

- keep product semantics and UX fully owned
- reuse a battle-tested render/material/geometry/post/compute substrate
- stop treating the old renderer path as the center of the architecture

## Canonical Backlog Context

Preparation epic:
- `oscilla-pillars-cleanup-x80` — Three Migration Groundwork

Implementation epic:
- `oscilla-pillars-cleanup-ulu` — Three Fork Backend Migration Umbrella

Implementation tasks:
- `oscilla-pillars-cleanup-ulu.1` — Backend Seam: ScenePlan + resource handles
- `oscilla-pillars-cleanup-ulu.2` — Renderer Integration: ThreeForkRenderer at createWebGPURenderer seam
- `oscilla-pillars-cleanup-ulu.3` — Compiler Lowering: patch graph to ScenePlan
- `oscilla-pillars-cleanup-ulu.4` — Assets: registry + Three loading bridge
- `oscilla-pillars-cleanup-ulu.5` — Steel Thread: authored demo patch renders through Three backend

Groundwork / dependency task that still matters during implementation:
- `oscilla-pillars-cleanup-ulu.6` — Fork Deltas: vendor strategy + required Three extensions

Do not reopen the old GPU-IR implementation roadmap as a parallel plan.

## Required Reading

Read these first:

- [design-docs/three-fork-integration-proposal.md](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/design-docs/three-fork-integration-proposal.md)
- [design-docs/three-migration-backend-canon.md](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/design-docs/three-migration-backend-canon.md)
- [design-docs/three-migration-first-proof-contract.md](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/design-docs/three-migration-first-proof-contract.md)
- [design-docs/Three_Migration_Groundwork_Agent_Prompt.md](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/design-docs/Three_Migration_Groundwork_Agent_Prompt.md)
- [design-docs/DEMO-PATCHES.md](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/design-docs/DEMO-PATCHES.md)
- [AGENTS.md](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/AGENTS.md)

Read these if your ticket touches historical reconciliation:

- [design-docs/gpu-ir-gap-analysis.md](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/design-docs/gpu-ir-gap-analysis.md)
- [design-docs/renderer-webgpu-coverage-audit.md](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/design-docs/renderer-webgpu-coverage-audit.md)

## Core Architectural Position

### Oscilla owns

- authored patch graph and serialization
- domain concepts: generators, modifiers, intents, modulation, solver resources
- compile/lower pipeline from authored patch into backend-neutral execution data
- runtime lifecycle, patch swapping, persistence, fault handling, app integration

Key files:

- [src/graph/Patch.ts](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/graph/Patch.ts)
- [src/pillars/types.ts](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/pillars/types.ts)
- [src/pillars/compile.ts](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/pillars/compile.ts)
- [src/services/RuntimeService.ts](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/services/RuntimeService.ts)

### Three owns

- scene graph and render object lifecycle
- general material/shader/post/compute execution
- TSL authoring primitives and builder/runtime machinery
- geometry/material/effect ecosystem
- asset decoding/loading runtime

### What this means

`// [LAW:one-source-of-truth]` The user graph is not Three’s node graph.
`// [LAW:locality-or-seam]` Reuse Three nodes inside the backend only.
`// [LAW:one-way-deps]` App/runtime/compiler code may depend on backend seams. Three/backend code must not pull editor state upward.

## Current Codebase Reality

The current renderer boundary exports a single “canonical” WebGPU runtime seam:

- [src/render/index.ts](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/render/index.ts)

But the current implementation is still a stub:

- [src/render/webgpu/index.ts](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/render/webgpu/index.ts)

The current compile pipeline still ends in the old boundary contract:

- [src/pillars/compile.ts](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/pillars/compile.ts)
- [src/pillars/block-api.ts](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/pillars/block-api.ts)
- [src/pillars/assembly/legacy-payload.ts](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/pillars/assembly/legacy-payload.ts)

The old backend is still present and must be treated as replaceable:

- [src/legacy/pipeline-install-contract.ts](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/legacy/pipeline-install-contract.ts)

## The Intended New Flow

The target architecture is:

- authored patch
- normalization / lowering
- backend-neutral `ScenePlan` / `RenderPlan`
- Three backend assembler / renderer
- app shell rendering through the existing runtime lifecycle

The old direct flow:

- authored patch
- normalization / lowering
- Rust boundary payload
- Rust/WASM renderer

is no longer the canonical implementation path.

## Important Seams And Files

### Authored graph and frontend

- [src/graph/Patch.ts](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/graph/Patch.ts)
- [src/pillars/types.ts](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/pillars/types.ts)
- [src/pillars/frontend/normalized-graph.ts](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/pillars/frontend/normalized-graph.ts)
- [src/compiler/frontend/draft-graph.ts](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/compiler/frontend/draft-graph.ts)

### Compiler and lowering

- [src/pillars/compile.ts](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/pillars/compile.ts)
- [src/pillars/block-api.ts](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/pillars/block-api.ts)
- [src/pillars/lowering](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/pillars/lowering)
- [src/pillars/assembly](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/pillars/assembly)

### Runtime/render seam

- [src/services/RuntimeService.ts](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/services/RuntimeService.ts)
- [src/services/AnimationLoop.ts](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/services/AnimationLoop.ts)
- [src/render/index.ts](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/render/index.ts)
- [src/render/webgpu/index.ts](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/render/webgpu/index.ts)

### Old boundary artifacts to avoid making more central

- [src/legacy/pipeline-install-contract.ts](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/legacy/pipeline-install-contract.ts)

### Demo patch reference

- [design-docs/DEMO-PATCHES.md](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/design-docs/DEMO-PATCHES.md)

Recommended initial steel-thread targets from the proposal:

- `Grid of Squares`
- `Spirograph Trace`

## Dirty Worktree Warning

Do not disturb these existing unrelated changes unless your assigned task explicitly requires it:

- [src/render/gpu-ir/__tests__/boundary-coverage.test.ts](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/render/gpu-ir/__tests__/boundary-coverage.test.ts)
- [src/legacy/pipeline-install-contract.ts](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/legacy/pipeline-install-contract.ts)
- [design-docs/three-fork-integration-proposal.md](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/design-docs/three-fork-integration-proposal.md)
- [design-docs/Three_Migration_Groundwork_Agent_Prompt.md](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/design-docs/Three_Migration_Groundwork_Agent_Prompt.md)

## Non-Negotiable Rules For Implementation

Follow `AGENTS.md`. These matter most here:

- `// [LAW:one-source-of-truth]` Authored patch semantics stay in Oscilla types and patch state.
- `// [LAW:single-enforcer]` Backend selection happens at the renderer seam, not scattered through runtime/compiler callsites.
- `// [LAW:one-way-deps]` Backend code must not pull in editor or patch UI state.
- `// [LAW:locality-or-seam]` If adding Three would force edits across unrelated modules, create the seam first.
- `// [LAW:verifiable-goals]` Do not stop with “it should render.” Prove it with automated checks and artifacts where practical.
- `// [LAW:behavior-not-structure]` Tests should assert plan contracts and visible behavior, not preserve old Rust payload shapes.

When a law materially influences a design or code decision, cite it.

## What Implementation Agents Should Build

Depending on the assigned ticket, expected outputs include:

- a canonical backend-neutral `ScenePlan` / `RenderPlan`
- backend-neutral resource refs such as geometry/material/texture/object/post/compute handles
- a Three-backed renderer implementation behind `createWebGPURenderer()`
- a compile path from Oscilla-authored graph to `ScenePlan`
- an asset registry and Three loading bridge
- an authored steel thread rendering through the app shell

Good implementation work makes the old renderer path less central without leaking Three internals into authored/runtime abstractions.

## What Implementation Agents Must Not Do

Do not:

- put Three node IDs, scene objects, or material classes into authored patch state
- make the editor graph use Three’s internal node graph as its model
- keep widening the old Rust boundary as the main implementation path
- bypass `RuntimeService` ownership of runtime lifecycle
- hardcode a final Three scene instead of compiling a chosen authored patch
- add scattered fallback branches that keep both old and new backends equally active without a clear owner

## Verification Expectations

Use the smallest sufficient set for your task, but implementation tasks should generally verify with code, not assertion by prose.

Common commands:

```bash
pnpm typecheck
pnpm vitest run src/services/__tests__/RuntimeService.test.ts
pnpm build
```

If your task changes app-shell behavior, also verify it through the available browser/devtools path and capture a concrete artifact when the ticket calls for one.

## Ticket-Specific Guidance

### If you are on `oscilla-pillars-cleanup-ulu.1`

Focus on the backend-neutral execution contract.

- Introduce `ScenePlan` / `RenderPlan` and backend-neutral resource handles.
- Replace `PipelineInstallPayload` as the primary assembly target for the new path.
- Keep tests contract-focused.
- Do not expose Three classes in those types.

### If you are on `oscilla-pillars-cleanup-ulu.2`

Focus on runtime backend integration.

- Implement `ThreeForkRenderer` behind [src/render/webgpu/index.ts](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/src/render/webgpu/index.ts).
- Keep `createWebGPURenderer()` as the single selection seam.
- Keep `RuntimeService` as the owner of lifecycle, fault handling, and disposal.
- Do not route the first slice through the Rust worker.

### If you are on `oscilla-pillars-cleanup-ulu.3`

Focus on compiler lowering from authored graph to `ScenePlan`.

- The input is still the authored patch model and current normalization/lowering pipeline.
- The output is backend-neutral execution data.
- Keep Oscilla semantics explicit for materials, fields, solver resources, scene objects, and post/fullscreen concepts.
- Do not author Three scenes directly as a substitute for lowering logic.

### If you are on `oscilla-pillars-cleanup-ulu.4`

Focus on assets and loading.

- Oscilla must own `AssetId` and project-level asset metadata.
- Three should be the decode/runtime layer, not the canonical asset store.
- Centralize loading and cache invalidation through one bridge.
- Do not scatter loader usage across unrelated runtime modules.

### If you are on `oscilla-pillars-cleanup-ulu.5`

Focus on the first true steel thread.

- Render one chosen patch from [design-docs/DEMO-PATCHES.md](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/design-docs/DEMO-PATCHES.md).
- Recommended starting patch: `Grid of Squares` unless the ticket canon selects otherwise.
- The content must originate from Oscilla-authored patch semantics.
- The final path must not rely on a hand-authored Three scene.
- Produce an automated proof artifact when the ticket requires it.

## Recommended Implementation Order

Unless your ticket says otherwise:

1. confirm groundwork assumptions are satisfied
2. define or refine the backend-neutral plan types
3. hook the compile path to produce that plan
4. implement the renderer seam against the plan
5. thread runtime lifecycle through the existing shell
6. prove the authored steel thread renders

## Deliverable Format

Unless told otherwise, end with:

1. what you changed
2. what you verified
3. remaining risk or follow-up
4. exact files touched

If you created a new design note or migration note, place it under [design-docs](/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/design-docs).

## Pasteable Assignment Template

Use this as the top of an implementation assignment:

```md
Please work on `<ticket-id>` from the Three migration implementation stack.

Start by reading:
- `/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/design-docs/Three_Migration_Implementation_Agent_Prompt.md`
- `/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/design-docs/Three_Migration_Groundwork_Agent_Prompt.md`
- `/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/design-docs/three-fork-integration-proposal.md`
- `/Users/bmf/.codex/worktrees/8bfd/oscilla-animator-v2/AGENTS.md`

Follow the prompt exactly. Keep Three behind explicit backend seams, keep Oscilla as the owner of authored patch semantics, and verify changes mechanically.
```
