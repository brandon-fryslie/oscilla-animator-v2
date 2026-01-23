---
topic: 05
name: Runtime
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/05-runtime.md
generated: 2026-01-23T12:00:00Z
purpose: implementer-context
self_sufficient: true
blocked_by: []
blocks: [06-renderer, 07-diagnostics]
---

# Context: Topic 05 -- Runtime

## What the Spec Requires

1. Execution Model: 5-step tick (sample inputs, update time, execute schedule, process events, write sinks)
2. Storage Model: RuntimeState with scalars (Float32Array), fields (Map<number, Float32Array>), events (Map<number, EventPayload[]>), state (Map<number, Float32Array>)
3. Slot-addressed execution: No string lookups, dense typed arrays, axis-erased at runtime
4. State Management: StateId (blockId + kind), StateMappingScalar, StateMappingField, stride semantics
5. State Migration: Same StateId+stride=copy, different stride=reset+diagnostic, lane remapping via continuity
6. Hot-Swap: Atomic swap, no blank frames, background compilation, state migration, tMs continues
7. Scheduling: Deterministic topologically-sorted order, state reads before computes, state writes after, sinks last
8. Domain Loops: Fixed count, grid 2D, voices, mesh_vertices; compile-time constant bounds
9. Event Processing: Per-tick EventPayload[] buffers with key+value, deterministic ordering (I4), explicit SampleAndHold/Accumulator for event-to-continuous
10. Performance: No type dispatch at runtime, no string lookups, dense arrays, seeded randomness
11. Three-Layer Execution: Opcode (pure scalar), Signal Kernel (domain-aware scalar), Field Kernel (vec2/color/field lane-wise), Materializer (orchestrator)
12. RenderAssembler: Materializes fields, reads scalars, resolves shape2d, composes position (XY+Z), resolves camera, runs projection, computes depth, groups passes, outputs RenderFrameIR
13. Caching (I14): Explicit CacheKey with stepId+frame+inputs+params, invalidation on change
14. Traceability (I20): ValueAttribution with slot, producedBy, transformChain, combinedOn, materializedFor
15. Deterministic Replay (I21): PatchRevision + Seed + InputRecord = identical output, no Math.random()
16. Debugging: TraceBuffer (ring buffer), structural instrumentation (NodeId, StepId, ExprId, ValueSlot)
17. Error Handling: RuntimeError type with location (StepId), frame, context; no silent fallbacks; explicit recovery

## Current State (Topic-Level)

### How It Works Now

The runtime executes compiled `CompiledProgramIR` each frame via `executeFrame()` in `ScheduleExecutor.ts`. It resolves time, clears event flags, executes schedule steps (evalSig, materialize, render, stateWrite, evalEvent, continuityMapBuild, continuityApply, fieldStateWrite) in two phases (non-write then write), then assembles render passes via `RenderAssembler`. State is stored in a flat `Float64Array` indexed by slot offsets from the compiler. Session state (time, external inputs, health, continuity) survives hot-swap; program state (values, cache, state array, events) is recreated on each compile with migration via `StateMigration.ts`. The three-layer execution (Opcode, SignalKernel, FieldKernel) is fully implemented with clear boundaries. The main loop in `main.ts` drives `requestAnimationFrame`, calls `executeFrame`, then `renderFrame`, with health monitoring at 5Hz intervals.

### Patterns to Follow

- **Session/Program state split**: Use `createRuntimeStateFromSession()` for hot-swap
- **Stamp-based cache**: FrameCache uses `frameId` stamps, not explicit clearing
- **Two-phase execution**: Phase 1 reads/evaluates, Phase 2 writes state (ensures reads see previous frame)
- **Buffer pool**: `BufferPool.alloc()` with `releaseAll()` at frame end
- **DebugTap interface**: Optional instrumentation injected into RuntimeState
- **Health monitoring**: Batched aggregation (100ms NaN/Inf windows, 5Hz snapshots)
- **Kernel separation**: Opcodes (pure math), Signal kernels (scalar-to-scalar with domain semantics), Field kernels (lane-wise array operations)

## Work Items

