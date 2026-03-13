# P4-1: GPU Observability / Async Readback System - TO-REVIEW Items

## Item 1: Double-Buffered MAP_READ Staging System
**Spec says**: Two dedicated readback buffers (Readback_A, Readback_B) with COPY_DST | MAP_READ usage, 64KB fixed "Inspector Window", allocated at startup. CPU reads one while GPU writes the other.
**Implementation**: Rust renderer has a single `debug_staging_buffer` (not double-buffered), guarded by `debug_readback_in_flight: Arc<AtomicBool>` that skips readback if a previous one is still mapped. See `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs:1302-1345` and `engine.rs:427-428`.
**Gap**: Single staging buffer with atomic gate instead of double-buffered ping-pong. This works but may have lower throughput than the spec's approach since readback is skipped entirely when one buffer is in flight rather than reading from the other.
**Classification**: TO-REVIEW

## Item 2: Surgical Slice / ProbeTable Strategy
**Spec says**: InspectorService maintains Active Probes list. Compiler generates a ProbeTable. Multiple targeted `copyBufferToBuffer` commands copy specific offsets (e.g., 4 bytes for LFO, 12 bytes for particle vec3) into the readback buffer.
**Implementation**: The Rust renderer does a bulk `debug_staging_buffer().slice(..)` readback of the entire staging buffer, not surgical per-probe copies. The TS side has a more sophisticated `DebugService` with tracked probe subscriptions (`getTrackedDebugProbeSubscriptions()` at `src/services/DebugService.ts:633`), but the Rust GPU side does not use per-probe copyBufferToBuffer commands.
**Gap**: GPU readback is whole-buffer, not probe-targeted. The TS probe subscription model exists but is disconnected from the GPU copy strategy. The spec envisions per-probe surgical copies to minimize bandwidth.
**Classification**: TO-REVIEW

## Item 3: Readback Cadence Control
**Spec says**: Readback runs asynchronously via promise.then(), independent of rAF, reading data "2-3 frames behind."
**Implementation**: Readback cadence is configurable via `debugReadbackHz` (default 6 Hz per `RustWasmWebGPURenderer.ts:192`). The Rust engine triggers readback on a modular frame interval (`engine.rs:937-938`). This is a fixed-interval model, not a promise-driven async loop.
**Gap**: The cadence model is interval-based rather than the spec's continuous async promise loop. Functionally equivalent but different mechanism.
**Classification**: TO-REVIEW

## Item 4: Inspector Service Subscription Model
**Spec says**: Observable/Signal architecture with `Map<NodeID, Subject<number>>` registry. Components subscribe via `inspector.subscribe(id)`, probes are added/removed dynamically.
**Implementation**: `DebugService` (`src/services/DebugService.ts`) implements demand-driven tracking with ref-counted `trackHistoryKey`/`untrackHistoryKey` (lines 380-408). Tracked spy scalar slots are rebuilt on mapping changes (`rebuildTrackedSpyScalarSlots`, line 890). `HistoryService` provides temporal history. Tests validate this at `src/services/__tests__/DebugService-spy-readback.test.ts`.
**Gap**: Implementation uses a pull-based model (UI queries via `tryGetEdgeValue`) rather than push-based Observables/Subjects. Functionally similar but architecturally different from spec's reactive push model.
**Classification**: TO-REVIEW
