# Workstream 03: Frame Execution Pipeline

// [LAW:dataflow-not-control-flow] Frame stages execute in fixed order; variability is expressed via data.

## Purpose

Define end-to-end frame execution from input upload through swap, including pass ordering and resource role transitions.

## Scope (Owned Docs)

- `docs/current/webgpu-specs/P3-1_CPU_to_GPU_Input_Marshalling.md`
- `docs/current/webgpu-specs/P3-2_GPU_Compute_Dispatch_Explained.md`
- `docs/current/webgpu-specs/P3-3_GPU_Draw_Prep__Autonomous_Rendering_Logistics.md`
- `docs/current/webgpu-specs/P3-4__WebGPU_Render_Pass_Deep_Dive.md`
- `docs/current/webgpu-specs/P3-5__Runtime_Loop__The_Swap_Explained.md`

## Contracts Produced

1. Canonical frame stage order.
2. Canonical draw-prep dispatch ownership and record emission semantics.
3. Canonical render-pass execution model for indexed and non-indexed streams.
4. Canonical ping-pong role swap and read-after-write safety model.

## Workstream Dependencies

- `docs/current/webgpu-specs/workstreams/WS-01-runtime-foundation.index.md`
- `docs/current/webgpu-specs/workstreams/WS-02-compiler-lowering.index.md`

## Downstream Consumers

- `docs/current/webgpu-specs/workstreams/WS-04-shape-taxonomy.index.md`
- `docs/current/webgpu-specs/workstreams/WS-05-platform-dx-policy.index.md`

## Primary Functional Slices

- `docs/current/webgpu-specs/workstreams/slices/S01-first-pixel.md`
- `docs/current/webgpu-specs/workstreams/slices/S02-first-type1-shape.md`
- `docs/current/webgpu-specs/workstreams/slices/S03-first-type2-parametric.md`
- `docs/current/webgpu-specs/workstreams/slices/S04-first-type3-ribbon.md`
- `docs/current/webgpu-specs/workstreams/slices/S05-first-type4-sdf.md`
- `docs/current/webgpu-specs/workstreams/slices/S06-first-type5-text.md`