### WI-1: External Input Sampling (PARTIAL)

**Status**: PARTIAL
**Spec requirement**: Tick step 1: "Sample inputs: External inputs (UI, MIDI, etc.)"
**Files involved**:

| File | Role |
|------|------|
| `src/runtime/RuntimeState.ts:187-225` | ExternalInputs interface, updateSmoothing() |
| `src/main.ts` | Animation loop, should wire DOM events |

**Current state**: `ExternalInputs` interface with mouseX/Y, smoothing exists. `updateSmoothing()` function defined. No DOM event listeners, no actual mouse tracking wired in main.ts.
**Required state**: Mouse events captured from canvas, stored in `state.external.mouseX/Y`, `updateSmoothing()` called each frame. MIDI etc. are T2.
**Suggested approach**: Add `mousemove`/`mouseenter`/`mouseleave` listeners on canvas in `main.ts` initialization. Update `state.external.mouseX/Y` in normalized [0,1] coordinates. Call `updateSmoothing(state.external)` at start of each frame.
**Risks**: None significant. Low complexity.
**Depends on**: none

### WI-2: Event System Model (PARTIAL/WRONG)

**Status**: PARTIAL + WRONG
**Spec requirement**: Events are per-tick scratch buffers with `EventPayload[]` (key: string, value: number), capacity preallocated, deterministic ordering (I4), explicit SampleAndHold/Accumulator blocks for event-to-continuous.
**Files involved**:

| File | Role |
|------|------|
| `src/runtime/RuntimeState.ts:461-462` | eventScalars: Uint8Array |
| `src/runtime/EventEvaluator.ts` | evaluateEvent() |
| `src/runtime/ScheduleExecutor.ts:382-393` | evalEvent step |
| `src/compiler/ir/types.ts` | EventExpr types |

**Current state**: Events are boolean flags (`Uint8Array` with 0/1). No payload (key/value), no preallocated capacity, no ordering guarantees. EventEvaluator does wrap edge detection, combine (any/all), but returns only boolean. No SampleAndHold or Accumulator blocks.
**Required state**: EventPayload[] per event slot with string key + numeric value, preallocated capacity, deterministic ordering. SampleAndHold block that latches value on event fire.
**Suggested approach**: This is a significant architectural change. Current boolean events work for current use cases (wrap detection, pulse). Full EventPayload system is likely T2 scope. However, the spec is T1 for basic events. Consider: (a) Keep current boolean events as-is for T1 basic wrap/pulse, (b) add SampleAndHold as a stateful block that reads event scalar + value signal.
**Risks**: Major redesign if done fully. Current system works for implemented features.
**Depends on**: none

### WI-3: RenderAssembler Completeness (PARTIAL)

**Status**: PARTIAL
**Spec requirement**: RenderAssembler must compose worldPosition (XY + Z), resolve camera parameters, run projection kernel, compute depth ordering, group passes by shared geometry+style.
**Files involved**:

| File | Role |
|------|------|
| `src/runtime/RenderAssembler.ts:54-105` | assembleRenderPass() |
| `src/runtime/ScheduleExecutor.ts:254-267` | render step dispatch |

**Current state**: RenderAssembler resolves position/color/scale/shape and produces RenderPassIR. No positionZ composition, no camera, no projection, no depth ordering, no pass grouping by geometry+style.
**Required state**: Full pipeline per spec section "Render Assembly (RenderAssembler)": positionXY + positionZ -> vec3, camera resolve, projection kernel, depth sort, pass grouping.
**Suggested approach**: This is a multi-sprint effort. The missing features (camera, projection, depth) are likely T2 scope given the spec references topic 18 (camera-projection). The current 2D-only pipeline works correctly for T1. Pass grouping by topology IS partially implemented via `groupInstancesByTopology()` for per-instance shapes.
**Risks**: Camera/projection is a large feature area. Depth ordering needs stable sort.
**Depends on**: Topic 18 (camera-projection spec)

### WI-4: Atomic Hot-Swap (MISSING)

**Status**: MISSING
**Spec requirement**: Old program continues rendering while new compiles in background. Atomic swap at specific frame. No blank frames or flicker.
**Files involved**:

