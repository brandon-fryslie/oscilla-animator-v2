# 08 - Arena Header And Uniform Ownership

Spec target: `../WebGPU-Complete/P1-1__Unified_GPU_Buffer_Strategy_Explained.md`, `../WebGPU-Complete/P3-1_CPU_to_GPU_Input_Marshalling.md`

// [LAW:one-source-of-truth] Frame input, time, and view state should have one canonical home in the arena/header contract.

## Where We Are

- `src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs:64-96` defines `GpuMemoryArena` with a dedicated `uniform_buffer` separate from ping-pong state and other storage buffers.
- `src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs:131-144` allocates that uniform buffer as a standalone binding.
- `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:902-1013` computes time, resolution, zoom, pan, and view matrix values on the CPU and writes them through `self.arena.update_uniforms(...)`.
- This diverges from the spec's unified arena-with-header ownership model.

## First Draft Proposal

- Move frame header ownership into the canonical arena contract so simulation, draw-prep, render, and observability all read the same header structure.
- Preserve CPU responsibility for publishing raw input values, but stop maintaining a separate semantic uniform model in parallel with arena/header state.
- Any per-frame derived transforms that truly belong on the GPU should be derived there from canonical header values.
- The migration goal is not merely "use a storage buffer instead of a uniform buffer". It is "one canonical frame state contract".
