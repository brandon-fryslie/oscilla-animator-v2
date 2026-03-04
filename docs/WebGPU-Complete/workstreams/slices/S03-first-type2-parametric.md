# Slice S03: First Type 2 Parametric Shape

## Slice Goal

Render a parametric curve shape using template topology + per-instance control points.

## Functional Boundary

- Includes: template topology metadata, Arena control-point channels, analytic vertex evaluation for one parametric class.
- Excludes: arc-length reparameterization, high-control-point optimization, multiple parametric families in one slice.

## Required Outcomes

1. Parametric topology is represented through canonical shape metadata (no ad-hoc header schema).
2. Vertex stage resolves control-point channels deterministically per instance.
3. Draw-prep produces compatible command records (indexed or non-indexed, as defined by the shape).
4. Render output is stable under frame updates and swap.

## Contract Dependencies

- `docs/WebGPU-Complete/workstreams/WS-01-runtime-foundation.index.md`
- `docs/WebGPU-Complete/workstreams/WS-02-compiler-lowering.index.md`
- `docs/WebGPU-Complete/workstreams/WS-03-frame-execution.index.md`
- `docs/WebGPU-Complete/workstreams/WS-04-shape-taxonomy.index.md`

## Source Specs

- `docs/WebGPU-Complete/P1-2__Unified_GPU_Shape_Bank_Strategy.md`
- `docs/WebGPU-Complete/P3-3_GPU_Draw_Prep__Autonomous_Rendering_Logistics.md`
- `docs/WebGPU-Complete/P3-4__WebGPU_Render_Pass_Deep_Dive.md`
- `docs/WebGPU-Complete/shapes/Shapes 2_ The Parametric Curve (Template Instancing).md`

