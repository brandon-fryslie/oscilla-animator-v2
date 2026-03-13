# Context: P1-1 - Multi-Buffer Architecture vs Monolithic Arena

## Target State
The spec envisions a SINGLE contiguous f32 array partitioned into 5 zones (Header, Scalar, Field, State, Gauge) with compiler-hardcoded offsets. All per-frame data lives in this one buffer, double-buffered for ping-pong.

## Current State
The implementation uses many independent GPU buffers:
- `memory.rs:67`: `uniform_buffer` (GlobalUniforms, 80 bytes)
- `memory.rs:68`: `instance_buffer` (InstanceData[], STORAGE|COPY_DST|COPY_SRC)
- `memory.rs:69`: `topology_buffer` (shape bank, STORAGE|COPY_DST)
- `memory.rs:70`: `sink_table_buffer` (draw prep metadata, STORAGE|COPY_DST)
- `memory.rs:71`: `indirect_buffer` (indirect args, STORAGE|INDIRECT|COPY_DST|COPY_SRC)
- `memory.rs:72`: `vertex_buffer` (geometry, VERTEX|COPY_DST)
- `memory.rs:73`: `index_buffer` (indices, INDEX|COPY_DST)
- `memory.rs:88-89`: `state_buffers[2]` (simulation state, ping-pong)
- `memory.rs:90`: `compiler_arena_buffers[2]` (compiler arena, ping-pong)
- `memory.rs:94`: `staging_buffers[2]` (debug readback, MAP_READ|COPY_DST)

The compiler-side DOES produce an arena zone plan (`storage-class.ts`) with header/scalar/field/state/gauge zones. But this zone plan maps to a JS-side `ArenaValueStore` (CPU arrays), NOT to a monolithic GPU buffer. The Rust engine receives data through shared memory planes and uploads to separate GPU buffers.

## Files Involved
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs` (GpuMemoryArena)
- `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/storage-class.ts` (ArenaZonePlan)
- `/Users/bmf/code/oscilla-animator-v2/src/runtime/ArenaValueStore.ts` (CPU-side arena)

## Suggested Approach
Two options:
1. **Accept the multi-buffer approach**: Document the deviation as intentional. The multi-buffer approach has real advantages (correct usage flags per buffer, independent resizing, cleaner bind group layouts). Update the spec to reflect the implemented architecture.
2. **Move to monolithic**: Merge all data into one large STORAGE buffer. This would require all shaders to use offset-based addressing, which the compiler already supports via zone plans. Would need STORAGE|INDIRECT|COPY_DST|COPY_SRC|VERTEX usage flags on the single buffer, which may not be supported on all WebGPU implementations.

## Risks
- Option 2 may hit WebGPU usage flag combination restrictions (e.g., VERTEX + STORAGE may not compose everywhere).
- Option 1 means the compiler's zone plan offsets don't map directly to GPU buffer addresses, adding a translation layer.
- Current approach works and is shipping. Changing it is high-risk for limited benefit.
