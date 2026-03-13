# Context: P0-0 - Overview - GPU-Native Visual Instrument Architecture

## Target State
P0-0 describes the full GPU-native architecture:
- CPU as scheduler, GPU as computer
- SoA memory layout, ping-pong storage, indirect draw
- Naga-based compiler emitting structured IR
- Async compiler service with state machine (Idle -> Dirty -> Compiling -> Linking -> Ready)
- Frame loop: Input marshalling -> Compute dispatch -> Draw prep -> Render pass -> Swap
- Async observability readback at 15-30Hz
- WASM boot gate, WebGPU-required runtime, fail-fast diagnostics

## Current State
Most P0-0 requirements are implemented or have clear implementations:
- Arena with Float32Array: `src/runtime/ArenaValueStore.ts:47-49`
- SoA descriptors: `src/compiler/ir/storage-class.ts:80-107`
- Ping-pong state: `src/runtime/RuntimeState.ts:1116-1130` (commitStateWriteBank)
- Naga WASM compiler: `src/compiler/naga-bridge.ts:30-61`
- Async compiler states: `src/types/async-compiler-state.ts:1-7` (adds `error`)
- ShapeBank: `src/runtime/RuntimeState.ts:23-261`
- Indirect draw: `src/compiler/ir/program.ts:363-435` (DrawPrepProgramIR with indexed/nonIndexed regions)
- Boot gate: `src/services/BootService.ts`

Items needing review:
1. Dispatch workgroup calculation consistency between Rust renderer and compiler-generated shaders
2. Vertex pulling shader review (TS-plane vs Rust-plane)
3. Readback rates (5-6Hz vs spec's 15-30Hz suggestion)
4. Input marshalling mechanism (SharedArrayBuffer vs arena header writes)

## Files Involved
- `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs` - Rust renderer engine, dispatch logic
- `src/render/webgpu/shaders.ts` - WebGPU vertex/fragment shaders
- `src/render/wasm/rust/oscilla-rust-renderer/src/render.rs` - Rust render pass
- `src/services/RuntimeService.ts:128` - Spy readback rate (5 Hz)
- `src/render/webgpu/RustWasmWebGPURenderer.ts:192` - Debug readback rate (6 Hz)
- `src/render/rust/runtime-input-layout.ts` - Input marshalling shared memory layout

## Suggested Approach
1. Verify dispatch workgroup calculation in both paths
2. Audit vertex shader to confirm ShapeBank vertex-pulling pattern
3. Benchmark readback at higher frequencies to determine if 15-30Hz is feasible
4. Document rationale for SharedArrayBuffer input marshalling vs arena header approach

## Risks
- Dispatch calculation mismatch could cause OOB GPU access
- Low readback rate may cause stale debug visualizations
- Input marshalling differences are likely intentional but should be documented
