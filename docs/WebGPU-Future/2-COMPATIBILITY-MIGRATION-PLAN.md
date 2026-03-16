# Compatibility Migration Plan

This document defines how the current patch + block system can be used as a temporary authoring frontend while the renderer moves to the canonical architecture defined in:

- [1-CANONICAL-RENDER-SINK-DESIGN.md](./1-CANONICAL-RENDER-SINK-DESIGN.md)
- [3-CANONICAL-PATCH-STRUCTURE-DESIGN.md](./3-CANONICAL-PATCH-STRUCTURE-DESIGN.md)
- [4-CANONICAL-AUTHORING-MODEL-DESIGN.md](./4-CANONICAL-AUTHORING-MODEL-DESIGN.md)
- [5-CANONICAL-AUTHORING-GUARDRAILS.md](./5-CANONICAL-AUTHORING-GUARDRAILS.md)
- [9-CANONICAL-IMPLEMENTATION-ROADMAP.md](./9-CANONICAL-IMPLEMENTATION-ROADMAP.md)

It is not a compatibility-first architecture. It is a temporary migration seam.

// [LAW:locality-or-seam] The legacy authoring system and the canonical renderer need an explicit anti-corruption seam so renderer progress does not wait on a full authoring rewrite.
// [LAW:one-source-of-truth] `SceneRenderSink` remains the one canonical render boundary even during migration. The legacy patch model is only an upstream input source.
// [LAW:no-mode-explosion] Compatibility is implemented as one bounded adapter path, not as parallel long-term render architectures.
// [LAW:verifiable-goals] Each phase below has concrete exit criteria so the migration can be judged complete without subjective interpretation.

## 1. Goal

The immediate goal is to render real patches through the new canonical render pipeline before the full new patch structure and UI are complete.

That means:

- keep the current patch + block system temporarily usable
- do not preserve legacy sink-era architecture as canonical
- translate legacy graph outputs into canonical scene intent once
- route all new rendering work through `SceneRenderSink -> RenderPrepare -> DrawQueueBuilder -> render`

## 2. Non-Goals

This plan does not attempt to:

- preserve hidden sink outputs as a permanent API
- keep old renderer-facing block semantics alive indefinitely
- design a long-term dual-path renderer
- block renderer progress on the full new authoring UI
- make every legacy block shape first-class in the final architecture

## 3. Canonical Target

The canonical target remains the same throughout migration:

```mermaid
flowchart LR
  A["PatchProgram / Future Authoring Model"] --> B["RenderPrimitive[] + RenderView"]
  B --> C["SceneRenderSink"]
  C --> D["ExtractedScenePacket"]
  D --> E["RenderPrepare"]
  E --> F["DrawQueueBuilder"]
  F --> G["Render Graph / Passes"]
```

The compatibility path must feed this target, not redefine it.

## 4. Temporary Compatibility Architecture

During migration, the current patch/block world sits above a single adapter seam:

```mermaid
flowchart LR
  A["Current Patch + Blocks"] --> B["Legacy Compatibility Adapter"]
  B --> C["Canonical Scene Submission"]
  C --> D["SceneRenderSink"]
  D --> E["Extract / Prepare / Queue / Render"]
```

The adapter is responsible for only two outputs:

- `RenderPrimitive[]`
- `RenderView`

It must not output:

- sink-table records
- backend slot layouts
- draw-prep ABI packets
- WebGPU binding metadata

// [LAW:one-way-deps] The adapter lowers legacy authoring into canonical scene intent only. Backend details remain below the sink boundary.

## 5. Migration Principle

Work from the bottom up:

1. freeze the canonical render boundary
2. adapt legacy authoring into that boundary
3. prove visible rendering with real existing patches
4. replace authoring structure above the seam incrementally
5. delete the compatibility seam when the new authoring path is proven

This keeps renderer progress unblocked while preventing compatibility code from becoming the new architecture.

## 6. Compatibility Adapter Contract

The compatibility adapter should be one explicit module family, not many scattered shims.

Recommended contract:

