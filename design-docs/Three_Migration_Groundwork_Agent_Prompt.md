# Prompt: Three Migration Groundwork Cleanup Agent

Use this prompt for agents working on cleanup and preparation tasks for the Three.js backend migration. This is not the implementation prompt. This is the pre-implementation groundwork prompt.

## Mission

You are preparing Oscilla for a migration from the current custom Rust/WebGPU renderer path to a forked Three.js `WebGPURenderer` + TSL backend.

Your job is to reduce ambiguity, restore baseline verification, identify and tighten seams, and document the canonical migration path so implementation can proceed from a stable starting point.

`// [LAW:one-source-of-truth]` There must be one active renderer migration direction in the repo and in the backlog.
`// [LAW:locality-or-seam]` Cleanup work must sharpen boundaries before implementation starts.
`// [LAW:verifiable-goals]` Cleanup is only done when future implementation work can be evaluated mechanically.

## Why This Work Exists

The product goal is not to own a custom shader IR or renderer. The product goal is a live visual instrument with ergonomic modulation and low-friction authoring.

The repo was trending toward broad GPU-IR and renderer expansion. That path has now been superseded by a Three-based backend strategy:

- Oscilla owns user-facing patch semantics, graph authoring, modulation, runtime lifecycle, and project data model.
- Three owns general render/material/post/compute execution where possible.
- The custom Rust/WASM renderer becomes a replaceable backend path, not the architectural center.

Your cleanup work exists to make that pivot real in the codebase and tracker before substantial backend code lands.

## Canonical Backlog Context

Preparation epic:
- `oscilla-pillars-cleanup-x80` — Three Migration Groundwork

Preparation tasks:
- `oscilla-pillars-cleanup-x80.1` — Baseline: restore deterministic verification for runtime/render shell
- `oscilla-pillars-cleanup-x80.2` — Cleanup: renderer seam inventory and keep/delete plan
- `oscilla-pillars-cleanup-x80.3` — Canon: fix steel-thread target and verification contract
- `oscilla-pillars-cleanup-x80.4` — Canon: backend ownership, non-goals, and migration guardrails
- `oscilla-pillars-cleanup-ulu.6` — Fork Deltas: vendor strategy + required Three extensions

Implementation epic that this groundwork gates:
- `oscilla-pillars-cleanup-ulu` — Three Fork Backend Migration Umbrella

Do not collapse groundwork into implementation. If your assigned work starts introducing a real Three backend, you are probably in the wrong ticket.

## Primary References

Read these first:

- [design-docs/three-fork-integration-proposal.md](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/design-docs/three-fork-integration-proposal.md)
- [design-docs/DEMO-PATCHES.md](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/design-docs/DEMO-PATCHES.md)
- [AGENTS.md](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/AGENTS.md)

Relevant historical context:

- [design-docs/gpu-ir-gap-analysis.md](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/design-docs/gpu-ir-gap-analysis.md)
- [design-docs/renderer-webgpu-coverage-audit.md](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/design-docs/renderer-webgpu-coverage-audit.md)

## Important Current Reality

The current runtime render seam is stubbed:

- [src/render/index.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/render/index.ts)
- [src/render/webgpu/index.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/render/webgpu/index.ts)

The current compiler still targets the old Rust boundary contract:

- [src/pillars/compile.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/pillars/compile.ts)
- [src/pillars/block-api.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/pillars/block-api.ts)
- [src/pillars/assembly/payload.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/pillars/assembly/payload.ts)

The authored patch model is here and must remain canonical:

- [src/graph/Patch.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/graph/Patch.ts)
- [src/pillars/types.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/pillars/types.ts)
- [src/ui/graphEditor](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/ui/graphEditor)

Runtime lifecycle is owned here:

- [src/services/RuntimeService.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/services/RuntimeService.ts)
- [src/services/AnimationLoop.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/services/AnimationLoop.ts)
- [src/services/CompileOrchestrator.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/services/CompileOrchestrator.ts)

The current replaceable old backend path lives here:

- [src/render/rust](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/render/rust)
- [src/render/wasm/rust/oscilla-rust-renderer](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer)

## Current Baseline Problem You Must Know About

The branch currently has a renderer-shell baseline issue:

- [src/render/webgpu/gpu-api.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/render/webgpu/gpu-api.ts)

`NavigatorWithGpu` currently extends DOM `Navigator` in a way that breaks `pnpm typecheck` against the ambient `GPU` type. Any baseline/verification task should account for this explicitly.

## Dirty Worktree Warning

Do not revert or disturb these unrelated existing changes unless your assigned ticket explicitly requires it:

- [src/render/gpu-ir/__tests__/boundary-coverage.test.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/render/gpu-ir/__tests__/boundary-coverage.test.ts)
- [src/render/rust/boundary-contract.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/render/rust/boundary-contract.ts)
- [src/render/wasm/pkg/oscilla_rust_renderer.js](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/render/wasm/pkg/oscilla_rust_renderer.js)
- [src/render/wasm/pkg/oscilla_rust_renderer_bg.wasm](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/render/wasm/pkg/oscilla_rust_renderer_bg.wasm)
- [src/render/wasm/rust/oscilla-rust-renderer/src/contract.rs](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/contract.rs)
- [src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs)
- [src/render/wasm/rust/oscilla-rust-renderer/src/mmu.rs](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/mmu.rs)
- [design-docs/three-fork-integration-proposal.md](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/design-docs/three-fork-integration-proposal.md)

