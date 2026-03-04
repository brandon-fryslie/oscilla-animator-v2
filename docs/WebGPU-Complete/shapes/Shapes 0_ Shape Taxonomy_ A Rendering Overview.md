This document defines the canonical shape taxonomy used by the render pipeline.

# Shape Taxonomy Overview

## Related Contracts

- `docs/WebGPU-Complete/IMPLEMENTATION-INDEX.md`
- `docs/WebGPU-Complete/P1-2__Unified_GPU_Shape_Bank_Strategy.md`
- `docs/WebGPU-Complete/P1-3__GPU-Driven_Rendering__Indirect_Buffer.md`
- `docs/WebGPU-Complete/P3-3_GPU_Draw_Prep__Autonomous_Rendering_Logistics.md`
- `docs/WebGPU-Complete/P3-4__WebGPU_Render_Pass_Deep_Dive.md`

## Objective

Classify shape behaviors so compiler/runtime can choose one deterministic path per shape class without ad-hoc rendering branches.

## Invariant

All shape classes must be representable through:

1. canonical `ShapeHeaderV1` metadata
2. Arena-owned instance/state channels
3. draw-prep sink metadata and hardware-native indirect command records

## Taxonomy Classes

| Class | Topology Source | Dominant Cost | Typical Command Stream |
|---|---|---|---|
| Type 1: Rigid | ShapeBank indexed payload | vertex fetch | indexed |
| Type 2: Parametric | template + Arena control points | vertex ALU | indexed or non-indexed |
| Type 3: Ribbon | virtual/non-indexed history topology | vertex ALU | non-indexed |
| Type 4: Procedural (SDF) | proxy geometry + fragment equation | fragment ALU | indexed or non-indexed |
| Type 5: Text Hybrid | shared quad topology + glyph runs | CPU shaping + fragment ALU | indexed or non-indexed |

## Shared Runtime Contract

1. Draw Prep is static kernel + metadata input.
2. Indirect command output is split by ABI:
   - indexed (`20-byte` stride)
   - non-indexed (`16-byte` stride)
3. Render executes both streams in deterministic order.
4. Shared camera/depth contract applies to all classes:
   - one frame `view_projection_matrix`
   - premultiplied-alpha blending policy
   - explicit depth write/test policy per pass

## Class Summaries

### Type 1: Rigid

1. Immutable local topology in ShapeBank.
2. Per-instance transforms in Arena.
3. Draw-prep buckets by compatible indexed topology/material requirements.

See: `docs/WebGPU-Complete/shapes/Shapes 1_ Rigid Stamp_ Technical Implementation Blueprint.md`

### Type 2: Parametric

1. ShapeBank stores template progression / topology metadata.
2. Arena stores control points and dynamic params.
3. Vertex stage evaluates curve and optional extrusion analytically.

See: `docs/WebGPU-Complete/shapes/Shapes 2_ The Parametric Curve (Template Instancing).md`

### Type 3: Ribbon

1. Arena stores ring-buffer history channels.
2. ShapeBank provides virtual-topology metadata only.
3. Draw-prep emits non-indexed commands from active history count.

See: `docs/WebGPU-Complete/shapes/Shapes 3_ Continuous Ribbon_ Technical Deep Dive.md`

### Type 4: Procedural (SDF)

1. Proxy geometry in ShapeBank bounds fragment workload.
2. Arena provides per-instance equation params.
3. Fragment stage performs SDF evaluation and AA coverage.

See: `docs/WebGPU-Complete/shapes/Shapes 4_ The Procedural Volume (SDFs-Fragment-Driven).md`

### Type 5: Text Hybrid

1. CPU/worker performs shaping/layout.
2. Arena carries glyph-run instances and styling params.
3. Fragment stage uses atlas metadata + MSDF evaluation.

See: `docs/WebGPU-Complete/shapes/Shapes 5_ Deep Dive_ Text_Glyph Hybrid Rendering.md`

## Implementation Notes

1. Taxonomy class decides data contract, not independent renderer ownership.
2. New shape types should extend existing class behavior where possible.
3. If a new class is required, define:
   - header metadata additions
   - draw-prep ABI mapping
   - render/depth/blend policy
   - machine-verifiable acceptance criteria

