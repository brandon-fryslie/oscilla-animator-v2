# 02 - Dynamic Shape Materialization

Spec target: `../WebGPU-Complete/P1-2__Unified_GPU_Shape_Bank_Strategy.md`, `../WebGPU-Complete/P0-3__Refactoring_to_Handle-Based_Architecture.md`

// [LAW:one-source-of-truth] Dynamic shape payload should be derived once from canonical arena/topology inputs, not materialized into a CPU-owned intermediate and then re-uploaded.

## Where We Are

- `src/runtime/ValueExprMaterializer.ts:85-196` evaluates `shapeRef` on the CPU.
- That function resolves topology, computes `vertexCount` and `indexCount`, checks control-point lane counts, materializes the control-point field, bit-casts each point into `Uint32Array` words, allocates `ShapeBank` words, writes the header, and writes sidecar metadata.
- This means control-point payload generation for path shapes is still CPU work.
- The implementation is not just validation. It is the concrete authoring path for frame-volatile shape payload.

## First Draft Proposal

- Split static topology from dynamic payload.
- Static shape templates may still be compiled on the CPU once, but per-frame control-point payload and other dynamic shape parameters should be written by a GPU materialization pass.
- The GPU pass should consume canonical arena slots and topology metadata, then write the live ShapeBank payload directly into GPU-visible storage.
- CPU shape materialization should collapse to validation plus install of immutable metadata only. It should stop allocating and filling frame-volatile param blocks for renderable shapes.
