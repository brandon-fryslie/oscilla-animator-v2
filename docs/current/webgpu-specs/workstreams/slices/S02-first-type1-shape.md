# Slice S02: First Type 1 Shape Render

## Slice Goal

Render a single rigid (Type 1) shape through the canonical path: ShapeBank -> Draw Prep -> indexed indirect render.

## Functional Boundary

- Includes: one valid `ShapeHeaderV1` rigid record, one instance transform in Arena, one indexed indirect command.
- Excludes: heterogeneous batching optimization, advanced material variation, multi-shape sorting heuristics.

## Required Outcomes

1. Shape metadata is encoded using canonical `ShapeHeaderV1`.
2. Draw-prep emits ABI-correct indexed record (`20-byte` stride).
3. Render pass consumes indexed stream and displays the rigid shape in expected transform location.
4. Frame-to-frame stability is maintained under ping-pong swap.

## Contract Dependencies

- `docs/current/webgpu-specs/workstreams/WS-01-runtime-foundation.index.md`
- `docs/current/webgpu-specs/workstreams/WS-02-compiler-lowering.index.md`
- `docs/current/webgpu-specs/workstreams/WS-03-frame-execution.index.md`
- `docs/current/webgpu-specs/workstreams/WS-04-shape-taxonomy.index.md`

## Source Specs

- `docs/current/webgpu-specs/P1-2__Unified_GPU_Shape_Bank_Strategy.md`
- `docs/current/webgpu-specs/P1-3__GPU-Driven_Rendering__Indirect_Buffer.md`
- `docs/current/webgpu-specs/P3-3_GPU_Draw_Prep__Autonomous_Rendering_Logistics.md`
- `docs/current/webgpu-specs/P3-4__WebGPU_Render_Pass_Deep_Dive.md`
- `docs/current/webgpu-specs/shapes/Shapes 1_ Rigid Stamp_ Technical Implementation Blueprint.md`

