# Slice S05: First Type 4 Procedural (SDF) Shape

## Slice Goal

Render one procedural/SDF shape via proxy geometry and fragment evaluation.

## Functional Boundary

- Includes: proxy shape metadata, Arena parameter channels, SDF fragment coverage path.
- Excludes: multi-SDF boolean composition and advanced raymarch depth variants.

## Required Outcomes

1. Proxy geometry bounds are sourced from canonical shape metadata.
2. Fragment shader evaluates SDF coverage with deterministic AA behavior.
3. Premultiplied alpha and depth policy match canonical render contract.
4. Draw command selection remains ABI-correct for the chosen topology mode.

## Contract Dependencies

- `docs/current/webgpu-specs/workstreams/WS-01-runtime-foundation.index.md`
- `docs/current/webgpu-specs/workstreams/WS-02-compiler-lowering.index.md`
- `docs/current/webgpu-specs/workstreams/WS-03-frame-execution.index.md`
- `docs/current/webgpu-specs/workstreams/WS-04-shape-taxonomy.index.md`

## Source Specs

- `docs/current/webgpu-specs/P1-2__Unified_GPU_Shape_Bank_Strategy.md`
- `docs/current/webgpu-specs/P3-4__WebGPU_Render_Pass_Deep_Dive.md`
- `docs/current/webgpu-specs/shapes/Shapes 4_ The Procedural Volume (SDFs-Fragment-Driven).md`

