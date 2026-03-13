# Context: P3-5 - Reset and Export Gaps

## Target State
Spec requires:
1. A reset/rewind mechanism that resets frameIndex to 0 and uploads a reset flag so shaders reinitialize state
2. An offline rendering mode for video export that runs a synchronous frame loop with pixel readback

## Current State
1. No reset/rewind mechanism. Pipeline rebuild zeroes state but is heavyweight.
2. No offline/export mode. Only rAF-driven rendering exists.

Key files:
- `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs` (entire engine)
- `src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs` (GlobalUniforms, clear_simulation_planes)

## Files Involved
- `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs`
- `src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs`
- `src/render/rust/worker-protocol.ts` (would need RESET and EXPORT messages)
- `src/render/rust/engine.worker.ts` (would need message handlers)
- `src/render/webgpu/RustWasmWebGPURenderer.ts` (would need public reset/export API)

## Suggested Approach
### Reset:
1. Add `reset: f32` field to `GlobalUniforms`
2. Add `RESET` message to worker protocol
3. On reset: zero state buffers, set frame_count=0, upload reset=1 for one frame, then set reset=0
4. Compiler-generated shaders need to handle `reset` uniform

### Export:
1. Add `EXPORT_FRAME` message to worker protocol
2. Create a render-to-texture path with `copyTextureToBuffer`
3. Add synchronous tick mode that waits for GPU completion
4. Return pixel data via Transferable (avoid copy)

## Risks
- Reset requires compiler changes to emit reset-aware shader code
- Export mode needs careful VRAM management for readback buffers
- Synchronous rendering in export mode may be tricky in WASM/worker context
