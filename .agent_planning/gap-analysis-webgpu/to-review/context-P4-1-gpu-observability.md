# Context: P4-1 - GPU Observability / Async Readback System

## Target State
The spec requires a "Spyglass" architecture with:
1. Double-buffered MAP_READ staging (Readback_A / Readback_B, 64KB each)
2. Surgical per-probe `copyBufferToBuffer` targeting specific arena offsets
3. Async promise-driven readback loop decoupled from rAF
4. GPU-side histogram compute for field downsampling
5. NaN/Inf crash guard with auto-pause
6. Observable/Subject-based subscription model
7. Sparkline UI components

## Current State
1. Single staging buffer with atomic gate guard (`engine.rs:1302-1345`). Skips frame if prior readback still in flight.
2. Whole-buffer readback, not per-probe surgical copies. TS-side probe tracking exists (`DebugService.ts:633-687`) but is not connected to GPU copy targeting.
3. Fixed-interval readback at configurable Hz (`debugReadbackHz`, default 6Hz) -- `engine.rs:937-938`.
4. No GPU histogram shader. CPU-side `FieldStatsAccumulator.ts` computes stats.
5. NaN detection exists (`HealthMonitor.ts:181-203`) but no auto-pause. Warning diagnostics only.
6. Pull-based query model via `tryGetEdgeValue()` rather than push Subjects.
7. Sparkline component exists (`Sparkline.tsx`).

## Files Involved
- `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs` (trigger_debug_readback, staging buffer)
- `src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs` (GpuMemoryArena, debug_staging_buffer)
- `src/render/webgpu/RustWasmWebGPURenderer.ts` (handleDebugReadbackMessage)
- `src/render/webgpu/WebGPUIndirectArgsInspector.ts` (existing readback pattern)
- `src/services/DebugService.ts` (probe tracking, spy readback)
- `src/runtime/HealthMonitor.ts` (NaN/Inf detection)
- `src/ui/debug-viz/charts/Sparkline.tsx` (sparkline visualization)
- `src/ui/debug-viz/FieldStatsAccumulator.ts` (CPU field stats)

## Suggested Approach
1. **Double-buffer**: Add a second staging buffer in `GpuMemoryArena`, alternate writes via `readback_index % 2`. Low effort.
2. **Surgical copies**: Wire TS-side `getTrackedDebugProbeSubscriptions()` to generate per-slot copy commands in the Rust readback path. Medium effort.
3. **GPU histogram**: Add a compute shader for field downsampling. Ship CPU path first, GPU path as optimization. Lower priority.
4. **NaN auto-pause**: Add auto-pause flag to `HealthMonitor` when NaN count exceeds threshold. Wire to playback store. Medium effort.
5. **64KB invariant**: Add cap to probe subscription count to enforce bandwidth limit. Low effort (already has `maxSubscriptions` param).

## Risks
- Double-buffering adds memory but improves throughput.
- GPU histogram shader is new compute work -- needs testing on all target GPUs.
- Auto-pause may be disruptive to users; consider making it configurable.
