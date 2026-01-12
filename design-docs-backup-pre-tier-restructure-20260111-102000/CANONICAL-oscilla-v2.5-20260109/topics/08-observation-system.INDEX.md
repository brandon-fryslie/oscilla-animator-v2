# Runtime Observation System - Indexed Summary

**Tier**: T2 (Debugging)
**Size**: 597 lines → ~135 lines (23% compression)

## Design Principles [L33-42]
1. **Bounded**: Ring buffers, capped structures
2. **Opt-in**: Debug levels (OFF → BASIC → TRACE → PERF → FULL)
3. **Keyed by stable IDs**: busId, bindingId, portKey, blockId
4. **No forced materialization**: Don't materialize lazy Fields
5. **Cheap queries**: Cached snapshots, not recomputed

## Part 1: DebugGraph [L45-185]
**Compile-time metadata** (immutable until recompile)

```typescript
interface DebugGraph {
  patchRevision: number;
  buses: Record<BusId, DebugBusNode>;
  publishers: Record<PublisherId, DebugPublisherNode>;
  listeners: Record<ListenerId, DebugListenerNode>;
  byPort: Record<PortKey, {
    incomingListeners: ListenerId[];
    outgoingPublishers: PublisherId[];
  }>;
  pipelines: Record<BindingKey, DebugPipeline>;
  busIndexById: Map<BusId, number>;
  bindingIndexById: Map<BindingId, number>;
}
```

**DebugBusNode** [L87-97]: id, name, type, combineMode, defaultValue, publishers, listeners, reservedRole

**DebugPublisherNode** [L100-112]: id, busId, from, enabled, adapterChain, lensStack, sortKey

**DebugListenerNode** [L115-127]: id, busId, to, enabled, adapterChain, lensStack

**DebugPipeline** [L129-168]: Stages (source, adapter, lens, combine) with types

**Compiler integration** [L170-184]: After bus/publisher/listener resolution

## Part 2: DebugSnapshot [L188-326]
**Runtime samples** (10-15 Hz, fixed-size)

**ValueSummary** [L202-214]: Tagged union (num, vec2, color, phase, bool, trigger, none, err)

```typescript
interface DebugSnapshot {
  patchRevision: number;
  tMs: number;
  busNow: ValueSummary[];          // Indexed by busIndexById
  bindingNow?: ValueSummary[];     // TRACE mode only
  health: { nanCount, infCount, cycleDetected?, silentBuses };
  perf?: {                          // PERF mode
    fpsEstimate, avgFrameMs, worstFrameMs,
    fieldMaterializations, topMaterializers[], adapterCalls[], lensCalls[]
  };
}
```

**Debug Levels** [L265-282]:
- OFF (nothing)
- BASIC (busNow + health)
- TRACE (+ bindingNow)
- PERF (+ perf counters)
- FULL (TRACE + PERF + per-stage)

**Ring Buffers** [L284-307]: Fixed capacity per bus, typed arrays, no GC churn
**Snapshot Emission** [L309-326]: Fixed rate (10-15 Hz, configurable)

## Part 3: DebugTap [L330-409]
**Instrumentation interface** (non-allocating, level-gated)

```typescript
interface DebugTap {
  level: DebugLevel;
  onDebugGraph?(g: DebugGraph): void;
  onSnapshot?(s: DebugSnapshot): void;
  hitMaterialize?({ blockId, reason }): void;
  hitAdapter?(adapterId): void;
  hitLens?(lensId): void;
  recordBusNow?(busId, ValueSummary): void;
  recordBindingNow?(bindingId, ValueSummary): void;
}
```

**Constraints** [L359-363]: Safe with undefined, no-op if level doesn't require, no allocations

**Integration** [L365-408]:
- Compile time: Call after DebugGraph built
- Runtime: Bus eval, listener delivery, field materialization, adapter/lens invocation

## Part 4: DebugService [L412-514]
**Query API** (no compiler internals exposed to UI)

```typescript
interface DebugService {
  setLevel(level): void;
  getLevel(): DebugLevel;
  setSnapshotFrequency(hz): void;
  setDebugGraph(g): void;
  pushSnapshot(s): void;
  probePort(portKey): PortProbeResult;
  probeBus(busId): BusProbeResult;
  probeBinding(bindingId): BindingProbeResult;
  getBusSeries(busId, windowMs): Series;
}
```

**Results** [L444-511]: PortProbeResult, BusProbeResult, BindingProbeResult, Series
**All preformatted** - no further computation needed [L514]

## Part 5: Implementation Checklist [L518-555]
**Compile time** [L520-526]: Build DebugGraph, byPort index, pipelines, slot indices
**Runtime init** [L529-533]: Ring buffers, typed arrays, TopK counters, pass tap
**Per frame** [L536-540]: Record busNow, bindingNow (TRACE), increment counters
**Sample rate** [L542-547]: Build snapshot, append to buffers, reset counters

## Part 6: Memory Safety [L558-579]
**Allocation bounds**:
| Structure | Bound |
|-----------|-------|
| busNow[] | # buses (compile-time) |
| bindingNow[] | # bindings (compile-time) |
| Ring buffers | sampleRate × windowSeconds |
| topMaterializers | N=8 (fixed cap) |
| topAdapters, topLenses | N=8 each |
| silentBuses | N=8 |

**GC pressure**: No per-frame allocation, small ValueSummary, pre-allocated, TopK algorithm

## Related
- [05-runtime](./05-runtime.md) - RuntimeHealthSnapshot
- [07-diagnostics-system](./07-diagnostics-system.md) - Rules engine
- [08b-diagnostic-rules-engine](./08b-diagnostic-rules-engine.md) - Specific rules
- [09-debug-ui-spec](./09-debug-ui-spec.md) - UI for observation
- [Invariants](../INVARIANTS.md) - I20 (traceability), I28 (attribution)
