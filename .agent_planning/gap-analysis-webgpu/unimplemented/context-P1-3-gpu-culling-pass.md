# Context: P1-3 - GPU-Side Culling Pass

## Target State
Before draw-prep, a culling compute pass should:
1. Check bounds/visibility per instance.
2. Compact visible instance IDs using a stream-compaction pattern.
3. Atomically increment visible counters.
4. Draw-prep then reads reduced counts from these counters, writing fewer instances into indirect commands.

## Current State
- No culling pass exists in the compute pipeline.
- `engine.rs:896-934`: Frame flow is simulation -> assembly -> clear_indirect -> draw_prep -> render. No culling step between simulation and draw-prep.
- `compute.rs:52-56`: Draw-prep clamps instanceCount against buffer capacity but has no visibility awareness.
- Shape bank headers have `boundsMinPacked` and `boundsMaxPacked` fields (words 12-13 per spec) but these are never populated.
- `IndirectRegionPlan` in `render.rs:53-62` has `total_instance_count` which is CPU-summed from sink records.

## Files Involved
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs` (tick, frame flow)
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs` (ComputeDispatcher)
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs` (GpuMemoryArena)
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/render.rs` (IndirectRegionPlan)

## Suggested Approach
1. Add a culling compute pipeline to `ComputeDispatcher`.
2. Culling shader reads instance positions and bounds, compares against viewport frustum.
3. Use atomic counter buffer for visible instance count per sink.
4. Modify draw-prep to read from atomic counter buffer when `instanceCountMode === 'dynamic'`.
5. Wire culling pass into the frame flow between assembly and draw-prep.

## Risks
- Culling requires bounds data in the shape bank (currently zeroed).
- Stream compaction patterns on WebGPU require careful atomics and may need subgroup operations for efficiency.
- For current use cases (< 10,000 instances, all visible), culling overhead may exceed savings.
- This is a substantial feature addition, not a bug fix.
