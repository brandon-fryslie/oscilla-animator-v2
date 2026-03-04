# Slice S04: First Type 3 Ribbon

## Slice Goal

Render a continuous ribbon from ring-buffered history using the non-indexed indirect stream.

## Functional Boundary

- Includes: history channel allocation, head-index evolution, active-count-driven non-indexed draw command.
- Excludes: advanced break/miter heuristics and multi-ribbon optimization strategies.

## Required Outcomes

1. Ring-buffer history updates are deterministic and bounded by configured history length.
2. Draw-prep emits ABI-correct non-indexed records (`16-byte` stride) for ribbon topology.
3. Vertex stage reconstructs ribbon geometry from history without out-of-bounds access.
4. Ribbon renders without stale-tail artifacts under normal lifecycle transitions.

## Contract Dependencies

- `docs/WebGPU-Complete/workstreams/WS-01-runtime-foundation.index.md`
- `docs/WebGPU-Complete/workstreams/WS-02-compiler-lowering.index.md`
- `docs/WebGPU-Complete/workstreams/WS-03-frame-execution.index.md`
- `docs/WebGPU-Complete/workstreams/WS-04-shape-taxonomy.index.md`

## Source Specs

- `docs/WebGPU-Complete/P1-3__GPU-Driven_Rendering__Indirect_Buffer.md`
- `docs/WebGPU-Complete/P3-3_GPU_Draw_Prep__Autonomous_Rendering_Logistics.md`
- `docs/WebGPU-Complete/P3-4__WebGPU_Render_Pass_Deep_Dive.md`
- `docs/WebGPU-Complete/shapes/Shapes 3_ Continuous Ribbon_ Technical Deep Dive.md`

