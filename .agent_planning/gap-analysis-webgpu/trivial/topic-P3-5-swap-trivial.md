# P3-5: Runtime Loop: The Swap - TRIVIAL Items

## Item 1: Pointer Swap via Ping-Pong Index
**Spec says**: Data does not move, pointers move. Runtime maintains monotonically increasing frameIndex. Current State (Read) = frameIndex % 2, Next State (Write) = (frameIndex + 1) % 2.
**Implementation**: `GpuMemoryArena` maintains `ping_pong_index: usize` (`memory.rs:95`). Swap via `set_ping_pong_index()` which does `index & 1` (`memory.rs:471-473`). During multi-pass simulation, `read_index` alternates per pass: `read_index = (read_index + 1) & 1` (`compute.rs:485`). After all simulation passes, the final read_index is set as the arena's ping_pong_index (`compute.rs:505`).
**Gap**: None. Implementation correctly uses index-based ping-pong without data copies.
**Classification**: TRIVIAL (confirmed match)

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs:95,467-476`
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs:472,485,505`

## Item 2: Pre-Allocated Bind Groups
**Spec says**: Bind groups are pre-allocated and reused. No per-frame bind-group creation in the hot path. At minimum: physicsGroupA, physicsGroupB, readOnlyGroupA, readOnlyGroupB.
**Implementation**: `GpuMemoryArena` creates `compiler_simulation_bind_groups: [wgpu::BindGroup; 2]` at arena creation (`memory.rs:327-380`). Also `state_bind_groups: [wgpu::BindGroup; 2]`, `compiler_arena_bind_groups: [wgpu::BindGroup; 2]`. These are pre-allocated and indexed by ping_pong_index. No bind group creation in the hot path (tick).
**Gap**: None. Implementation pre-allocates all bind groups as required.
**Classification**: TRIVIAL (confirmed match)

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs:89-94,327-380`

## Item 3: Read-After-Write Ordering via Pass Boundaries
**Spec says**: Pass ordering is canonical: Physics writes Arena_Next, Draw Prep reads Arena_Next, Render reads Arena_Next. WebGPU pass boundaries provide visibility guarantees.
**Implementation**: Engine tick follows canonical order: simulation passes (separate compute passes) -> instance assembly (separate compute pass) -> draw prep (separate compute pass) -> render pass (`engine.rs:901-933`). Each stage is a separate compute/render pass, so WebGPU pass boundaries provide the required visibility guarantees.
**Gap**: None. Pass ordering matches spec requirements.
**Classification**: TRIVIAL (confirmed match)

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:896-934`

## Item 4: One-Frame Delay for Feedback Loops
**Spec says**: Because we swap inputs every frame, Arena_Read automatically contains the value from 16ms ago. Feedback loops have inherent 1-frame delay.
**Implementation**: Compiler simulation bind groups are constructed with A=[read_A, write_B, state_A, state_B, uniforms] and B=[read_B, write_A, state_B, state_A, uniforms] (`memory.rs:327-380`). The simulation shader reads from `arena_read` (previous frame) and writes to `arena_write` (current frame), providing the same 1-frame delay semantics.
**Gap**: None. Implementation correctly provides 1-frame delay feedback semantics.
**Classification**: TRIVIAL (confirmed match)

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs:327-380`

## Item 5: Frame Counter Management
**Spec says**: Runtime maintains frameIndex: number in RuntimeContext.
**Implementation**: Engine maintains `frame_count: u64` (`engine.rs:426`), incremented after each successful frame via `self.frame_count = self.frame_count.wrapping_add(1)` (`engine.rs:959`).
**Gap**: Uses u64 wrapping instead of modular arithmetic on a simple integer. Functionally equivalent. The ping-pong index is derived from pass chaining, not directly from frame_count % 2.
**Classification**: TRIVIAL

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:426,959`