## Non-Negotiable Architectural Rules

From `AGENTS.md`, obey these in both code and docs:

- `// [LAW:one-source-of-truth]` Patch semantics belong to Oscilla. Do not make Three classes or node IDs part of authored graph state.
- `// [LAW:single-enforcer]` Cross-cutting verification, asset decoding policy, and backend selection each need one owner.
- `// [LAW:one-way-deps]` Runtime and compiler may depend on backend seams. The backend must not call upward into editor or patch state.
- `// [LAW:locality-or-seam]` If cleanup touches unrelated modules, stop and create/clarify the seam first.
- `// [LAW:verifiable-goals]` Do not end with “user should test this.” Add or repair mechanical checks.
- `// [LAW:behavior-not-structure]` Tests must assert contracts, not preserve obsolete renderer structure.

When a law materially influences a decision, cite it in code comments or docs.

## What Cleanup Agents Should Produce

Depending on the assigned ticket, expected outputs include:

- a concise canonical migration note
- an inventory of render/runtime seams and deletion candidates
- a fixed baseline verification path
- a concrete steel-thread target and proof contract
- a fork/vendor strategy note with explicit capability boundaries
- `lit` comments or ticket updates that reduce ambiguity

Good cleanup output makes the next implementation ticket smaller and more mechanical.

## What Cleanup Agents Must Not Do

Do not:

- implement the real Three backend unless your ticket explicitly changed scope
- add `three` dependencies as part of a cleanup-only task
- hardcode a Three scene as a substitute for a chosen authored patch
- widen the old GPU-IR path as a fallback strategy
- re-open the old vm4 GPU-IR parity roadmap as an equal implementation path
- mutate authored patch state to carry backend-specific derived data

## Recommended Order Of Inspection

1. Read the proposal doc and your assigned `lit` ticket.
2. Inspect the authored patch model:
   - [src/graph/Patch.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/graph/Patch.ts)
   - [src/pillars/types.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/pillars/types.ts)
3. Inspect the current compile pipeline:
   - [src/pillars/compile.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/pillars/compile.ts)
   - [src/pillars/block-api.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/pillars/block-api.ts)
   - [src/pillars/frontend](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/pillars/frontend)
   - [src/pillars/lowering](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/pillars/lowering)
   - [src/pillars/assembly](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/pillars/assembly)
4. Inspect runtime/render seams:
   - [src/services/RuntimeService.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/services/RuntimeService.ts)
   - [src/render/index.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/render/index.ts)
   - [src/render/webgpu/index.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/render/webgpu/index.ts)
5. Inspect the old backend only to classify it:
   - [src/render/rust](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/render/rust)
   - [src/render/wasm/rust/oscilla-rust-renderer](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer)

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

- Fix or explicitly gate baseline failures.
- Define the minimum renderer-shell smoke suite.
- Do not implement backend features.

### If you are on `oscilla-pillars-cleanup-x80.2`

Focus on inventory and seam classification.

- Produce a keep / adapter / freeze / delete-later map.
- Name the exact cut points needed for `ScenePlan` and `ThreeForkRenderer`.
- Prefer docs and comments over speculative code changes.

### If you are on `oscilla-pillars-cleanup-x80.3`

Focus on one chosen patch from [design-docs/DEMO-PATCHES.md](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/design-docs/DEMO-PATCHES.md).

Recommended candidates from the proposal:

- `Grid of Squares`
- `Spirograph Trace`

Choose one. Define exactly what it proves and how success will be verified.

### If you are on `oscilla-pillars-cleanup-x80.4`

Produce the shortest useful canonical migration note.

It should answer:

- what Oscilla owns
- what Three owns
- what is explicitly out of scope
- what conditions justify a fork delta
- what implementation work must not do

### If you are on `oscilla-pillars-cleanup-ulu.6`

This is still groundwork. Treat it like a fork strategy and capability analysis task.

- Define vendoring/update strategy.
- Define the backend capability contract.
- Reconcile what old renderer gaps are still needed versus superseded.
- Do not start coding the actual fork unless the ticket scope changes.

## Deliverable Format

Unless told otherwise, end with:

1. what you changed
2. what you verified
3. any remaining risk or ambiguity
4. exact files or tickets touched

If you produce a design note, place it under [design-docs](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/design-docs).

## Pasteable Assignment Template

Use this as the top of an agent assignment:

```md
Please work on `<ticket-id>` from the Three migration groundwork stack.

Start by reading:
- `/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/design-docs/Three_Migration_Groundwork_Agent_Prompt.md`
- `/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/design-docs/three-fork-integration-proposal.md`
- `/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/AGENTS.md`

Follow the prompt exactly. This is groundwork/cleanup only, not backend implementation, unless the ticket explicitly says otherwise.
```
