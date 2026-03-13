# Context: P1-1 - State Loss on Pipeline Rebuild

## Target State
When the user edits the graph and triggers a pipeline rebuild, GPU simulation state (particle positions, velocities, phasor states, physics state) MUST be preserved. The spec requires a migration compute dispatch that reads old state with old layout offsets and writes to new buffers with new layout offsets.

## Current State
- `engine.rs:790-831` (`rebuild_pipeline()`): Creates entirely new `GpuMemoryArena`, then calls `arena.clear_simulation_planes(&self.queue)` which writes zeros to both ping-pong state buffers and both compiler arena buffers.
- `engine.rs:833-842` (`rebuild_gpu_pipelines()`): Calls `self.arena.clear_simulation_planes(&self.queue)` after replacing simulation pipelines.
- `memory.rs:110-117` (`clear_simulation_planes()`): Zeros `state_buffers[0]`, `state_buffers[1]`, `compiler_arena_buffers[0]`, `compiler_arena_buffers[1]`.
- `shaders.ts:196-214` (`SIMULATION_MIGRATION_COMPUTE_WGSL`): A migration compute shader EXISTS in the JS-side code. It does word-level copy from `srcWords[gid.x]` to `dstWords[gid.x]`. But this shader is only used by the OLD JS-side renderer path, not the Rust engine.

## Files Involved
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs` (rebuild_pipeline, rebuild_gpu_pipelines)
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs` (GpuMemoryArena::new, clear_simulation_planes)
- `/Users/bmf/code/oscilla-animator-v2/src/render/webgpu/shaders.ts` (SIMULATION_MIGRATION_COMPUTE_WGSL - reference)

## Suggested Approach
1. Before destroying old arena in `rebuild_pipeline()`, save references to old state buffers.
2. Create migration compute pipeline (can reuse `SIMULATION_MIGRATION_COMPUTE_WGSL` pattern).
3. Dispatch migration: copy from old state buffers to new state buffers using a compute pass.
4. Only then destroy old buffers.
5. For `rebuild_gpu_pipelines()` (which reuses the same arena), skip the clear and instead preserve existing state.

## Risks
- Layout changes between old and new programs may mean offsets shift. Simple word-copy only works for same-layout migrations. Layout-aware migration requires compiler-emitted offset mapping.
- If old and new buffer sizes differ, migration dispatch workgroup count must cover the larger of the two.
- State buffers may contain stale data from a different program structure; need to handle added/removed slots.
