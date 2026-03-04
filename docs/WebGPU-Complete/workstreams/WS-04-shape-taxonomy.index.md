# Workstream 04: Shape Taxonomy Integration

// [LAW:one-type-per-behavior] Shape classes are taxonomy instances with class-specific contracts, not ad-hoc renderer branches.

## Purpose

Define shape-class behavior deltas while preserving shared runtime/compiler/render contracts.

## Scope (Owned Docs)

- `docs/WebGPU-Complete/shapes/Shapes 0_ Shape Taxonomy_ A Rendering Overview.md`
- `docs/WebGPU-Complete/shapes/Shapes 1_ Rigid Stamp_ Technical Implementation Blueprint.md`
- `docs/WebGPU-Complete/shapes/Shapes 2_ The Parametric Curve (Template Instancing).md`
- `docs/WebGPU-Complete/shapes/Shapes 3_ Continuous Ribbon_ Technical Deep Dive.md`
- `docs/WebGPU-Complete/shapes/Shapes 4_ The Procedural Volume (SDFs-Fragment-Driven).md`
- `docs/WebGPU-Complete/shapes/Shapes 5_ Deep Dive_ Text_Glyph Hybrid Rendering.md`

## Contracts Produced

1. Canonical class map for Type1-Type5 shape behavior.
2. Per-class data contracts (ShapeBank/Arena/pipeline expectations).
3. Per-class machine-verifiable behavioral expectations.

## Workstream Dependencies

- `docs/WebGPU-Complete/workstreams/WS-01-runtime-foundation.index.md`
- `docs/WebGPU-Complete/workstreams/WS-02-compiler-lowering.index.md`
- `docs/WebGPU-Complete/workstreams/WS-03-frame-execution.index.md`

## Downstream Consumers

- `docs/WebGPU-Complete/workstreams/WS-05-platform-dx-policy.index.md`

## Primary Functional Slices

- `docs/WebGPU-Complete/workstreams/slices/S02-first-type1-shape.md`
- `docs/WebGPU-Complete/workstreams/slices/S03-first-type2-parametric.md`
- `docs/WebGPU-Complete/workstreams/slices/S04-first-type3-ribbon.md`
- `docs/WebGPU-Complete/workstreams/slices/S05-first-type4-sdf.md`
- `docs/WebGPU-Complete/workstreams/slices/S06-first-type5-text.md`

