# Canonical Render Sink Design

This document defines a clean-sheet render boundary for Oscilla.

It is intentionally designed from renderer capabilities and professional engine patterns first, not from current patch-era sink shapes.

// [LAW:one-source-of-truth] This document defines one canonical sink-to-renderer architecture rather than a patched family of competing sink meanings.
// [LAW:one-way-deps] Authoring produces render intent, render-prep produces renderer packets, and the renderer consumes those packets. No backend ABI detail flows upward.

Professional-engine references that inform this design:

- Filament FrameGraph: [FrameGraph](https://google.github.io/filament/notes/framegraph.html)
- Unreal Engine: [Render Dependency Graph](https://dev.epicgames.com/documentation/en-us/unreal-engine/render-dependency-graph-in-unreal-engine)
- Bevy render app staging: [ExtractSchedule](https://docs.rs/bevy/latest/bevy/render/struct.ExtractSchedule.html), [RenderSystems / RenderSet](https://docs.rs/bevy/latest/bevy/render/type.RenderSet.html), [render phases](https://docs.rs/bevy/latest/bevy/render/render_phase/index.html)

## 1. Problem

The current render path still mixes three different concerns:

1. authoring-facing scene semantics
2. runtime field packing
3. backend draw-command ABI details

That creates the wrong top-level abstraction. A professional renderer does not want a sink whose public API is a thin wrapper over hidden `_position`, `_color`, `_scale`, `_rotation`, and `_shape` channels. It wants:

- a scene-facing declaration of renderable primitives
- an extraction boundary that snapshots render intent
- a prepare/queue pipeline that turns intent into renderer packets
- a render graph / pass system that consumes those packets

// [LAW:dataflow-not-control-flow] The correct shape is a fixed stage pipeline: extract -> prepare -> cull/bin -> queue -> render. Variability lives in data, not in stage-skipping flags.
// [LAW:single-enforcer] Contract validation should happen once at extraction, not repeated in sink lowering, packers, draw-prep, and render code.

## 2. Current State

Today the repo has useful evidence, but not a final architecture:

- `WebGPUType1Sink` is a bootstrap block with authoring-facing inputs and backend-facing hidden outputs.
- `render-materialization-pipeline.ts` turns render blocks into slot/materialize steps that still look like field plumbing.
- `DrawPrepSinkTablePacker.ts` publishes descriptor tables shaped around current backend needs.
- `runtime-hotpath-install.ts` publishes static topology and sink metadata into the renderer worker.
- the renderer is converging toward GPU-owned draw-prep and direct topology consumption, but the upper boundary is still shaped by old sink/block concepts.

Actual current dataflow:

```mermaid
flowchart LR
  A["Authoring Blocks"] --> B["Bootstrap Sink Hidden Outputs"]
  B --> C["Render Materialization / Slot Allocation"]
  C --> D["Render Steps + DrawPrepSinkIR"]
  D --> E["Compile-Time Topology Install"]
  E --> F["Sink Table + ShapeBank Upload"]
  F --> G["GPU Draw-Prep"]
  G --> H["Render Pass"]
```

This is already better than the old CPU-realized mesh path, but it still exposes the wrong architectural surface.

## 3. Why The Current Bootstrap Sink Is Not Yet Final

`WebGPUType1Sink` is not final because it couples one sink to one bootstrap rendering slice:

- it exposes separate scalar/vector/material inputs instead of one canonical renderable contract
- it owns hidden backend outputs, which makes the sink itself the packer
- it is named after one backend slice (`WebGPU` + `Type1`) instead of one semantic responsibility
- it forces renderer-facing concepts upward into authoring
- it cannot scale cleanly to rigid, parametric, ribbon, SDF, text, or multi-pass rendering without becoming a mode bucket

`RenderInstances2D` is also not the answer because it is still a legacy scene-to-draw shortcut rather than a professional extract/prepare/queue boundary.

## 4. Canonical Design Principles

### Capability First

The new sink should accept scene capabilities, not backend plumbing:

- geometry capability
- material capability
- transform capability
- visibility / phase capability
- per-instance parameter capability

The sink must not expose draw mode, sink-table descriptors, slot offsets, or ShapeBank words.

### Scene Boundary Above Render Boundary

Professional engines consistently split:

1. scene representation
2. extracted render representation
3. prepared GPU resources and draw packets
4. render graph / pass execution

Filament separates scene/renderables from its FrameGraph. Unreal separates scene data from RDG execution. Bevy separates extract, prepare, queue, phase sort, and render.

// [LAW:locality-or-seam] The repo needs this seam before deeper renderer replacement. Without it, every backend change leaks into authoring blocks.

### Static Resources vs Frame Data

The renderer should consume two resource classes:

- static catalogs published at install / asset-change time
- dynamic per-frame instance packets published every frame

// [LAW:one-source-of-truth] Static geometry/material definitions live in catalogs. Per-frame transforms/material params live in frame packets. Neither concept should be dual-written in both places.

### One Canonical Primitive Type

Type 1, Type 2, ribbon, SDF, and text are not different sink types. They are geometry/material families behind one scene-facing primitive contract.

// [LAW:one-type-per-behavior] There is one sink behavior: submit renderable primitives to a scene view. Shape classes vary by geometry/material family data, not by creating new sink species.

### Renderer Graph Below Queue

The renderer boundary should be a queued set of draw packets and pass inputs. The render graph then decides pass/resource scheduling.

## Non-Goals

This design does not try to:

- define the full future post-processing graph in detail
- redesign text shaping itself
- specify Type 2 math internals beyond the contracts needed at the sink boundary
- keep backward compatibility with bootstrap hidden outputs
- preserve sink-table terminology as a permanent architectural concept

## 5. Final Sink Contract

### Canonical Name

The new sink should be named `SceneRenderSink`.

It is a scene/view boundary, not a type-specific GPU block.

### Authoring-Facing Shape

`SceneRenderSink` consumes:

- `view: RenderView`
- `primitives: Many<RenderPrimitive>`

`RenderPrimitive` is the new canonical authoring-side renderable packet:

```ts
interface RenderPrimitive {
  geometry: GeometryHandle;
  material: MaterialHandle;
  transform: Transform3;
  materialParams: MaterialParamBlock;
  visibilityMask: VisibilityMask;
  renderPhase: RenderPhaseHint;
  sortBias: number;
  objectId: number;
}

interface SceneRenderSink {
  view: RenderView;
  primitives: readonly RenderPrimitive[];
}
```

### Why This Is The Right Sink

- `geometry` is the authoritative source of topology family and local bounds.
- `material` is the authoritative source of shader family, depth/blend policy, and parameter layout.
- `transform` is the authoritative spatial input. The sink does not split position/rotation/scale.
- `materialParams` holds color and other shading data as material-owned parameters, not sink-owned ad hoc fields.
- `renderPhase` and `visibilityMask` are scene intent, not backend ABI.

### What The Sink Explicitly Does Not Know

The sink must not know:

- arena slot numbers
- sink-table descriptor words
- draw-prep record layout
- indexed vs non-indexed ABI stride
- ShapeBank header layout
- backend worker protocol
- WebGPU-specific buffer binding indices

// [LAW:one-way-deps] Backend implementation details remain below extraction/prepare seams and never appear in sink inputs.

### Bootstrap Sink vs Final Sink

| Dimension | Current `WebGPUType1Sink` | Proposed `SceneRenderSink` | Legacy `RenderInstances2D` |
|---|---|---|---|
| Public abstraction | Bootstrap WebGPU sink | Scene/view submission sink | Legacy render block |
| Inputs | `shape`, `posX`, `posY`, `rot`, `scale`, `color` | `view`, `primitives[]` where each primitive has `geometry`, `material`, `transform`, `materialParams`, visibility, phase | position/color/shape-style scene fields |
| Hidden backend outputs | Yes | No | Implicit through legacy lowering |
| Renderer knowledge at sink | High | None | Medium |
| Type specificity | Type 1 only | All renderable families | Legacy 2D-centric |
| Extensibility path | More sink fields / hidden outputs | More geometry/material families | More special cases |

## Contract Surface

### Sink Input Contract

```ts
interface RenderView {
  projection: ProjectionHandle;
  viewport: ViewportRect;
  clearPolicy: ClearPolicy;
  passMask: PassMask;
}
```

```ts
interface GeometryHandle {
  geometryId: number;
}

interface MaterialHandle {
  materialId: number;
}
```

### Sink Output Contract

The sink does not output hidden fields. It publishes one extracted scene packet:

```ts
interface ExtractedScenePacket {
  view: RenderView;
  primitives: readonly ExtractedRenderPrimitive[];
}
```

## 6. Transform / Material Field Packer Contract

The canonical design should not have a permanent concept named “field packer” at the top level. That name describes an implementation detail, not an architectural boundary.

The real boundary is `RenderPrepare`.

### `RenderPrepare` Responsibility

`RenderPrepare` converts extracted scene primitives into GPU-ready frame packets.

Input:

- `ExtractedScenePacket`
- static `GeometryCatalog`
- static `MaterialCatalog`

Output:

- `PreparedRenderFrame`

### Ownership Split

#### Static, install-time ownership

`GeometryCatalog` owns:

- geometry family (`rigid`, `parametric`, `ribbon`, `sdf`, `text`)
- topology/template data
- local bounds
- geometry resource handles

`MaterialCatalog` owns:

- shader family / pipeline family
- parameter schema
- blend/depth/cull policy
- texture/sampler bindings

#### Dynamic, frame-time ownership

`RenderPrepare` owns:

- world transforms
- material parameter payloads
- world-space bounds derived from `geometry.localBounds x transform`
- per-view visibility classification inputs
- primitive keys for batching and sorting

#### Queue-time ownership

`DrawQueueBuilder` owns:

- visible primitive list
- phase binning
- batch keys
- indirect arg generation inputs
- final draw packet ordering

### Canonical Prepared Contract

```ts
interface PreparedRenderFrame {
  viewPacket: PreparedViewPacket;
  instanceTable: GpuInstanceTable;
  materialParamTable: GpuMaterialParamTable;
  visibleInstanceTable: GpuVisibleInstanceTable;
  drawPackets: readonly DrawPacket[];
}

interface DrawPacket {
  phase: RenderPhase;
  pipelineKey: PipelineKey;
  geometryId: number;
  materialId: number;
  instanceSpan: { start: number; count: number };
  sortKey: bigint;
}
```

### Shape Handle Publication, Transform Packing, and Material Packing

These should be separate owners:

- geometry publication belongs to `GeometryCatalog`
- transform packing belongs to `RenderPrepare`
- material param packing belongs to `RenderPrepare`
- draw packet creation belongs to `DrawQueueBuilder`

They should not be collapsed into one sink-owned hidden-output bundle.

// [LAW:single-enforcer] `RenderPrepare` is the only boundary that validates primitive/material/transform compatibility before queueing. Render passes assume prepared packets are valid.

## 7. Renderer Backend Contract

The backend should consume `PreparedRenderFrame`, not sink tables or block-shaped slot bundles.

### Canonical Backend Input

```ts
interface RenderBackendInput {
  views: readonly PreparedViewPacket[];
  geometryCatalog: GeometryCatalogGpuView;
  materialCatalog: MaterialCatalogGpuView;
  instanceTable: GpuInstanceTable;
  materialParamTable: GpuMaterialParamTable;
  drawPackets: readonly DrawPacket[];
}
```

### Stage Ownership

`RenderPrepare` must derive before draw execution:

- world transforms
- bounds
- pipeline/material compatibility
- per-instance parameter packing

`CullAndQueue` must derive before render pass:

- visibility
- phase bins
- sorting
- batch grouping
- indirect command payloads if indirect execution is used

`RenderPass` owns only:

- pass resource binding
- pipeline binding
- draw packet execution
- attachments / load-store policy

The render pass must not rediscover shape classes, reinterpret authoring fields, or infer material compatibility.

### Final Dataflow

```mermaid
flowchart LR
  A["Authoring Scene"] --> B["SceneRenderSink"]
  B --> C["ExtractedScenePacket"]
  C --> D["RenderPrepare"]
  D --> E["Cull / Bin / Sort"]
  E --> F["DrawPacket Queue"]
  F --> G["Render Graph Compile"]
  G --> H["Render Pass Execution"]
```

### Why This Matches Professional Engines

- Filament-style separation: scene/renderables above frame-graph execution.
- Unreal-style separation: queue draw work, then compile/execute graph passes.
- Bevy-style staging: extract -> queue/sort -> prepare -> render.

## 8. Forbidden Legacy Concepts

The clean-sheet sink architecture forbids these concepts from becoming canonical:

1. Hidden sink outputs such as `_position`, `_color`, `_scale`, `_rotation`, `_shape`.
2. A sink named after one backend slice such as `WebGPUType1Sink`.
3. Sink inputs that directly mirror a temporary renderer bootstrap.
4. The sink table as the top-level architectural boundary.
5. Authoring-facing dependence on `indexed` vs `nonIndexed`.
6. Renderer dependence on patch block IDs, port IDs, or slot numbers.
7. CPU-realized mesh expansion from canonical geometry for the main path.
8. A separate sink type per shape class.

## 9. Migration Plan

The new design should be introduced as a new canonical boundary, with current code used only as an adapter during migration.

// [LAW:locality-or-seam] Introduce the new seam first, then move current code behind it.

### Phase 1: Introduce Canonical Contracts

Create new boundary types:

- `RenderPrimitive`
- `RenderView`
- `ExtractedScenePacket`
- `PreparedRenderFrame`
- `DrawPacket`
- `GeometryCatalog`
- `MaterialCatalog`

No backend changes yet. Just define the contracts.

### Phase 2: Build A Legacy Adapter

Add an adapter that translates current bootstrap/patch render outputs into `ExtractedScenePacket`.

Important rule:

- the adapter is migration-only
- the adapter does not define the canonical model
- new renderer work targets the new contracts only

### Phase 3: Replace Render Materialization With Extraction

Current render-step building should stop producing sink-shaped field bundles and instead produce extracted render primitives.

Replace:

- sink hidden outputs -> slot-driven render targets

With:

- extracted primitive packets -> prepare stage inputs

### Phase 4: Replace Sink Table With Prepared Frame Packets

The sink table should be demoted to a temporary internal transport, then deleted.

Replace it with:

- geometry catalog GPU view
- material catalog GPU view
- per-frame instance/material tables
- draw packet queue / indirect packet buffers

### Phase 5: Move Renderer To Draw Packets

The renderer should consume `DrawPacket` batches and pass resources, not sink-shaped records.

At this point:

- shape classes become geometry families
- draw mode becomes queue-time/backend metadata
- the sink remains stable while backend internals evolve

### Phase 6: Delete Bootstrap Sink Concepts

Delete once the new path is active:

- `WebGPUType1Sink` hidden outputs
- sink-table-as-canonical-boundary assumptions
- `RenderInstances2D`-shaped render lowering
- render-stage code that requires authoring slot knowledge

## 10. Risks / Open Questions

1. `RenderView` scope: whether the first implementation supports one view only or multi-view from day one.
2. material parameter layout: fixed struct families vs reflective schemas.
3. instancing policy: whether the first cut supports one primitive stream only or explicit batch instances.
4. culling boundary: CPU cull first, GPU cull later, or both with one authoritative packet contract.
5. render graph depth: whether the first rollout uses one opaque pass plus one transparent pass before a fuller graph compiler lands.

None of these questions require changing the sink contract. They affect prepare/queue/render internals only.

## 11. Concrete Follow-Up Tickets

1. Define `RenderPrimitive`, `RenderView`, `SceneRenderSink`, and `ExtractedScenePacket` types with compile-time tests proving the sink has no hidden backend fields.
2. Introduce `GeometryCatalog` and `MaterialCatalog` as canonical static resource registries with explicit ownership docs and validation tests.
3. Implement `RenderPrepare` that packs transforms, world bounds, and material parameters into one `PreparedRenderFrame`.
4. Implement `DrawQueueBuilder` that bins visible primitives into `opaque`, `transparent`, and `overlay` phase packets and emits deterministic sort keys.
5. Add a migration adapter from current bootstrap sink outputs to `ExtractedScenePacket` and mark it temporary in code and docs.
6. Replace current render-step lowering so `StepRender` references extracted primitive packets instead of sink-shaped slot bundles.
7. Change the renderer worker boundary to consume `PreparedRenderFrame` / `DrawPacket` inputs rather than `drawPrepSinkTableV1` as the top-level contract.
8. Delete `WebGPUType1Sink` hidden outputs and the remaining `RenderInstances2D` render-boundary assumptions after the adapter path is retired.

## What Remains Type 1-Specific vs What Should Generalize Later

Type 1-specific in the first rollout:

- one rigid geometry family in `GeometryCatalog`
- one default material family
- one default view
- simple opaque/transparent phase set

General and meant to remain:

- `SceneRenderSink`
- `RenderPrimitive`
- extraction / prepare / queue / render staging
- geometry and material catalogs
- draw packet queue as the renderer-facing boundary
- render graph / pass layer below queueing

## Recommended Canonical Names

Use these names going forward:

- `SceneRenderSink`
- `RenderPrimitive`
- `ExtractedScenePacket`
- `RenderPrepare`
- `PreparedRenderFrame`
- `DrawQueueBuilder`
- `DrawPacket`
- `GeometryCatalog`
- `MaterialCatalog`

Do not use these names as the canonical architecture:

- `WebGPUType1Sink`
- `RenderInstances2D`
- `DrawPrepSinkTable` as the top-level boundary
- “field packer” as the public contract name