| File | Role |
|------|------|
| `src/main.ts:695-779` | compileAndSwap() |

**Current state**: `compileAndSwap()` is `async` but executes compile synchronously on the main thread. During compilation, the animation loop may skip frames (the function awaits but compilation is synchronous JS). No double-buffering of programs.
**Required state**: Background compilation (Web Worker or incremental), old program keeps rendering until new is ready, then atomic swap with state migration at a known frame boundary.
**Suggested approach**: (a) Short-term: Make compile fast enough that single-frame skip is acceptable (current state). (b) Long-term: Move compilation to a Web Worker, keep old program rendering, swap when Worker posts result. The current implementation already does state migration correctly; the gap is just the async/background aspect.
**Risks**: Web Worker adds complexity (IR serialization). Current approach works if compile is fast (<16ms for most patches).
**Depends on**: none

### WI-5: Deterministic Replay (MISSING)

**Status**: MISSING
**Spec requirement (I21)**: Given PatchRevision + Seed + InputRecord, output is identical. No Math.random(). All randomness seeded. Reproducible floating-point.
**Files involved**:

| File | Role |
|------|------|
| `src/runtime/Materializer.ts:434-437` | pseudoRandom() - seeded, deterministic |
| `src/runtime/OpcodeInterpreter.ts:171-184` | hash opcode - deterministic |
| `src/runtime/SignalEvaluator.ts:450-453` | noise kernel - deterministic |
| `src/runtime/__benchmarks__/RenderAssembler.bench.ts:37-48` | Math.random() in benchmarks only |

**Current state**: Randomness in runtime is deterministic (pseudoRandom, hash, noise). No Math.random() in runtime production code (only benchmarks). BUT: no InputRecord recording infrastructure, no global seed management, no replay mechanism.
**Required state**: (a) Deterministic randomness: DONE. (b) InputRecord capture: MISSING. (c) Replay playback: MISSING. (d) Global seed parameter: MISSING.
**Suggested approach**: T2/T3 feature. Current deterministic randomness is the foundation. Add: (a) Global seed in TimeModel/PatchConfig, (b) InputRecord: array of timestamped ExternalInput snapshots, (c) Replay mode that feeds InputRecord instead of live inputs.
**Risks**: Floating-point reproducibility across platforms. IEEE 754 is deterministic but optimizations may vary.
**Depends on**: WI-1 (external input sampling must exist to record)

### WI-6: Value Traceability (MISSING)

**Status**: MISSING
**Spec requirement (I20)**: Every value is attributable. ValueAttribution with slot, producedBy, transformChain, combinedOn, materializedFor. Enables "why is this value X?" quickly.
**Files involved**:

| File | Role |
|------|------|
| `src/runtime/DebugTap.ts` | Current debug interface (records values only) |
| `src/runtime/ScheduleExecutor.ts` | Would need to emit attribution |

**Current state**: DebugTap records slot values and field buffers. No provenance tracking (no producedBy, no transform chain, no bus attribution).
**Required state**: Runtime can answer "what produced this value" for any slot at any frame.
**Suggested approach**: T2/T3 feature. Would require: (a) StepId attribution in schedule (already partially present as step references expr/slot), (b) ValueAttribution map built during execution, (c) Query interface.
**Risks**: Performance overhead if attribution tracked every frame. Could be debug-only (enabled via tap).
**Depends on**: none

### WI-7: Structured RuntimeError (MISSING)

**Status**: MISSING
**Spec requirement**: RuntimeError with kind ('division_by_zero' | 'nan_produced' | 'buffer_overflow'), location (StepId), frame, context. No silent fallbacks.
**Files involved**:

| File | Role |
|------|------|
| `src/runtime/HealthMonitor.ts` | NaN/Inf detection, health snapshots |
| `src/runtime/SignalEvaluator.ts:99-107` | NaN/Inf detection during eval |
| `src/runtime/ScheduleExecutor.ts:1157-1159` | Generic catch in animate() |

