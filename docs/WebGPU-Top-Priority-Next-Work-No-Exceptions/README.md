# WebGPU Top Priority Next Work No Exceptions

This folder is a strict accounting of the remaining CPU-owned work that still blocks compliance with `docs/WebGPU-Complete/`.

The current runtime is not "still mostly CPU". The simulation/update path is already GPU-driven. The remaining gaps are narrower and more specific:

1. CPU still materializes shape payloads and draw-prep source data.
2. CPU still expands `ShapeBank` records into classic vertex/index buffers.
3. The render pass still consumes those realized mesh buffers instead of pulling geometry from canonical GPU-owned shape data.
4. Some supporting contracts around arena headers, taxonomy, observability, and post-core class expansion are still behind the spec.

// [LAW:one-source-of-truth] Every migration topic below is framed around restoring one canonical GPU-owned representation instead of maintaining CPU mirrors.
// [LAW:dataflow-not-control-flow] The target architecture keeps the same frame stages every frame; variability lives in buffer contents, not optional CPU preparation branches.

## How the topics fit together

Today the chain is:

`compile -> runtime install materializes CPU arena + CPU ShapeBank -> CPU packs sink table -> renderer copies shared planes -> worker realizes mesh buffers on CPU -> render pass draws realized buffers`

The spec target is:

`compile -> static GPU-ready assets uploaded once -> frame input lands in arena/header -> GPU materializes any dynamic shape payload -> GPU draw-prep derives indirect args from canonical buffers -> render pass pulls topology/params directly from GPU-owned shape data`

## Document map

- [Actionable Roadmap](./ROADMAP.md)
- [01 - ShapeBank Canonical Contract](./01-ShapeBank-Canonical-Contract.md)
- [02 - Dynamic Shape Materialization](./02-Dynamic-Shape-Materialization.md)
- [03 - Install-Time CPU Runtime Execution](./03-Install-Time-CPU-Runtime-Execution.md)
- [04 - Draw Prep Sink Table Packing](./04-Draw-Prep-Sink-Table-Packing.md)
- [05 - Draw Prep Compute Shader Scope](./05-Draw-Prep-Compute-Shader-Scope.md)
- [06 - Worker CPU Mesh Realization](./06-Worker-CPU-Mesh-Realization.md)
- [07 - Render Pass Geometry Consumption](./07-Render-Pass-Geometry-Consumption.md)
- [08 - Arena Header And Uniform Ownership](./08-Arena-Header-And-Uniform-Ownership.md)
- [09 - Shape Taxonomy And Draw Mode Classification](./09-Shape-Taxonomy-And-Draw-Mode-Classification.md)
- [10 - Observability And Readback](./10-Observability-And-Readback.md)
- [11 - Type 2 Parametric Foundation](./11-Type-2-Parametric-Foundation.md)

## Scope note

These documents are intentionally short. They are exhaustive only in the sense that each one names the concrete code and functionality that still needs to be replaced, then gives a first-draft proposal for moving that ownership to the GPU.
