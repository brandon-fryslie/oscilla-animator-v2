# Actionable Roadmap

This document turns the 11 topic notes in this directory into an execution roadmap.

The goal is not to restate the WebGPU spec. The goal is to make the remaining work sequenceable, bounded, and verifiable so we can get from the current codebase to a working `docs/WebGPU-Complete/` render path again.

// [LAW:verifiable-goals] Every milestone below has explicit "done when" conditions so progress is measurable.
// [LAW:one-source-of-truth] This roadmap is derived from the concrete topic docs in this directory; it is the execution order view over that same work, not a second competing backlog.

## Immediate Goal

Get the current codebase rendering again through the canonical WebGPU path.

That means:

- no new speculative feature work on the critical path
- no attempt to jump directly to the fully mature future architecture
- use graph transformation to move ownership node-by-node until the current graph matches `docs/WebGPU-Complete/`

## Current Graph vs Spec Graph

Today the critical path is effectively:

```text
compile
-> runtime install materializes CPU arena + CPU ShapeBank
-> CPU packs sink table
-> renderer copies shared planes
-> worker realizes mesh buffers on CPU
-> render pass draws realized buffers
```

The spec target is:

```text
compile
-> static GPU-ready assets uploaded once
-> frame input lands in arena/header
-> GPU materializes dynamic shape payload if needed
-> GPU draw-prep derives indirect args from canonical buffers
-> render pass consumes canonical GPU-owned geometry/topology data
```

The roadmap below treats that change as graph transformation:

- `normalize`: make the current boundary explicit
- `replace`: swap node internals behind a stable seam
- `move-edge`: move ownership of runtime data from CPU nodes to GPU nodes
- `delete`: remove compatibility nodes only after replacement is live

// [LAW:dataflow-not-control-flow] The migration should preserve the frame-stage sequence and move ownership through data contracts, not through temporary branching and dual execution paths.

## Critical Path

### Milestone 0: Freeze Canonical Contracts

Topics:

- [01 - ShapeBank Canonical Contract](./01-ShapeBank-Canonical-Contract.md)
- [09 - Shape Taxonomy And Draw Mode Classification](./09-Shape-Taxonomy-And-Draw-Mode-Classification.md) (minimum viable slice only)

Graph change:

- `normalize(ShapeBank)` from staging format to canonical topology source
- `normalize(shape class)` from implicit mesh behavior to explicit execution contract

Why first:

- Every later step depends on knowing what ShapeBank means
- Every later step depends on knowing what draw/render contract a class is supposed to use

Done when:

- `ShapeHeaderV1` is treated as declarative canonical metadata
- worker CPU realization no longer mutates canonical header fields
- one minimal shape-class contract exists for the first working slice

### Milestone 1: Restore One Working Non-CPU-Mesh Render Slice

Topics:

- [06 - Worker CPU Mesh Realization](./06-Worker-CPU-Mesh-Realization.md)
- [07 - Render Pass Geometry Consumption](./07-Render-Pass-Geometry-Consumption.md)
- [09 - Shape Taxonomy And Draw Mode Classification](./09-Shape-Taxonomy-And-Draw-Mode-Classification.md) (Type 1 scope)

Graph change:

- `replace(worker CPU mesh realization, canonical GPU geometry consumption)`
- `replace(render realized mesh input, ShapeBank/topology-driven geometry consumption)`

Why second:

- This is the shortest path to "render stuff again" through a more canonical geometry source
- It removes the worst duplicate source-of-truth problem first

Done when:

- at least one real shape class renders without worker CPU mesh realization
- the render pass for that class does not depend on CPU-generated vertex/index buffers
- the app can produce a visible rendered result again through that slice

Scope rule:

- do **not** broaden this milestone to all shape classes
- get one class working end-to-end first

### Milestone 2: Move Draw Command Ownership Back To The GPU

Topics:

- [04 - Draw Prep Sink Table Packing](./04-Draw-Prep-Sink-Table-Packing.md)
- [05 - Draw Prep Compute Shader Scope](./05-Draw-Prep-Compute-Shader-Scope.md)

Graph change:

- `move-edge(draw command derivation, CPU -> GPU draw-prep)`
- `replace(CPU packed sink payload, GPU-derived indirect command state)`

Why now:

- once geometry source is canonical again, draw-prep becomes the next wrong owner
- this is the point where indirect args stop being "GPU-written copies of CPU decisions"

Done when:

