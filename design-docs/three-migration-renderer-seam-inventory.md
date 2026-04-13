# Three Migration Renderer Seam Inventory

**Date:** 2026-04-12  
**Status:** Groundwork  
**Backlog:** `oscilla-pillars-cleanup-x80.2`

## Purpose

This note inventories the current runtime/render stack before Three backend implementation starts.

`// [LAW:one-source-of-truth]` There must be one canonical migration path: authored patch semantics stay in Oscilla, backend execution shifts behind the existing renderer seam.  
`// [LAW:locality-or-seam]` Modules that still encode Rust/WASM payload details must be frozen or cut behind a declared adapter before `ScenePlan` work begins.

This is not an implementation plan for the real Three backend. It is a keep / adapter / freeze / delete-later map for the code that exists today.

## Canonical Migration Surface

These modules remain authoritative during and after the migration:

| Area | Files | Classification | Reason |
| --- | --- | --- | --- |
| Authored patch model | `src/graph/Patch.ts`, `src/pillars/types.ts`, `src/ui/graphEditor` | Keep | `// [LAW:one-source-of-truth]` Author intent lives here, not in renderer objects or Three node graphs. |
| Runtime lifecycle | `src/services/RuntimeService.ts`, `src/services/AnimationLoop.ts`, `src/services/CompileOrchestrator.ts` | Keep | Runtime boot, compile/swap, telemetry, and failure policy already have single owners. |
| Runtime-to-render boundary | `src/render/index.ts`, `src/render/types.ts` | Keep | `// [LAW:single-enforcer]` This is the one boundary the app uses to talk to a renderer implementation. |
| Renderer construction seam | `src/render/webgpu/index.ts` | Adapter boundary | Keep the `createWebGPURenderer()` seam, replace the stub implementation underneath it. |
| Diagnostics / fault reporting | `src/render/render-issues.ts`, `src/render/webgpu/renderer-circuit-breaker.ts` | Keep | GPU/runtime fault policy remains an app concern even when render execution moves to Three. |

## Inventory

| Surface | Files | Classification | Migration rule |
| --- | --- | --- | --- |
| Current compiler output for the old backend | `src/pillars/compile.ts`, `src/pillars/assembly/payload.ts`, `src/pillars/block-api.ts` | Freeze | Do not widen `PipelineInstallPayload` or Rust-specific manifest shapes as the main migration path. They describe the old backend contract. |
| Compiler worker transport | `src/services/compile.worker.ts`, `src/services/compile-worker-protocol.ts` | Adapter boundary | The worker remains the canonical async compile entrypoint, but its backend payload must switch from Rust-shaped install metadata to backend-neutral `ScenePlan` data. |
| Compile-time Rust install derivation | `src/compiler/backend/compiled-runtime-install-contract.ts` | Freeze | This is a legacy install artifact generator. Keep it stable only long enough to support the old path while `ScenePlan` lands. |
| Runtime install publication hook | `src/services/RuntimeService.ts` `installRendererCanonicalAssets()` | Adapter boundary | This is the runtime cut point where compiled backend artifacts are handed to the renderer. Rebuild this around `ScenePlan`; do not rebuild Rust payloads here. |
| Per-frame renderer publication | `src/services/AnimationLoop.ts` | Adapter boundary | The frame loop stays authoritative, but the commented-out V1 frame payload path is legacy. Rebuild the frame handoff once behind the renderer facade. |
| Renderer stub + WebGPU browser capability shim | `src/render/webgpu/index.ts`, `src/render/webgpu/gpu-api.ts` | Adapter boundary | Keep browser capability detection local to the renderer module. Do not let `navigator.gpu` types leak back into authored graph or runtime policy modules. |
| Rust worker boundary | `src/render/rust/engine.worker.ts`, `src/render/rust/worker-protocol.ts` | Freeze | Legacy backend only. No new app semantics should depend on worker message formats. |
| Rust/WASM boundary schema | `src/render/rust/boundary-contract.ts` | Freeze | `// [LAW:one-source-of-truth]` It remains the one source for the legacy Rust contract, but it must stop being treated as the future renderer contract. |
| Rust WASM implementation | `src/render/wasm/oscilla_rust_renderer.ts`, `src/render/wasm/rust/oscilla-rust-renderer` | Freeze | Keep operational as a replaceable backend path. No new feature work should require expanding it first. |
| GPU-IR and reverse-payload utilities | `src/render/gpu-ir` | Freeze, delete-later | Valuable as historical/legacy coverage, but not the canonical implementation direction once Three migration starts. |
| Shape-bank specific WebGPU helpers | `src/render/webgpu/ShapeBankGeometrySeam.ts`, `src/render/webgpu/WebGPUShapeBankManager.ts` | Freeze, delete-later | These are tightly coupled to the old shape-bank / sink-table path. Do not build `ScenePlan` around them. |
| Legacy manual test shells | `src/compiler-tester/CompilerTesterApp.tsx`, `src/payload-tester` | Freeze | Keep for old-boundary debugging until the Three steel thread has its own proof path. Do not let them define the new backend contract. |