```ts
interface LegacyPatchCompatibilityAdapter {
  compileView(input: LegacyPatchViewInput): RenderView;
  compilePrimitives(input: LegacyPatchSceneInput): readonly RenderPrimitive[];
}
```

Recommended input split:

- `LegacyPatchViewInput`
  Current graph/view outputs needed to build a canonical `RenderView`
- `LegacyPatchSceneInput`
  Current graph/render outputs needed to build canonical `RenderPrimitive[]`

Recommended output rule:

- the adapter owns all legacy-to-canonical translation
- downstream renderer stages never inspect legacy patch semantics directly

// [LAW:single-enforcer] Legacy translation belongs in one adapter boundary, not reimplemented in sink code, queue code, and backend packers.

## 7. Legacy-To-Canonical Mapping

The adapter should translate current concepts into canonical concepts like this:

| Legacy Concept | Canonical Target | Notes |
|---|---|---|
| shape selection | `geometry: GeometryHandle` | Geometry family/type is resolved once here |
| color / material-ish fields | `material: MaterialHandle` + `materialParams` | Material schema owns shading params |
| position / rotation / scale | `transform: Transform3` | Legacy split fields are recomposed into one transform |
| visibility-ish fields | `visibilityMask` | Normalize here, not later |
| layer / draw-order hints | `renderPhase` + `sortBias` | Preserve scene intent only |
| scene camera / viewport outputs | `RenderView` | Adapter builds canonical view |

What should not be mapped directly:

- legacy hidden sink outputs
- slot numbers
- descriptor words
- sink-table row shapes
- backend-specific field pack layouts

Those concepts are either deleted or rederived below the canonical boundary.

## 8. Implementation Phases

## Phase 0: Freeze The Canonical Boundary

Reference:

- [1-CANONICAL-RENDER-SINK-DESIGN.md](./1-CANONICAL-RENDER-SINK-DESIGN.md)

Implement:

- `RenderPrimitive`
- `RenderView`
- `SceneRenderSink`
- `ExtractedScenePacket`
- `RenderPrepare`
- `DrawQueueBuilder`

Done when:

- there is one canonical scene submission boundary
- no new code is added that treats legacy hidden sink fields as the long-term renderer contract

## Phase 1: Build The Legacy Compatibility Adapter

Reference:

- [1-CANONICAL-RENDER-SINK-DESIGN.md](./1-CANONICAL-RENDER-SINK-DESIGN.md)
- this document

Implement:

- one explicit adapter layer from current patch/block outputs to `RenderPrimitive[] + RenderView`
- one mapping authority for geometry/material/transform/view translation

Done when:

- an existing patch can compile into canonical scene submission without touching backend transport concepts
- renderer stages below the sink no longer read legacy patch field layouts directly

## Phase 2: Prove Visible Rendering With Existing Patches

Reference:

- [9-CANONICAL-IMPLEMENTATION-ROADMAP.md](./9-CANONICAL-IMPLEMENTATION-ROADMAP.md)

Implement:

- route a small set of existing real patches through the adapter into the new render path
- verify at least one single-instance patch and one repeated-instance patch

Done when:

- the visible render path is `legacy patch -> compatibility adapter -> SceneRenderSink -> RenderPrepare -> DrawQueueBuilder -> render`
- output is coming from the canonical render pipeline, not the old sink path

## Phase 3: Introduce The New Patch Root Above The Same Boundary

Reference:

- [3-CANONICAL-PATCH-STRUCTURE-DESIGN.md](./3-CANONICAL-PATCH-STRUCTURE-DESIGN.md)
- [4-CANONICAL-AUTHORING-MODEL-DESIGN.md](./4-CANONICAL-AUTHORING-MODEL-DESIGN.md)

Implement:

- `PatchProgram`
- `ResourceLibrary`
- `ModulationGraph`
- `SceneDefinition`
- `OutputDefinition`

Keep:

- the legacy compatibility adapter for old patches only

Add:

- a canonical compiler path from the new patch structure to the same `RenderPrimitive[] + RenderView` target

Done when:

- both old and new authoring paths converge on the same canonical scene submission format
- no renderer code needs to know which authoring path produced the scene

// [LAW:one-source-of-truth] The convergence point is canonical scene submission, not duplicate renderer paths.

