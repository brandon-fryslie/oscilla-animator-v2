# Context: P1-1 - Arena Counter Slot Integration

## Target State
The arena should contain a counter slot (in the scalar zone or as a dedicated atomic counter at the end of the buffer). GPU compute shaders increment this counter while generating geometry. Draw-prep reads the counter to determine how many instances to draw. This forms a closed GPU-side loop: arena data + counter -> draw-prep -> indirect buffer -> render.

## Current State
- No atomic counter exists in the arena or any GPU buffer.
- Instance counts are CPU-authored in `DrawPrepSinkTablePacker.ts` and uploaded through the sink table.
- Draw-prep (`compute.rs:47-48`) reads `instanceCount` from `sinkTableWords` which contains CPU-provided values.
- The arena (compiler_arena_buffers + state_buffers) is used only for simulation data, not for counters.
- `DrawPrepSinkIR.instanceCountMode` in `program.ts:373` has `'static' | 'dynamic'` discriminant, but `'dynamic'` is not connected to any GPU counter mechanism.

## Files Involved
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs` (GpuMemoryArena)
- `/Users/bmf/code/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer/src/compute.rs` (draw-prep shader)
- `/Users/bmf/code/oscilla-animator-v2/src/runtime/DrawPrepSinkTablePacker.ts` (CPU-side packing)
- `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/program.ts` (DrawPrepSinkIR)

## Suggested Approach
1. Add a counter buffer (or counter region in arena) to `GpuMemoryArena` with STORAGE usage and atomic access.
2. In simulation compute shaders, increment counter for each "alive" or "visible" instance.
3. In draw-prep, read counter value when `instanceCountMode === 'dynamic'` is indicated.
4. Clear counter at the start of each frame (before simulation dispatch).
5. Update compiler IR to emit counter slot information alongside sink metadata.

## Risks
- Atomic operations on WebGPU require `read_write` storage buffers with proper synchronization.
- Counter buffer must be cleared before each frame, adding a small overhead.
- Need to decide: per-sink counter or global counter? Per-sink requires N atomic slots.
- This is a prerequisite for GPU-driven rendering and culling, not standalone.
