# Slice S01: First Pixel

## Slice Goal

Produce a deterministic, GPU-driven frame that reaches the canvas without shape taxonomy features.

## Functional Boundary

- Includes: boot, compile lifecycle, frame orchestration, render-pass output path.
- Excludes: shape-specific payloads (Type1-Type5), advanced culling, text shaping, physics complexity.

## Required Outcomes

1. WASM/compiler boot completes before runtime starts.
2. Frame loop executes in canonical stage order.
3. Render pass writes visible output to the canvas using canonical blend/depth setup.
4. Swap logic advances frame state without role inversion bugs.

## Contract Dependencies

- `docs/WebGPU-Complete/workstreams/WS-01-runtime-foundation.index.md`
- `docs/WebGPU-Complete/workstreams/WS-02-compiler-lowering.index.md`
- `docs/WebGPU-Complete/workstreams/WS-03-frame-execution.index.md`
- `docs/WebGPU-Complete/workstreams/WS-05-platform-dx-policy.index.md`

## Source Specs

- `docs/WebGPU-Complete/P5-1__WASM_Boot__Developer_Experience_&_Migration.md`
- `docs/WebGPU-Complete/P2-1_Async_Compiler_Service_Architecture.md`
- `docs/WebGPU-Complete/P3-1_CPU_to_GPU_Input_Marshalling.md`
- `docs/WebGPU-Complete/P3-2_GPU_Compute_Dispatch_Explained.md`
- `docs/WebGPU-Complete/P3-4__WebGPU_Render_Pass_Deep_Dive.md`
- `docs/WebGPU-Complete/P3-5__Runtime_Loop__The_Swap_Explained.md`