**Current state**: NaN/Inf detected and recorded in HealthMetrics (batched, 100ms windows). Diagnostics emitted via EventHub. BUT: no structured RuntimeError type, no StepId attribution, no division-by-zero detection, no buffer overflow detection. Errors in animate() are caught generically.
**Required state**: Structured RuntimeError type. Division by zero detected in OpcodeInterpreter. Buffer overflow detected in BufferPool. NaN/Inf attributed to StepId.
**Suggested approach**: (a) Define RuntimeError interface matching spec. (b) Add StepId to current NaN/Inf recording (requires passing step context through evaluateSignal). (c) Add division-by-zero check in OpcodeInterpreter div/mod. (d) Add buffer overflow check in BufferPool.
**Risks**: Performance overhead of per-operation checks. Division-by-zero in JS returns Infinity (not crash), so detection is optional but valuable for diagnostics.
**Depends on**: none

### WI-8: Cache Invalidation with Input/Param Hashing (PARTIAL)

**Status**: PARTIAL
**Spec requirement (I14)**: CacheKey with stepId, frame, inputs hash, params hash. Cache invalidates when inputs/params change, not just on new frame.
**Files involved**:

| File | Role |
|------|------|
| `src/runtime/RuntimeState.ts:151-182` | FrameCache (stamp-based) |
| `src/runtime/Materializer.ts:193-238` | Field cache (fieldId:instanceId key, frame stamp) |
| `src/runtime/SignalEvaluator.ts:83-88,109-111` | Signal cache (stamp-based) |

**Current state**: Both signal and field caches use frame-stamp invalidation only. Every frame, all caches are logically invalidated. This is correct (no stale data) but over-invalidates (recomputes values that haven't changed).
**Required state**: Spec envisions input-sensitive caching where stable values (params that don't change frame-to-frame) are cached across frames.
**Suggested approach**: T2 optimization. Current per-frame caching is correct and simple. Input-hashing would help for expensive computations that don't change every frame (static params, compile-time constants). Consider: (a) Mark SigExprs as "time-varying" or "stable" during compilation, (b) Stable exprs cached forever until hot-swap, (c) Time-varying exprs cached per-frame (current behavior).
**Risks**: Subtle bugs if invalidation misses a case. Current over-invalidation is safe.
**Depends on**: none

### WI-9: Trace Buffer Debugging (MISSING)

**Status**: MISSING
**Spec requirement**: TraceBuffer with ring buffer of TraceEntry (frame, stepId, slotId, value). Can be enabled without recompiling.
**Files involved**:

| File | Role |
|------|------|
| `src/runtime/DebugTap.ts` | Current debug interface |
| `src/runtime/ScheduleExecutor.ts:223` | tap?.recordSlotValue call |

**Current state**: DebugTap records current-frame values only. No history ring buffer, no stepId tracking, no per-frame trace accumulation.
**Required state**: Ring buffer storing last N frames of (frame, stepId, slotId, value) tuples. Enable/disable without recompile.
**Suggested approach**: Extend DebugTap or create TraceBuffer alongside it. Store ring buffer in SessionState (survives hot-swap). Add stepId parameter to recordSlotValue. HistoryService in `src/ui/debug-viz/HistoryService.ts` already has ring buffer infrastructure but is UI-level; runtime needs its own lean version.
**Risks**: Memory usage if buffer too large. Performance overhead if recording all slots.
**Depends on**: none

### WI-10: Event Ordering Guarantee (MISSING)

**Status**: MISSING
**Spec requirement (I4)**: Events have deterministic ordering: stable across combine operations, stable within-frame scheduling, order matches writer connection order.
**Files involved**:

| File | Role |
|------|------|
| `src/runtime/EventEvaluator.ts:47-54` | combine (any/all) |

**Current state**: Events are boolean (fire/not-fire). Combine uses `some`/`every` which doesn't define ordering for multiple simultaneous fires. No writer connection ordering concept.
**Required state**: When multiple events fire in same frame, their ordering is deterministic based on connection topology.
**Suggested approach**: This matters only when events carry payloads (WI-2). With current boolean-only events, ordering is moot. Defer until EventPayload system is implemented.
**Risks**: None currently. Only relevant with WI-2.
**Depends on**: WI-2
