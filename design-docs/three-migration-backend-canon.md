# Three Migration Backend Canon

**Date:** 2026-04-12  
**Status:** Groundwork  
**Backlog:** `oscilla-pillars-cleanup-x80.4`

## Purpose

This is the concise implementation-facing canon for the Three migration.

`// [LAW:one-source-of-truth]` Ownership split, seam rules, non-goals, and fork-delta criteria must live in one short note instead of being re-derived from proposal text, legacy recovery comments, or ticket wording.  
`// [LAW:no-mode-explosion]` The migration needs one canonical direction, not parallel “Three path” and “keep extending the old renderer” paths.

For file-by-file keep/freeze/delete decisions, see [three-migration-renderer-seam-inventory.md](./three-migration-renderer-seam-inventory.md).

## Oscilla Owns

`// [LAW:one-source-of-truth]` Authored user intent remains canonical in Oscilla.

Oscilla continues to own:

- authored patch graph semantics
- patch serialization and persistence
- editor and authoring UX
- compile/lower stages from authored graph to backend-neutral execution data
- runtime lifecycle, compile/swap, fault handling, and app integration
- project-level asset identity and metadata

The canonical modules for those concerns remain:

- `src/graph/Patch.ts`
- `src/pillars/types.ts`
- `src/ui/graphEditor`
- `src/services/RuntimeService.ts`
- `src/services/AnimationLoop.ts`
- `src/services/CompileOrchestrator.ts`

## Three Owns

`// [LAW:single-enforcer]` General render execution should have one owner once the backend migrates.

Three and the vendored fork may own:

- scene graph realization
- render object lifecycle
- material/shader/post/compute execution
- WebGPU renderer internals
- runtime asset decoding/loading
- backend-local caches and resource lifetimes

Three ownership starts only after Oscilla emits backend-neutral execution data through the renderer seam.

## Stable Seams

`// [LAW:locality-or-seam]` Migration work must preserve a small number of app-facing seams and move backend variability behind them.

The stable app-facing seams are:

- `src/render/index.ts`
  - the only renderer construction/export boundary the app uses
- `src/render/types.ts`
  - the canonical runtime-to-render shared contract module
- `src/services/RuntimeService.ts`
  - the only lifecycle owner for renderer boot/install/disposal/fault handling
- `src/services/AnimationLoop.ts`
  - the only owner of per-frame time/input publication
- `src/services/compile.worker.ts`
  - the async compiler entrypoint, with backend payload shape replaced behind the same transport boundary

Implementation may replace payload types and renderer internals behind those seams. It should not create parallel entrypoints.

## Dead Concepts

These concepts are legacy backend details, not future architecture:

- `PipelineInstallPayload` as the primary backend target
- Rust worker message shapes as the future renderer ABI
- shape-bank headers as the future scene description
- sink-table word packing as the future frame contract
- GPU-IR as the active renderer architecture for the Three migration
- `CompiledRuntimeInstallContract` as the long-term runtime-facing install artifact

`// [LAW:one-source-of-truth]` These may remain as legacy backend artifacts temporarily, but they are no longer the canonical execution model for migration work.

## Non-Goals

Implementation tickets must not:

- transplant Three node graphs into authored patch state
- store Three object ids, materials, or scene objects in `Patch`
- rebuild Rust payloads from `ScenePlan` just to preserve old tooling
- widen vm4/RECOVER shape-bank recovery work into the migration architecture
- treat the Rust/WASM renderer and the Three renderer as equal long-term directions

`// [LAW:one-way-deps]` Backend code may depend on compiler/runtime seams. Editor, patch, and compile code must not depend upward on backend-local object graphs.

## Interpretation Of Legacy vm4 / RECOVER Work

The repository still contains vm4-era notes and `RECOVER-*` comments around:

- `src/compiler/backend/compiled-runtime-install-contract.ts`
- `src/runtime/DrawPrepSinkTablePacker.ts`
- `design-docs/renderer-webgpu-coverage-audit.md`

Those comments mean:

- legacy backend recovery work may continue only to keep the old renderer path understandable or operational during migration
- legacy recovery work does not define the target architecture for `ScenePlan`, `ThreeForkRenderer`, or asset loading

Recent cleanup already removed the old manual harnesses and deleted the isolated shape-bank WebGPU seam helpers.

`// [LAW:locality-or-seam]` If an implementation ticket needs those legacy concepts, it must consume them at a declared adapter boundary rather than letting them leak back into compiler or app ownership.

## Fork Delta Decision Rule

`// [LAW:single-enforcer]` Fork-delta decisions need one boundary and one test: a delta exists only when the backend cannot meet an app-facing capability through upstream Three/TSL plus backend-local composition.

A fork delta is justified only when all of these are true:

- the required capability is needed by an approved migration ticket
- the capability cannot be expressed cleanly through upstream Three/TSL APIs
- the change can stay entirely inside vendored Three/backend code
- no authored Oscilla semantics are encoded as fork-only object state
- the public app-facing seam stays unchanged
- the delta has an owner and a documented reason in the fork-delta register

If any of those are false, the change is not a justified fork delta.

The fork-delta register, vendor/update workflow, app-facing capability surface,
and the reconciliation of legacy vm4 gap-analysis against Three adoption live in
[three-fork-deltas.md](./three-fork-deltas.md) (owned by `oscilla-pillars-cleanup-ulu.6`).

`// [LAW:single-enforcer]` That register is the only place a delta is recorded as
justified; it starts empty and a row is added only when this rule admits one.

## Implementation Ticket Rules

- `oscilla-pillars-cleanup-ulu.1` defines backend-neutral `ScenePlan` and resource handles, not Three objects.
- `oscilla-pillars-cleanup-ulu.2` implements the Three-backed renderer behind `createWebGPURenderer()`.
- `oscilla-pillars-cleanup-ulu.3` lowers authored graph semantics to `ScenePlan`, not to Rust contract types.
- `oscilla-pillars-cleanup-ulu.4` keeps `AssetId` canonical in Oscilla and loader/runtime caching in the backend bridge.
- `oscilla-pillars-cleanup-ulu.5` proves the authored patch path through the canonical proof contract.
- `oscilla-pillars-cleanup-ulu.6` is the only ticket allowed to normalize fork deltas into migration canon.

## Related References

- [three-fork-integration-proposal.md](./three-fork-integration-proposal.md)
- [three-fork-deltas.md](./three-fork-deltas.md)
- [three-migration-renderer-seam-inventory.md](./three-migration-renderer-seam-inventory.md)
- [three-migration-first-proof-contract.md](./three-migration-first-proof-contract.md)
