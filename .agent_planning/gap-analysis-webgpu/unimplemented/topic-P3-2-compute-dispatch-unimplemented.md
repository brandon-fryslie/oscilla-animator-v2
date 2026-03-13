# P3-2: GPU Compute Dispatch - UNIMPLEMENTED Items

## Item 1: Texture and Sampler Bindings
**Spec says**: Binding 3 = Textures (texture_2d, sample), Binding 4 = Sampler (standard linear sampler). These are optional but part of the canonical bind layout.
**Implementation**: No texture or sampler bindings exist in the compute pipeline layout. The compiler simulation layout has 5 entries but they are arena/state/uniform buffers, not textures.
**Gap**: Texture sampling in compute shaders is not implemented. This blocks user-loaded image access from simulation shaders.
**Classification**: UNIMPLEMENTED

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs:379-435`

## Item 2: Atomic Buffer Zone for Accumulations
**Spec says**: For operations like "count particles inside a circle", use a dedicated `atomic<u32>` buffer zone with `atomicAdd`. Atomics serialize execution, use sparingly.
**Implementation**: The draw prep shader does use `atomic<u32>` for indirect buffer writes (`compute.rs:26,72-91`), but there is no general-purpose atomic accumulation buffer zone for simulation use. Simulation shaders have no atomic buffer binding.
**Gap**: No general-purpose atomic accumulation buffer for simulation compute. Only draw-prep uses atomics. User graphs cannot do cross-lane accumulation.
**Classification**: UNIMPLEMENTED

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs:26,72-91` (draw prep atomics only)

## Item 3: Active Count Optimization (Indirect Compute Dispatch)
**Spec says**: Optional upgrade path: use indirect compute dispatch where a preparatory compute step writes ActiveCount to an indirect-dispatch buffer, and the main simulation dispatch reads that buffer.
**Implementation**: Dispatch always uses capacity (max_particles). No indirect compute dispatch mechanism exists. `simulation_dispatch_count_for_wgsl()` uses `particle_count` (capacity) not active count.
**Gap**: Active count optimization is not implemented. Over-dispatch occurs when active count is much less than capacity. This is explicitly noted as optional in the spec.
**Classification**: UNIMPLEMENTED

Files:
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs:142-146`
