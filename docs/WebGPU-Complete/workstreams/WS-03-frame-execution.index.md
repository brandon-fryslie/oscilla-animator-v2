# Workstream 03: Frame Execution Pipeline

// [LAW:dataflow-not-control-flow] Frame stages execute in fixed order; variability is expressed via data.

## Purpose

Define end-to-end frame execution from input upload through swap, including pass ordering and resource role transitions.

## Scope (Owned Docs)

- `docs/WebGPU-Complete/P3-1_CPU_to_GPU_Input_Marshalling.md`
- `docs/WebGPU-Complete/P3-2_GPU_Compute_Dispatch_Explained.md`
- `docs/WebGPU-Complete/P3-3_GPU_Draw_Prep__Autonomous_Rendering_Logistics.md`
- `docs/WebGPU-Complete/P3-4__WebGPU_Render_Pass_Deep_Dive.md`
- `docs/WebGPU-Complete/P3-5__Runtime_Loop__The_Swap_Explained.md`

## Contracts Produced

1. Canonical frame stage order.
2. Canonical draw-prep dispatch ownership and record emission semantics.
3. Canonical render-pass execution model for indexed and non-indexed streams.
4. Canonical ping-pong role swap and read-after-write safety model.

## Workstream Dependencies

- `docs/WebGPU-Complete/workstreams/WS-01-runtime-foundation.index.md`
- `docs/WebGPU-Complete/workstreams/WS-02-compiler-lowering.index.md`

## Downstream Consumers

- `docs/WebGPU-Complete/workstreams/WS-04-shape-taxonomy.index.md`
- `docs/WebGPU-Complete/workstreams/WS-05-platform-dx-policy.index.md`

## Primary Functional Slices

- `docs/WebGPU-Complete/workstreams/slices/S01-first-pixel.md`
- `docs/WebGPU-Complete/workstreams/slices/S02-first-type1-shape.md`
- `docs/WebGPU-Complete/workstreams/slices/S03-first-type2-parametric.md`
- `docs/WebGPU-Complete/workstreams/slices/S04-first-type3-ribbon.md`
- `docs/WebGPU-Complete/workstreams/slices/S05-first-type4-sdf.md`
- `docs/WebGPU-Complete/workstreams/slices/S06-first-type5-text.md`

