# P0-0: Overview - GPU-Native Visual Instrument Architecture - TO-REVIEW Items

## Item 1: Compute Dispatch Workgroup Size
**Spec says**: `dispatchWorkgroups(ceil(max_lane_count / 64))` with workgroup_size(64).
**Implementation**: Rust renderer engine at `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:44` uses `@workgroup_size(64)`. The TS-side Naga lowering at `src/compiler/ir/naga-emitter/ScheduleNagaLowering.ts` generates compute shaders that the Naga shim validates. The Rust renderer dispatches based on instance counts.
**Gap**: The dispatch calculation in the Rust engine should be verified to use `ceil(max_lane_count / 64)` exactly. The default simulation WGSL at `engine.rs:37-55` guards with `arrayLength(&state_write)` which is a different guard than `max_lane_count`. However, the compiler-generated WGSL from Naga lowering uses `maxActiveLanes` from `CompiledProgramIR.generatedComputeProgram.maxActiveLanes`. Both paths should be reviewed for consistency.
**Classification**: TO-REVIEW

## Item 2: Render Pass Vertex Pulling
**Spec says**: Vertex shader generates geometry on the fly by reading VertexID and looking up topology in the Shape Bank.
**Implementation**: `src/render/webgpu/shaders.ts` contains vertex/fragment shaders. The Rust renderer at `src/render/wasm/rust/oscilla-rust-renderer/src/render.rs` implements the render pass with indirect draw. Vertex pulling from ShapeBank is implemented in the GPU-side shaders.
**Gap**: Need to verify shaders actually pull vertices from ShapeBank via VertexID rather than using traditional vertex buffers. The TS-plane shaders and Rust-plane shaders may have different approaches. Warrants review.
**Classification**: TO-REVIEW

## Item 3: Observability - Async Readback Throttle Rate
**Spec says**: Throttled at e.g. 15Hz or 30Hz, decoupled from 144Hz render loop.
**Implementation**: `src/services/RuntimeService.ts:128` sets `spyReadbackHz = 5` (5 Hz). Rust renderer debug readback at `src/render/webgpu/RustWasmWebGPURenderer.ts:192` uses `debugReadbackHz: 6` (6 Hz). Both are decoupled from the render loop.
**Gap**: Actual readback rates (5-6 Hz) are significantly lower than spec's suggested 15-30 Hz range. This may be a deliberate performance tradeoff. Should be reviewed to determine if higher rates are feasible or if 5-6 Hz is the validated optimal rate.
**Classification**: TO-REVIEW

## Item 4: Input Marshalling - Header Section Layout
**Spec says**: CPU writes Mouse X/Y, MIDI, dt into staging buffer, copied into Header section (first 256 bytes) of Arena_Read.
**Implementation**: `src/compiler/ir/storage-class.ts:126-128` defines `DEFAULT_ARENA_ALIGNMENT_POLICY` with `headerFloats: 64` (64 floats = 256 bytes). `src/render/rust/runtime-input-layout.ts` defines runtime input layout with separate shared planes. The Rust renderer reads inputs from shared ArrayBuffers rather than writing directly into arena header.
**Gap**: Input marshalling uses shared ArrayBuffers with Atomics signaling (Rust renderer plane), not direct arena header writes. The arena header reservation exists but the actual marshalling mechanism is different from spec. This may be a valid architectural improvement. Review whether the intent of the spec (CPU inputs to GPU) is met by the shared memory approach.
**Classification**: TO-REVIEW
