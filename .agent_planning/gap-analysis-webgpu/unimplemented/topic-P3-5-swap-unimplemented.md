# P3-5: Runtime Loop: The Swap - UNIMPLEMENTED Items

## Item 1: Reset Pulse (Rewind)
**Spec says**: When user clicks "Rewind": (1) CPU sets frameIndex = 0, (2) CPU uploads Reset=1 in Uniform Buffer, (3) Shader: if (uniforms.reset) { state = initial_state; }, (4) Swap proceeds normally.
**Implementation**: No reset/rewind mechanism exists in the Rust renderer engine. `frame_count` is never reset to 0 in tick(). `GlobalUniforms` has no `reset` field (`memory.rs:48-53`). Searching for "reset", "rewind", "Reset" in the Rust renderer source returns no relevant results. The `clear_simulation_planes()` method (`memory.rs:110-117`) zeroes state buffers but is only called at pipeline rebuild, not at runtime rewind.
**Gap**: The entire reset/rewind feature is unimplemented in the GPU renderer. No way for the user to rewind simulation state to initial conditions without rebuilding the pipeline.
**Classification**: UNIMPLEMENTED

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs:48-53` (no reset field)
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs:110-117` (clear only at rebuild)
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:426` (frame_count never reset)

## Item 2: Export/Offline Rendering (Video Export)
**Spec says**: Offline loop: while loop with fixed dt = Frame * (1/60), synchronous dispatch (CPU waits for GPU), readback via copyTextureToBuffer, manual frameIndex increment.
**Implementation**: No offline rendering mode exists. No copyTextureToBuffer for pixel readback. No synchronous render loop. The engine only operates in requestAnimationFrame-driven mode. The debug readback copies instance buffer data (not canvas pixels) via `copy_buffer_to_buffer` (`engine.rs:945-951`).
**Gap**: Video/offline rendering export is entirely unimplemented. Cannot render to MP4 or capture frames programmatically.
**Classification**: UNIMPLEMENTED

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:844-1019` (only rAF mode)
