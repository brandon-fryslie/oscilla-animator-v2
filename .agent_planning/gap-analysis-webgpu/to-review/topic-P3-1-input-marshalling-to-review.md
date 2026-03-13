# P3-1: CPU to GPU Input Marshalling - TO-REVIEW Items

## Item 1: SharedArrayBuffer Transfer vs queue.writeBuffer Upload
**Spec says**: CPU serializes inputs into a staging ArrayBuffer(256) and uploads via `device.queue.writeBuffer(targetBuffer, 0, inputService.data, 0, 256)` directly to the Arena header before compute dispatch.
**Implementation**: Uses SharedArrayBuffer + Atomics fence instead. Main thread writes to SharedArrayBuffer via Float32Array word writes (`RustWasmWebGPURenderer.ts:899-904`). Worker reads SharedArrayBuffer and constructs a GlobalUniforms struct, then writes that to a separate GPU uniform buffer via `queue.write_buffer(&self.uniform_buffer, 0, bytes_of(&self.uniforms))` (`memory.rs:419`). Input data flows through shared memory + explicit Atomics fence rather than direct queue.writeBuffer to arena header.
**Gap**: The implementation uses a fundamentally different (and arguably better) transfer mechanism. SharedArrayBuffer allows zero-copy inter-thread communication without PostMessage overhead. The uniform buffer is separate from the arena, rather than being the first 256 bytes of the arena. This is an architectural divergence that works correctly but does not match spec's arena-header model.
**Classification**: TO-REVIEW

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/webgpu/RustWasmWebGPURenderer.ts:899-904,991-1024`
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:1193-1299`
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs:417-419`

## Item 2: Inputs Target Arena_Read vs Separate Uniform Buffer
**Spec says**: "Inputs must be uploaded to Arena_Read" (the current read arena in the ping-pong pair). The first 256 bytes of the storage buffer are reserved for input header.
**Implementation**: Inputs are uploaded to a dedicated GPU uniform buffer (`GlobalUniforms` struct written to `self.uniform_buffer`). The uniform buffer is separate from the state/arena storage buffers. It is bound independently at group(0) binding(4) for simulation, and group(0) binding(0) for render.
**Gap**: The uniform buffer is architecturally separate from the arena, which means inputs do not live "inside" the storage arena. This is a cleaner design (uniforms get optimized GPU hardware paths), but diverges from the spec's "header zone of storage buffer" model. The shader bindings reflect this: the simulation shader has `arena_read`, `arena_write`, `state_read`, `state_write`, and `global_uniforms` as separate bindings.
**Classification**: TO-REVIEW

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:37-55` (DEFAULT_SIMULATION_WGSL bindings)
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs:46-53,131-144`
