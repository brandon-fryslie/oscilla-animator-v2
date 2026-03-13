# P4-1: GPU Observability / Async Readback System - UNIMPLEMENTED Items

## Item 1: GPU-Side Histogram Compute for Field Visualization
**Spec says**: For field visualization (e.g., 10,000 particles), dispatch a **Compute Shader** to build histogram buckets in the Arena first. Only read back the 256-bucket histogram (1KB). Never read back more than 64KB per frame.
**Implementation**: Field visualization uses CPU-side `FieldStatsAccumulator` (`src/ui/debug-viz/FieldStatsAccumulator.ts`) that receives raw buffers from runtime tap. No GPU-side histogram compute shader exists.
**Gap**: No GPU compute shader for field downsampling/histogram. All field stats are computed on the CPU from raw buffers. The 64KB readback invariant is not enforced.
**Classification**: UNIMPLEMENTED

## Item 2: NaN/Inf Auto-Pause (GPU-side "Crash Guard")
**Spec says**: Inspector Service acts as a Crash Guard. On NaN/Inf detection: (1) Flag the Node as "CRASHED" (Red skull icon), (2) **Auto-Pause** the engine immediately to prevent NaN propagation, (3) Show the value that caused it.
**Implementation**: `HealthMonitor.ts` records NaN/Inf with batched detection (`recordNaN` at line 181, `recordInfinity` at line 213) and emits diagnostics via RuntimeHealthSnapshot events. `RuntimeErrorEvent` type exists in `src/events/types.ts:405`. However, there is no auto-pause behavior -- NaN detection raises warnings but does not stop the engine.
**Gap**: NaN detection exists but auto-pause is missing. No "Red skull" or "CRASHED" node state. NaN is detected as a diagnostic warning, not a hard stop.
**Classification**: UNIMPLEMENTED

## Item 3: GPU-Side NaN Detection in Readback Data
**Spec says**: Since we read raw bits from the GPU readback, the Inspector Service checks `Number.isNaN(value) || !Number.isFinite(value)` on readback data.
**Implementation**: The Rust readback (`trigger_debug_readback` at `engine.rs:1302`) reads data and logs a preview but does not check for NaN/Inf in the readback values. The TS-side `handleDebugReadbackMessage` at `RustWasmWebGPURenderer.ts:1433` just stores the data without NaN checking.
**Gap**: No NaN/Inf checking on GPU readback data. CPU-side HealthMonitor checks during runtime evaluation but not on GPU readback values.
**Classification**: UNIMPLEMENTED