## Exact Cut Points Needed For `ScenePlan`

### 1. Compiler output cut

The compile worker is already the single async compiler boundary. The required change is not a new entrypoint; it is a new backend artifact shape.

Current path:

- authored patch
- compiler frontend/backend
- `CompiledGpuArtifactBundle.runtimeInstall`
- runtime publishes legacy install metadata

Required cut:

- authored patch
- compiler frontend/backend
- backend-neutral `ScenePlan` bundle
- runtime hands `ScenePlan` to the renderer facade

`// [LAW:one-source-of-truth]` `ScenePlan` must become the only execution-plan artifact the runtime treats as canonical for the Three path.  
`// [LAW:one-way-deps]` The compiler emits `ScenePlan`; the renderer consumes it. The renderer does not reach back into compiler IR or patch state.

### 2. Runtime install cut

`RuntimeService.installRendererCanonicalAssets()` is the correct handoff seam. It already centralizes post-compile asset publication.

Required rule:

- replace the legacy install publication inside `installRendererCanonicalAssets()`
- do not move compile-owned translation into `AnimationLoop`
- do not reconstruct backend payloads from `CompiledProgramIR` inside runtime services

This keeps compile-time translation in one place and prevents a second execution-plan source from appearing in runtime code.

### 3. Renderer implementation cut

`src/render/index.ts` and `createWebGPURenderer()` remain the app-facing seam.

Required rule:

- implement `ThreeForkRenderer` behind `src/render/webgpu/index.ts`
- preserve the current lifecycle/fault/telemetry ownership at the render facade boundary
- keep backend-specific classes inside the renderer module subtree

`// [LAW:locality-or-seam]` Three-specific scene/material/resource logic belongs under the renderer implementation, not in runtime lifecycle, editor, or patch-model modules.

## Exact Cut Points Needed For `ThreeForkRenderer`

`ThreeForkRenderer` should depend on these inputs only:

- a compiled `ScenePlan`
- the canonical frame-input envelope owned by `AnimationLoop`
- browser GPU/canvas capability handles local to the renderer module

It should not depend directly on:

- `Patch`
- editor graph state
- `CompiledProgramIR`
- Rust worker protocols
- shape-bank headers or sink-table word packing

That split is the minimum change that preserves one-way dependencies while letting the runtime keep its current lifecycle responsibilities.

## Keep / Delete-Later Decision Summary

Keep now:

- authored patch model
- runtime lifecycle services
- render facade types and creation seam
- diagnostics/fault policy

Adapter next:

- compile worker backend payload
- runtime install handoff
- per-frame renderer publication path
- renderer implementation under `createWebGPURenderer()`

Freeze now:

- Rust boundary schema
- Rust worker/WASM path
- `PipelineInstallPayload`-centric pillars assembly
- shape-bank and sink-table install helpers as backend-defining concepts

Delete later, after the Three steel thread is proven:

- legacy shape-bank WebGPU helpers
- GPU-IR migration-only utilities that exist solely to feed the old renderer path
- manual shells whose only purpose is exercising Rust install payloads

## Consequences For Implementation Tickets

- `oscilla-pillars-cleanup-ulu.1` should introduce `ScenePlan` as a replacement for runtime-facing legacy install metadata, not as an adapter layered on top of `PipelineInstallPayload`.
- `oscilla-pillars-cleanup-ulu.2` should land `ThreeForkRenderer` behind `createWebGPURenderer()` without changing runtime ownership boundaries.
- `oscilla-pillars-cleanup-ulu.3` should lower from authored graph semantics to `ScenePlan`, not to Rust contract types plus a later translation step.

If implementation work needs to add new fields to `src/render/rust/boundary-contract.ts` first, it is probably violating the migration direction captured here.
