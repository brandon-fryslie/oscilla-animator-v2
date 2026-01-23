---
topic: 05
name: Runtime
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/05-runtime.md
audited: 2026-01-23T12:00:00Z
has_gaps: true
counts: { done: 22, partial: 8, wrong: 2, missing: 7, na: 3 }
---

# Topic 05: Runtime

## DONE

- **Slot-addressed execution (I8)**: `src/runtime/RuntimeState.ts:60-74` — ValueStore uses `f64: Float64Array` indexed by slot ID, no string lookups in hot loops
- **Dense arrays for fields**: `src/runtime/BufferPool.ts:165-184` — Fields use `Float32Array`, `Uint8ClampedArray`, not sparse maps
- **No string lookups in hot path**: `src/runtime/SignalEvaluator.ts:146` — `state.values.f64[expr.slot as number]` direct array access
- **Tick frame advance**: `src/runtime/ScheduleExecutor.ts:175` — `state.cache.frameId++` monotonic frame ID
- **Update time (tick step 2)**: `src/runtime/ScheduleExecutor.ts:178` — `resolveTime(tAbsMs, timeModel, state.timeState)` resolves tMs, phaseA, phaseB, dt
- **Execute schedule (tick step 3)**: `src/runtime/ScheduleExecutor.ts:200-406` — Steps executed in order with two-phase stateWrite separation
- **Write sinks (tick step 5)**: `src/runtime/ScheduleExecutor.ts:254-267` — Render steps produce RenderPassIR
- **Scalar slot storage**: `src/runtime/RuntimeState.ts:62` — `f64: Float64Array` for scalar values
- **Field slot storage**: `src/runtime/RuntimeState.ts:65` — `objects: Map<ValueSlot, unknown>` holds materialized field buffers (typed arrays)
- **State slot storage**: `src/runtime/RuntimeState.ts:459` — `state: Float64Array` for persistent state
- **StateId as stable semantic identity**: `src/compiler/ir/types.ts:523-532` — `StableStateId = blockId + stateKind`
- **StateMappingScalar type**: `src/compiler/ir/types.ts:540-550` — Matches spec with stateId, slotIndex, stride, initial
- **StateMappingField type**: `src/compiler/ir/types.ts:558-572` — Matches spec with stateId, instanceId, slotStart, laneCount, stride, initial
- **State migration (scalar copy)**: `src/runtime/StateMigration.ts:179-194` — Copy with stride matching
- **State migration (field lane remapping)**: `src/runtime/StateMigration.ts:199-265` — Uses lane mapping from continuity service
- **State migration (new/discard)**: `src/runtime/StateMigration.ts:84-94,140-149` — Initialize new, count discarded
- **Schedule deterministic order**: `src/runtime/ScheduleExecutor.ts:191-199` — Phase 1 (reads/eval) then Phase 2 (writes)
- **Domain loops for fields**: `src/runtime/Materializer.ts:258-380` — `for (let i = 0; i < N; i++)` loop over instance count
- **Three-layer execution (Opcode layer)**: `src/runtime/OpcodeInterpreter.ts` — Pure scalar numeric ops, no domain semantics
- **Three-layer execution (Signal Kernel layer)**: `src/runtime/SignalEvaluator.ts:282-469` — Domain-specific scalar-to-scalar (oscSin, easing, noise, etc.)
- **Three-layer execution (Field Kernel layer)**: `src/runtime/FieldKernels.ts` — Vec2/color/field operations lane-wise
- **Materializer orchestration**: `src/runtime/Materializer.ts:183-241` — Orchestrates buffer allocation, cache check, field expr dispatch, kernel calls

## PARTIAL

