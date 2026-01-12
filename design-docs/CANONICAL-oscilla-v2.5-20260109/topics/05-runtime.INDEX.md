---
title: "Runtime - Index"
source: 05-runtime.md
source_hash: 312e503b7c28
tier: T1
---

# Runtime - Index

Dense, token-efficient reference for rapid contradiction detection and navigation.

---

## 1. Core Definitions

**Runtime**: Executes CompiledProgramIR frame-by-frame with slot-addressed, axis-erased, deterministic execution model.

**Key Properties**:
- Slot-addressed (no string lookups in hot loops)
- Axis-erased (no type tags at runtime)
- Deterministic (same inputs → same outputs)
- State-explicit (only stateful primitives have memory)

**Related Topics**: 04-compilation, 03-time-system
**Key Terms**: StateSlot, Schedule
**Relevant Invariants**: I1 (monotonic time), I3 (state continuity), I8 (slot-addressed execution)

---

## 2. Execution Model

**One Tick (Frame)** sequence:
1. Sample inputs (UI, MIDI, etc.)
2. Update time (tMs, phaseA, phaseB, progress)
3. Execute schedule (continuous subgraph in order)
4. Process events (discrete occurrences for this tick)
5. Write sinks (render outputs)

**Tick Timing**: Target 5-10ms per frame (60-200 fps)

**Compile-Time Invariants**: All axis resolution at compile time; no runtime type checking or dispatch.

---

## 3. Storage Model

**Slot Types**:
- **ScalarSlot**: Single value (number, boolean, or 2/3/4-tuple)
- **FieldSlot**: Many lanes (Float32Array, Int32Array, Uint8Array) indexed by DomainId
- **EventSlot**: Per-tick buffer of EventPayload[]
- **StateSlot**: Persistent state (scalar or per-lane Float32Array)

**RuntimeState Layout**:
```
{
  scalars: Float32Array,           // All scalar values
  fields: Map<id, Float32Array>,   // Field values by slot id
  events: Map<id, EventPayload[]>, // Event buffers by slot id
  state: Map<id, Float32Array>     // Persistent state by slot id
}
```

---

## 4. State Management

**State Allocation by Cardinality**:
- `one`: Single value
- `many(domain)`: Array of N(domain) values
- `zero`: No state (compile-time constant)

**State Keying**: `(blockId, laneIndex)` where blockId is stable UUID.

**State Migration (I3)** on hot-swap:
- Same StateId + same type/layout → Copy
- Same StateId + compatible layout → Transform
- Different StateId or incompatible → Reset + diagnostic

**Stateful Primitives**: UnitDelay, Lag, Phasor, SampleAndHold only.

---

## 5. Scheduling & Execution

**Schedule Execution**: Linear walk of steps with data-dependency ordering.

**Step Kinds**:
- `eval_scalar`: `scalars[slot_id] = evaluateNode(nodeId)`
- `eval_field`: For each lane in domain, `fields[slot_id][i] = evaluateNode(nodeId, i)`
- `state_read`: `scalars[slot_id] = state[stateId][0]`
- `state_write`: `state[stateId][0] = scalars[slot_id]`

**Deterministic Order**:
1. Topologically sorted by data dependencies
2. State reads before dependent computations
3. State writes after computations complete
4. Render sinks last

**Domain Loops**: Fixed-count, grid-2D, voices, mesh_vertices loop bounds are compile-time constants.

---

## 6. Events & Performance

**Event Buffer Model**:
- Per-tick scratch buffers (cleared each frame)
- Deterministic ordering: stable across combine, within-frame scheduling, matches writer connection order
- No implicit event-to-continuous conversion (requires SampleAndHold or Accumulator)

**Performance Constraints**:
- No runtime type dispatch (slot-selection instead)
- No string key lookups (use slot indices)
- Dense arrays for fields (not sparse maps)
- Type information fully erased at compile time

**Hot-Swap Continuity**:
- tMs continues unchanged
- Rails continue
- State preserved/migrated by StateId or reset with diagnostic
- Caches invalidated, rebuilt on demand
- Atomic swap with no blank frames

---

## 7. Observability & Traceability

**Cache Keys (I14)**: Explicit `(stepId, frame, inputs, params)` with validUntil frame.

**Cache Invalidation**: When input/param values change, StateId changes (hot-swap), or frame changes (time-varying).

**Traceability (I20)**: Every value attributable via `(slot, producedBy, transformChain, combinedOn, materializedFor)` enabling "why is this X?" queries.

**Deterministic Replay (I21)**: Given PatchRevision, Seed, InputRecord → identical output. No Math.random(); all randomness seeded; deterministic event ordering; stable scheduling.

**Error Handling**: Explicit errors with kind/location/frame/context; no silent fallbacks; non-fatal errors logged with attribution, safe fallback value, continue execution, surface in UI.

**Debugging Support**:
- Ring buffers for low-overhead tracing (frame, stepId, slotId, value)
- Structural instrumentation: NodeId → block, StepId → schedule step, ExprId → expression, ValueSlot → storage
- No heuristic tracing

---

## Contradiction-Detection Checklist

- [ ] Verify no runtime type dispatch or string lookups exist
- [ ] Confirm state allocation matches cardinality rules
- [ ] Check schedule respects topological + state ordering
- [ ] Validate hot-swap state migration rules
- [ ] Ensure all caches have explicit invalidation keys
- [ ] Confirm deterministic replay requirements (no Math.random(), seeded RNG)
- [ ] Verify error handling surfaces all errors explicitly
- [ ] Check traceability chain complete for value attribution
