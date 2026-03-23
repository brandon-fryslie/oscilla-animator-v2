# Workstream 04: Shape Taxonomy Integration

// [LAW:one-type-per-behavior] Shape classes are taxonomy instances with class-specific contracts, not ad-hoc renderer branches.

## Purpose

Define shape-class behavior deltas while preserving shared runtime/compiler/render contracts.

## Scope (Owned Docs)

- `docs/current/webgpu-specs/shapes/Shapes 0_ Shape Taxonomy_ A Rendering Overview.md`
- `docs/current/webgpu-specs/shapes/Shapes 1_ Rigid Stamp_ Technical Implementation Blueprint.md`
- `docs/current/webgpu-specs/shapes/Shapes 2_ The Parametric Curve (Template Instancing).md`
- `docs/current/webgpu-specs/shapes/Shapes 3_ Continuous Ribbon_ Technical Deep Dive.md`
- `docs/current/webgpu-specs/shapes/Shapes 4_ The Procedural Volume (SDFs-Fragment-Driven).md`
- `docs/current/webgpu-specs/shapes/Shapes 5_ Deep Dive_ Text_Glyph Hybrid Rendering.md`

## Contracts Produced

1. Canonical class map for Type1-Type5 shape behavior.
2. Per-class data contracts (ShapeBank/Arena/pipeline expectations).
3. Per-class machine-verifiable behavioral expectations.

## Workstream Dependencies

- `docs/current/webgpu-specs/workstreams/WS-01-runtime-foundation.index.md`
- `docs/current/webgpu-specs/workstreams/WS-02-compiler-lowering.index.md`
- `docs/current/webgpu-specs/workstreams/WS-03-frame-execution.index.md`

## Downstream Consumers

- `docs/current/webgpu-specs/workstreams/WS-05-platform-dx-policy.index.md`

## Primary Functional Slices

- `docs/current/webgpu-specs/workstreams/slices/S02-first-type1-shape.md`
- `docs/current/webgpu-specs/workstreams/slices/S03-first-type2-parametric.md`
- `docs/current/webgpu-specs/workstreams/slices/S04-first-type3-ribbon.md`
- `docs/current/webgpu-specs/workstreams/slices/S05-first-type4-sdf.md`
- `docs/current/webgpu-specs/workstreams/slices/S06-first-type5-text.md`