- **Sample inputs (tick step 1)**: `src/runtime/RuntimeState.ts:187-225` — ExternalInputs interface exists with mouseX/Y, smoothing function defined. BUT: no mouse event listeners found in main.ts; inputs never actually sampled from DOM events. External input flow is defined but not wired to browser events.
- **Event slot storage**: `src/runtime/RuntimeState.ts:461-462` — `eventScalars: Uint8Array` (0/1 per event) exists. BUT: spec defines `EventPayload[]` buffers with key/value; implementation uses simple boolean flags, no payload structure, no preallocated capacity.
- **Event processing (tick step 4)**: `src/runtime/ScheduleExecutor.ts:382-393` — `evalEvent` step fires events via edge detection. BUT: spec describes per-tick EventPayload[] buffers with string key + numeric value; implementation only has boolean fire/not-fire semantics. No EventBuffer, no EventPayload, no capacity preallocated.
- **RenderAssembler purpose**: `src/runtime/RenderAssembler.ts:54-105` — Resolves position/color/scale/shape into RenderPassIR. BUT: does NOT do positionZ composition, camera parameter resolution, projection kernel, depth ordering, or pass grouping by shared geometry+style as spec requires.
- **Shape2D resolution**: `src/runtime/RuntimeState.ts:21-143` + `src/runtime/RenderAssembler.ts:225-271` — Packed 8-word format with topology/points/flags/style, resolution to ResolvedShape. BUT: only 5 of 8 words used (reserved 5-7 unused), and no per-pass validation of verbs/arity/pointCount as spec requires.
- **Hot-swap continuity of tMs**: `src/runtime/RuntimeState.ts:584-608` — `createRuntimeStateFromSession` preserves timeState. BUT: spec also mentions "Rails continue" on hot-swap, and no explicit rail concept is implemented.
- **No runtime type dispatch**: Runtime generally avoids type dispatch. BUT: `src/runtime/Materializer.ts:262-378` has `switch (expr.kind)` which is arguably compile-time-determined dispatch, and `src/runtime/RuntimeState.ts:65` uses `objects: Map<ValueSlot, unknown>` requiring `as` casts, which is a weaker form of type erasure than spec envisions.
- **Frame cache with explicit keys**: `src/runtime/RuntimeState.ts:151-182` — FrameCache uses stamp-based invalidation, and `src/runtime/Materializer.ts:193-238` uses `fieldId:instanceId` cache key. BUT: spec requires full CacheKey with stepId, frame, inputs hash, params hash. Implementation cache is simpler (frame stamp only, no input/param hashing).

## WRONG

- **RuntimeState storage model**: `src/runtime/RuntimeState.ts:60-74` — Spec defines `scalars: Float32Array`, `fields: Map<number, Float32Array>`, `events: Map<number, EventPayload[]>`, `state: Map<number, Float32Array>`. Implementation uses `f64: Float64Array` (Float64 not Float32), `objects: Map<ValueSlot, unknown>` (generic map not typed field slots), a flat `state: Float64Array` (array not Map), and `eventScalars: Uint8Array` (not EventPayload[]). The semantics are equivalent for the scalar and state cases (just different precision/structure), but the event model is fundamentally different.
- **Event-to-continuous conversion**: Spec requires explicit SampleAndHold/Accumulator blocks. Implementation has `stateRead`/`stateWrite` in FieldExpr for per-lane state but no explicit SampleAndHold or Accumulator block types in the runtime. Events cannot latch values into continuous signals through the specified mechanism.

## MISSING

- **Deterministic replay (I21)**: No implementation. Spec requires that given PatchRevision + Seed + InputRecord, output is identical. No InputRecord recording, no global seed management for replay, no replay mechanism at all.
- **Value traceability (I20)**: No implementation. Spec requires `ValueAttribution` with slot, producedBy, transformChain, combinedOn, materializedFor. No tracing of value provenance exists in runtime.
- **Trace buffer (debugging support)**: No implementation. Spec defines `TraceBuffer` with ring buffer of `TraceEntry` (frame, stepId, slotId, value) that can be enabled without recompiling. DebugTap exists but is simpler (records values, no ring buffer, no stepId tracking).
- **RuntimeError interface**: No implementation. Spec requires structured `RuntimeError` with kind ('division_by_zero' | 'nan_produced' | 'buffer_overflow'), location (StepId), frame, context. Implementation detects NaN/Inf via HealthMonitor but with different structure (no StepId attribution, no RuntimeError type).
- **Atomic swap (hot-swap)**: Spec requires old program continues rendering while new compiles in background, then atomic swap at a specific frame with no blank frames. Implementation in `main.ts:695-779` does synchronous compile+swap in `compileAndSwap()` (async but single-threaded, no background compilation, potential frame drop during compile).
- **Cache invalidation rules (I14)**: Spec requires explicit CacheKey with input hash and param hash, invalidation when inputs/params/stepId change. Implementation uses only frame-stamp invalidation (cache valid for current frame only), which is correct but over-invalidates. No input/param-sensitive caching.
- **Event ordering guarantee (I4)**: Spec requires deterministic event ordering: stable across combine, stable within-frame, order matches writer connection order. Implementation has combine (any/all) but no ordering guarantees for multiple writers to the same event bus.

## N/A

- **Typed scalar/field banks (T3)**: `src/runtime/RuntimeState.ts:577-593` in spec — Explicitly marked T3 implementation option. Implementation uses Float64Array for scalars (sufficient for T1).
- **Grid 2D domain loop**: Spec mentions grid_2d with width x height loops. Implementation handles gridLayout as a field kernel (`FieldKernels.ts:591-625`) with flat index, which is functionally equivalent. The 2D nested loop form is an optimization for T2/T3.
- **Mesh vertices domain**: Spec mentions mesh_vertices resolved from asset at load time. This is a T2/T3 feature for asset-backed domains.
