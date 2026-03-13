# Context: P1-3 - CPU Owns Dynamic Draw Counts

## Target State
The GPU must be the authority for dynamic draw counts (instanceCount, vertexCount). The frame loop flow should be:
1. GPU compute passes determine visibility/alive status of instances.
2. GPU writes counters (atomically) into arena or counter buffer.
3. Draw-prep compute shader reads those GPU-written counters.
4. Draw-prep writes hardware-native indirect commands.
5. Render pass consumes indirect commands without CPU intervention.

The CPU should never write `instanceCount` during the frame loop.

## Current State
- `DrawPrepSinkTablePacker.ts`: CPU packs instance counts into the sink table as u32 words. This is written to a SharedArrayBuffer.
- `RustWasmWebGPURenderer.ts:1047-1056` (`syncSinkTablePlane()`): CPU copies sink table (with instance counts) to shared memory plane every install-revision change.
- `engine.rs:1113-1191` (`sync_sink_table_plane_and_parse_regions()`): Engine reads sink table from shared memory, writes to GPU sink_table_buffer via `queue.write_buffer`.
- `compute.rs:47-48`: Draw-prep shader reads `instanceCount = sinkTableWords[recordBase + RECORD_WORD_INSTANCE_COUNT]` -- this is the CPU-authored count.
- `compute.rs:52-56`: Draw-prep clamps against instance buffer capacity but does NOT read from any GPU-side counter.

## Files Involved
- `/Users/bmf/code/oscilla-animator-v2/src/runtime/DrawPrepSinkTablePacker.ts` (CPU-side packing)
- `/Users/bmf/code/oscilla-animator-v2/src/render/webgpu/RustWasmWebGPURenderer.ts` (sync to shared memory)
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs` (shared plane sync)
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs` (draw-prep shader)
- `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/program.ts` (DrawPrepSinkIR)

## Suggested Approach
1. For static-cardinality sinks (most current use cases), CPU-authored counts are acceptable. Mark these as `instanceCountMode: 'static'` (already exists in `DrawPrepSinkIR`).
2. For dynamic-cardinality sinks (future: culling, particle death), add a GPU-side atomic counter in the arena or a dedicated counter buffer.
3. Modify draw-prep to read from the counter when `instanceCountMode === 'dynamic'`, and from the sink table when `instanceCountMode === 'static'`.
4. Add a culling compute pass before draw-prep that atomically counts visible instances.

## Risks
- Adding GPU-side counters requires atomic buffer support, which is available in WebGPU but needs careful memory ordering.
- The `atomicAdd` pattern in draw-prep already exists (`compute.rs:73`), so the machinery is partially in place.
- Mixing static and dynamic counts within one draw-prep dispatch adds complexity to the shader.
- For the current project stage (no culling, no particle death), this may be premature optimization.