## Phase 4: Build The New MVP Authoring Surface

Reference:

- [6-CANONICAL-AUTHORING-BLOCK-CATALOG.md](./6-CANONICAL-AUTHORING-BLOCK-CATALOG.md)
- [7-CANONICAL-AUTHORING-UI-DESIGN.md](./7-CANONICAL-AUTHORING-UI-DESIGN.md)

Implement:

- MVP resources
- MVP modulators
- MVP binding sets
- MVP scene assembly objects
- minimal UI workspaces or equivalent internal editors

Done when:

- a user can create a new patch in the new model and render through the same canonical path
- the new path no longer depends on legacy block semantics

## Phase 5: Decommission The Compatibility Adapter

Reference:

- [5-CANONICAL-AUTHORING-GUARDRAILS.md](./5-CANONICAL-AUTHORING-GUARDRAILS.md)

Remove:

- legacy-to-canonical adapter code
- legacy render-boundary shims
- legacy hidden sink output assumptions

Done when:

- supported patches compile through the new patch structure only
- no production render path depends on the legacy patch/block model

## 9. What Can Render Early

The important consequence of this plan is:

- visible rendering does not require the full new UI first
- visible rendering does not require the full new patch structure first
- visible rendering requires only the canonical render boundary plus the compatibility adapter

The minimum proof slice is:

1. one current patch with one visible primitive
2. one current patch with animated transform or color
3. one current patch with repeated instances
4. all of them rendered through the canonical path

## 10. What Must Stay Temporary

The following are migration-only concepts:

- direct translation from current patch/block outputs
- legacy field-name interpretation
- old sink-shaped assumptions
- any adapter logic that exists only to preserve old graph wiring

Temporary code is acceptable only if it satisfies all of these:

1. it lives in the compatibility layer
2. it terminates at canonical scene submission
3. it does not leak below the sink boundary
4. it has deletion criteria

// [LAW:no-mode-explosion] Temporary compatibility is bounded to one layer with an exit plan, rather than becoming a growing matrix of legacy modes.

## 11. What Must Be Canonical Immediately

These things should become canonical from the start, even if authoring remains legacy for a while:

- `SceneRenderSink`
- `RenderPrimitive`
- `RenderView`
- extracted scene packets
- prepare/queue/render staging
- geometry and material catalogs

This prevents the migration from hardening around the wrong seam.

## 12. Mechanical Guardrails

To keep the migration honest, add enforcement that checks:

- legacy code cannot emit backend transport packets directly
- canonical renderer stages do not depend on legacy patch types
- the compatibility adapter is the only module allowed to interpret legacy render wiring
- new authoring code targets canonical scene submission, not legacy sink-era structures

Recommended test categories:

- contract tests for `RenderPrimitive[]` generation from legacy patches
- contract tests for `RenderView` generation from legacy view outputs
- integration tests for full `legacy patch -> canonical render path`
- deletion tests that fail if backend modules import legacy authoring types

## 13. Success Criteria

This migration is succeeding if all of these are true:

1. existing patches can render through the new canonical renderer before the new UI is complete
2. there is exactly one canonical render boundary
3. the legacy system is upstream-only and isolated to one adapter seam
4. new authoring work targets the canonical patch structure rather than extending legacy sink semantics
5. the compatibility layer has explicit removal criteria and is eventually deleted

This migration is failing if any of these happen:

- new renderer work keeps depending on legacy patch field semantics
- adapter logic spreads into multiple renderer modules
- the team keeps two render boundaries alive
- compatibility code becomes the place where new features are added first

## 14. Recommended Near-Term Milestones

In order:

1. Implement `SceneRenderSink` and canonical render-prep/queue stages.
2. Build `LegacyPatchCompatibilityAdapter`.
3. Render one existing patch through the canonical path.
4. Render one animated existing patch through the canonical path.
5. Render one repeated-instance existing patch through the canonical path.
6. Start the new patch-structure compiler above the same boundary.
7. Move new feature work to the new authoring model.
8. Delete the compatibility adapter.

That is the shortest path to seeing real output while still moving toward the correct architecture.
