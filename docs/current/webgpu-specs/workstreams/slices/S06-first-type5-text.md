# Slice S06: First Type 5 Text/Glyph Render

## Slice Goal

Render a shaped text string through the hybrid text architecture (CPU/worker shaping + GPU MSDF rendering).

## Functional Boundary

- Includes: one shaped glyph run, atlas metadata lookup, glyph-instance render path.
- Excludes: full multilingual fallback strategies, complex text effects stack, dynamic atlas growth policy.

## Required Outcomes

1. Text shaping output is explicit and deterministic (glyph IDs + positions).
2. Buffer ownership is clear across shaped payload, Arena glyph instances, and atlas metadata.
3. Render path uses canonical command ABI and shared camera/depth/blend contracts.
4. Output text is visually stable across scale changes under MSDF evaluation.

## Contract Dependencies

- `docs/current/webgpu-specs/workstreams/WS-01-runtime-foundation.index.md`
- `docs/current/webgpu-specs/workstreams/WS-02-compiler-lowering.index.md`
- `docs/current/webgpu-specs/workstreams/WS-03-frame-execution.index.md`
- `docs/current/webgpu-specs/workstreams/WS-04-shape-taxonomy.index.md`
- `docs/current/webgpu-specs/workstreams/WS-05-platform-dx-policy.index.md`

## Source Specs

- `docs/current/webgpu-specs/P1-2__Unified_GPU_Shape_Bank_Strategy.md`
- `docs/current/webgpu-specs/P3-3_GPU_Draw_Prep__Autonomous_Rendering_Logistics.md`
- `docs/current/webgpu-specs/P3-4__WebGPU_Render_Pass_Deep_Dive.md`
- `docs/current/webgpu-specs/shapes/Shapes 5_ Deep Dive_ Text_Glyph Hybrid Rendering.md`