- CPU no longer authors per-frame draw-prep record payload
- draw-prep compute derives runtime command fields from canonical GPU state
- indirect buffer contents are a genuine GPU-owned product

### Milestone 3: Remove Install-Time CPU Runtime Execution

Topics:

- [02 - Dynamic Shape Materialization](./02-Dynamic-Shape-Materialization.md)
- [03 - Install-Time CPU Runtime Execution](./03-Install-Time-CPU-Runtime-Execution.md)
- [08 - Arena Header And Uniform Ownership](./08-Arena-Header-And-Uniform-Ownership.md)

Graph change:

- `move-edge(dynamic shape payload authoring, CPU install -> GPU frame stages)`
- `replace(first-frame CPU precomputation, same canonical GPU stages used every frame)`
- `merge(frame-state ownership, separate uniform model + header model -> one canonical header contract)`

Why after Milestone 2:

- this is broader and riskier than simply restoring geometry and draw ownership
- it is easier to delete install-time CPU execution once there is already a working GPU render path

Done when:

- install publishes canonical inputs and assets, not frame products
- first frame and later frames use the same runtime stage model
- frame input, time, and view state have one canonical contract
- dynamic shape payloads are no longer CPU-authored frame products

### Milestone 4: Confidence And Debuggability

Topics:

- [10 - Observability And Readback](./10-Observability-And-Readback.md)

Graph change:

- `replace(ad hoc debug readback, canonical readback pipeline)`

Why here:

- this is not the first blocker to rendering again
- but once the pipeline is moving, lack of proper readback becomes a major productivity drag

Done when:

- indirect args and targeted probe slices can be read back through one real worker-backed path
- debug data is published structurally rather than through console previews and stubs

## Post-Core Work

### Milestone 5: Type 5 Text

Topics:

- [11 - Type 5 Text Pipeline](./11-Type-5-Text-Pipeline.md)

This is intentionally **not** on the critical path for getting the renderer working again.

Do this after the base ShapeBank/draw-prep/render ownership model is corrected.

Done when:

- text enters the system as a real shape class with its own ownership split
- text is not forced through the generic realized-mesh compatibility path

## Recommended Execution Order

The practical order should be:

1. 01 ShapeBank canonical contract
2. 09 minimal shape taxonomy contract for the first slice
3. 06 worker CPU mesh realization removal for one class
4. 07 render-pass geometry consumption for that same class
5. 04 CPU draw-prep sink-table packing removal
6. 05 draw-prep compute expansion
7. 02 dynamic shape materialization move to GPU path
8. 03 install-time CPU runtime execution removal
9. 08 arena header and uniform ownership unification
10. 10 observability and readback hardening
11. 11 Type 5 text

This order is not "spec order". It is "fastest route back to a working renderer while removing the highest-risk duplicate ownership first."

## What Counts As "Render Stuff Again"

The first success gate should be narrow:

- one shape class
- visible output on canvas
- canonical ShapeBank/topology meaning
- no worker CPU mesh realization for that class
- no regression to legacy mesh ownership for that slice

Once that gate is passed, the rest of the roadmap becomes much less speculative.

## What Not To Do

Avoid these traps:

1. Do not try to finish all shape classes before one class works end-to-end.
2. Do not mix draw-prep ownership migration with text or post-processing work.
3. Do not keep both CPU and GPU versions of the same runtime-derived command/data product longer than necessary.
4. Do not broaden Milestone 1 into a full future-architecture rewrite.
5. Do not let observability remain a stub once the new path becomes hard to debug.

## Relationship To Future Architecture

`docs/WebGPU-Future/` documents the broader architecture direction after this migration.

This roadmap is narrower:

- it is only concerned with `current code -> WebGPU-Complete`
- it uses graph-transformation thinking because that is the safest way to execute the migration
- it intentionally stops before broader render-graph feature composition

## Related Documents

- [README](./README.md)
- [01 - ShapeBank Canonical Contract](./01-ShapeBank-Canonical-Contract.md)
- [06 - Worker CPU Mesh Realization](./06-Worker-CPU-Mesh-Realization.md)
- [07 - Render Pass Geometry Consumption](./07-Render-Pass-Geometry-Consumption.md)
- [04 - Draw Prep Sink Table Packing](./04-Draw-Prep-Sink-Table-Packing.md)
- [05 - Draw Prep Compute Shader Scope](./05-Draw-Prep-Compute-Shader-Scope.md)
- [docs/WebGPU-Future/README.md](../WebGPU-Future/README.md)

