This document is the implementation-oriented index for the WebGPU-Complete specification set.

# WebGPU-Complete Implementation Index

## Purpose

- Define the canonical contracts that all sub-docs must follow.
- Provide a dependency map so implementation work can be staged without ambiguity.
- Establish precedence rules when two docs overlap.

// [LAW:one-source-of-truth] This file defines shared contract pointers; leaf docs should not redefine these contracts differently.
// [LAW:single-enforcer] Cross-cutting contracts are owned at one boundary and referenced elsewhere.

## Canonical Contracts

1. **Arena memory/layout contract**
   - Canonical docs:
     - `docs/WebGPU-Complete/P0-1__SoA_Mandate__Memory_Layout_Refactor.md`
     - `docs/WebGPU-Complete/P1-1__Unified_GPU_Buffer_Strategy_Explained.md`
   - Notes:
     - SoA-first descriptor model.
     - Compiler-emitted layout/address metadata is authoritative.

2. **Shape header and topology contract**
   - Canonical doc:
     - `docs/WebGPU-Complete/P1-2__Unified_GPU_Shape_Bank_Strategy.md`
   - Notes:
     - `ShapeHeaderV1` (16-word / 64-byte header) is canonical.
     - Topology mode (`indexed` vs `non-indexed/virtual`) is explicit metadata.

3. **Indirect command ABI contract**
   - Canonical docs:
     - `docs/WebGPU-Complete/P1-3__GPU-Driven_Rendering__Indirect_Buffer.md`
     - `docs/WebGPU-Complete/P3-3_GPU_Draw_Prep__Autonomous_Rendering_Logistics.md`
   - Notes:
     - One physical indirect buffer.
     - Two non-overlapping regions:
       - indexed stream: `DrawIndexedIndirectArgs` (20-byte stride)
       - non-indexed stream: `DrawIndirectArgs` (16-byte stride)
     - No mixed-stride record stream.

4. **Draw-prep ownership contract**
   - Canonical doc:
     - `docs/WebGPU-Complete/P3-3_GPU_Draw_Prep__Autonomous_Rendering_Logistics.md`
   - Notes:
     - Draw-prep kernel is static/canonical.
     - Compiler emits metadata (`drawPrepProgram.sinks`), not draw-prep WGSL source.
     - Compile worker output is also the owner of static install metadata
       (ShapeBank headers + draw-prep descriptor words); swap publishes that
       payload directly without runtime-side repacking.

5. **Render pass camera/depth/blend contract**
   - Canonical doc:
     - `docs/WebGPU-Complete/P3-4__WebGPU_Render_Pass_Deep_Dive.md`
   - Notes:
     - Shared `view_projection_matrix` across all shape classes.
     - Premultiplied alpha blend contract is mandatory.
     - Indexed and non-indexed streams are executed in separate loops.

6. **Text rendering architecture contract**
   - Canonical doc:
     - `docs/WebGPU-Complete/shapes/Shapes 5_ Deep Dive_ Text_Glyph Hybrid Rendering.md`
   - Notes:
     - CPU/worker shaping + GPU MSDF rendering.
     - Explicit buffer ownership across Arena, ShapeBank, and atlas metadata.

## Canonical Frame Order

1. Input marshalling to current read arena/header.
2. Physics/compute dispatch.
3. Draw-prep dispatch (command emission).
4. Render pass (indexed + non-indexed loops).
5. Optional observability copy/readback.
6. Arena role swap.

// [LAW:one-source-of-truth] Swap publishes one canonical compile artifact set:
// GPU passes plus worker-owned static install metadata. Runtime services must
// not rebuild those payloads from live state during swap.

Reference docs:
- `docs/WebGPU-Complete/P3-1_CPU_to_GPU_Input_Marshalling.md`
- `docs/WebGPU-Complete/P3-2_GPU_Compute_Dispatch_Explained.md`
- `docs/WebGPU-Complete/P3-3_GPU_Draw_Prep__Autonomous_Rendering_Logistics.md`
- `docs/WebGPU-Complete/P3-4__WebGPU_Render_Pass_Deep_Dive.md`
- `docs/WebGPU-Complete/P3-5__Runtime_Loop__The_Swap_Explained.md`

## Shape Taxonomy Map

- Taxonomy overview:
  - `docs/WebGPU-Complete/shapes/Shapes 0_ Shape Taxonomy_ A Rendering Overview.md`
- Rigid:
  - `docs/WebGPU-Complete/shapes/Shapes 1_ Rigid Stamp_ Technical Implementation Blueprint.md`
- Parametric:
  - `docs/WebGPU-Complete/shapes/Shapes 2_ The Parametric Curve (Template Instancing).md`
- Ribbon:
  - `docs/WebGPU-Complete/shapes/Shapes 3_ Continuous Ribbon_ Technical Deep Dive.md`
- Procedural/SDF:
  - `docs/WebGPU-Complete/shapes/Shapes 4_ The Procedural Volume (SDFs-Fragment-Driven).md`
- Text hybrid:
  - `docs/WebGPU-Complete/shapes/Shapes 5_ Deep Dive_ Text_Glyph Hybrid Rendering.md`

## Precedence Rules (When Docs Overlap)

1. ABI/layout ownership docs win over taxonomy narrative docs.
   - Example: P1-2/P1-3/P3-3/P3-4 override conflicting shape examples.
2. Compiler boundary docs win over runtime prose for lowering/emission rules.
   - Example: P2-4 overrides any ad-hoc mention of direct WGSL string lowering.
3. Runtime policy docs win over legacy migration guidance when they conflict.
   - Example: `P5-3` overrides dual-path fallback language.

## Implementation Read Order

1. `docs/WebGPU-Complete/P0-0__Overview_-_GPU-Native_Visual_Instrument_Architecture.md`
2. `docs/WebGPU-Complete/AGENTS.md`
3. `docs/WebGPU-Complete/P5-3__Phased_Rollout__Engine_Migration_Strategy.md`
4. `docs/WebGPU-Complete/workstreams/WS-01-runtime-foundation.index.md`
5. `docs/WebGPU-Complete/workstreams/WS-02-compiler-lowering.index.md`
6. `docs/WebGPU-Complete/workstreams/WS-03-frame-execution.index.md`
7. `docs/WebGPU-Complete/workstreams/WS-04-shape-taxonomy.index.md`
8. `docs/WebGPU-Complete/workstreams/WS-05-platform-dx-policy.index.md`

## Functional Slice Sequence

1. `docs/WebGPU-Complete/workstreams/slices/S01-first-pixel.md`
2. `docs/WebGPU-Complete/workstreams/slices/S02-first-type1-shape.md`
3. `docs/WebGPU-Complete/workstreams/slices/S03-first-type2-parametric.md`
4. `docs/WebGPU-Complete/workstreams/slices/S04-first-type3-ribbon.md`
5. `docs/WebGPU-Complete/workstreams/slices/S05-first-type4-sdf.md`
6. `docs/WebGPU-Complete/workstreams/slices/S06-first-type5-text.md`
