---
parent: ../INDEX.md
topic: observation-system
order: 8
---

# Runtime Observation System

> The observation system provides compile-time and runtime metadata to enable non-technical debugging without exposing implementation details.

**Related Topics**: [04-compilation](./04-compilation.md), [05-runtime](./05-runtime.md), [07-diagnostics-system](./07-diagnostics-system.md)

**Key Terms**: [DebugGraph](../GLOSSARY.md#debuggraph), [DebugSnapshot](../GLOSSARY.md#debugsnapshot), [DebugTap](../GLOSSARY.md#debugtap), [ValueSummary](../GLOSSARY.md#valuesummary)

**Related Spec**: [05-runtime.md: RuntimeHealthSnapshot](./05-runtime.md)

---

## Overview

The observation system is distinct from diagnostics. Diagnostics report *problems*. Observation captures *state*.

- **DiagnosticHub** (topic 07): "What's broken?"
- **Observation System** (topic 08): "What's happening right now?"

An observation is:
- **Structure**: DebugGraph (compile-time topology metadata)
- **Samples**: DebugSnapshot (runtime value samples at 10-15 Hz)
- **Queries**: DebugService (API for UI to ask questions without recomputing)

---

## Design Principles

### Non-Negotiable Constraints

1. **Bounded**: All data structures are fixed-size or capped. Ring buffers, not unbounded arrays.
2. **Opt-in**: Debug capture is disabled by level (OFF → BASIC → TRACE → PERF → FULL).
3. **Keyed by stable IDs**: Use `busId`, `bindingId`, `portKey`, `blockId`—never mutable references.
4. **No forced materialization**: Observation must not materialize lazy Fields or traverse RenderTree.
5. **Cheap queries**: UI questions answered from cached snapshots, not recomputed.

---

## Part 1: DebugGraph (Compile-Time Metadata)

### Purpose

DebugGraph captures the static topology the compiler resolves:
- Which buses exist, their publishers, listeners, combine modes
- How publishers adapt/transform values before combining
- How listeners transform after combining
- Reverse-lookups for instant queries ("what feeds this port?")

This is immutable until next compilation. The UI never reconstructs logic; it queries the graph.

### Interface

```typescript
interface DebugGraph {
  patchRevision: number;  // invalidates on recompile

  // Core topology
  buses: Record<BusId, DebugBusNode>;
  publishers: Record<PublisherId, DebugPublisherNode>;
  listeners: Record<ListenerId, DebugListenerNode>;

  // Fast reverse lookups for UI queries
  byPort: Record<PortKey, {
    incomingListeners: ListenerId[];     // who feeds this input
    outgoingPublishers: PublisherId[];   // who publishes to buses
    wiredIncoming?: ConnectionId[];      // if wires still exist
    wiredOutgoing?: ConnectionId[];
  }>;

  // Pre-resolved pipelines (no hover re-computation)
  pipelines: Record<BindingKey, DebugPipeline>;

  // Indices for array-based snapshots
  busIndexById: Map<BusId, number>;
  bindingIndexById: Map<BindingId, number>;
}
```

### DebugBusNode

```typescript
interface DebugBusNode {
  id: BusId;
  name: string;
  type: CanonicalType;              // canonical five-axis type
  combineMode: CombineMode;
  defaultValueSummary: ValueSummary;
  publisherIds: PublisherId[];   // sorted by sortKey
  listenerIds: ListenerId[];
  reservedRole?: string;         // 'phaseA', 'pulse', 'palette', etc.
}
```

### DebugPublisherNode

```typescript
interface DebugPublisherNode {
  id: PublisherId;
  busId: BusId;
  from: BindingEndpoint;                  // {blockId, portId}
  fromPortKey: PortKey;
  enabled: boolean;
  adapterChain: AdapterStep[];            // resolved chain
  lensStack: LensInstance[];              // if present
  sortKey: number;                        // combine ordering
}
```

### DebugListenerNode

```typescript
interface DebugListenerNode {
  id: ListenerId;
  busId: BusId;
  to: BindingEndpoint;
  toPortKey: PortKey;
  enabled: boolean;
  adapterChain: AdapterStep[];
  lensStack: LensInstance[];
}
```

### DebugPipeline

Pre-computed rendering of the transformation chain:

```typescript
interface DebugPipeline {
  bindingId: BindingKey;
  kind: 'publisher' | 'listener';
  fromType: CanonicalType;
  toType: CanonicalType;
  stages: DebugStage[];   // in evaluation order
}

type DebugStage =
  | {
      kind: 'source';
      label: string;
      type: CanonicalType;
      ref: { busId?: string; portKey?: string }
    }
  | {
      kind: 'adapter';
      adapterId: string;
      from: CanonicalType;
      to: CanonicalType;
      policy: AdapterPolicy
    }
  | {
      kind: 'lens';
      lensId: string;
      type: CanonicalType;
      params: Record<string, DebugParamBindingSummary>
    }
  | {
      kind: 'combine';
      busId: string;
      combineMode: CombineMode;
      type: CanonicalType
    };
```

### Compiler Integration

**Insertion point**: End of `compileBusAwarePatch()`, after all buses, publishers, listeners, adapters, lenses, and byPort indexing is resolved.

```typescript
// In compiler output
{
  program: CompiledProgramIR,
  timeModel: TimeModel,
  debugGraph: DebugGraph,  // NEW: always built
}

// Notify DebugService
tap?.onDebugGraph?.(debugGraph);
```

---

## Part 2: DebugSnapshot (Runtime Samples)

### Purpose

Periodic snapshot of runtime state. Emitted at 10-15 Hz (configurable), containing only:
- Current bus values (summary, not raw)
- Binding final values (if TRACE mode)
- Health metrics (NaN/Inf counts)
- Performance counters (materialization, adapter/lens invocation counts)

Memory-safe: all structures are fixed-size or bounded.

### Value Representation

Values in snapshots are never raw objects or arrays. Use `ValueSummary`:

```typescript
type ValueSummary =
  | { t: 'num'; v: number }
  | { t: 'vec2'; x: number; y: number }
  | { t: 'color'; rgba: number }          // packed uint32
  | { t: 'float'; v: number; unit?: 'phase01' }  // 0..1 with wrap
  | { t: 'bool'; v: 0 | 1 }
  | { t: 'trigger'; v: 0 | 1 }            // "fired this sample"
  | { t: 'none' }                         // not sampled / no data
  | { t: 'err'; code: string };           // 'nan', 'inf', 'type-mismatch'
```

**Never include Field contents.** For field debugging, use sampled probes (see §3).

### Interface

```typescript
interface DebugSnapshot {
  patchRevision: number;
  tMs: number;

  // Indexed by busIndexById
  busNow: ValueSummary[];

  // Indexed by bindingIndexById (TRACE mode only)
  bindingNow?: ValueSummary[];

  // Health indicators
  health: {
    nanCount: number;
    infCount: number;
    cycleDetected?: boolean;
    silentBuses: BusId[];                 // top N
  };

  // Performance counters (PERF mode)
  perf?: {
    fpsEstimate: number;
    avgFrameMs: number;
    worstFrameMs: number;
    fieldMaterializations: number;
    topMaterializers: Array<{
      blockId: string;
      count: number
    }>;                                   // top N (e.g., N=8)
    adapterCalls: Array<{
      adapterId: string;
      count: number
    }>;
    lensCalls: Array<{
      lensId: string;
      count: number
    }>;
  };
}
```

### Debug Levels

Control what is captured and sampled:

```typescript
enum DebugLevel {
  OFF = 0,      // nothing
  BASIC = 1,    // busNow + health
  TRACE = 2,    // BASIC + bindingNow
  PERF = 3,     // BASIC + perf counters
  FULL = 4,     // TRACE + PERF + per-stage values (expensive)
}
```

**Global Setting**: DebugService has a single global level. All DebugTap instances receive the same level.

```typescript
interface DebugService {
  setLevel(level: DebugLevel): void;
  getLevel(): DebugLevel;
}
```

### Ring Buffers

For timeseries without allocation explosion:

```typescript
class RingBuffer<T> {
  capacity: number;
  data: T[];
  writeIndex: number = 0;

  push(item: T): void {
    this.data[this.writeIndex % this.capacity] = item;
    this.writeIndex++;
  }

  getWindow(count: number): T[] {
    // Return last N items
  }
}
```

Store one ring buffer per bus (keyed by busId) with fixed capacity (e.g., 150 samples for 10 seconds at 15 Hz).

For numeric channels, use typed arrays (`Float32Array`, `Uint32Array`) to avoid GC churn.

### Snapshot Emission

Emit at fixed sampling rate (10-15 Hz, configurable), not every frame.

```typescript
const SAMPLE_PERIOD_MS = 66;  // ~15 Hz
let nextSampleTime = tMs;

function onFrame(tMs: number) {
  // ... evaluate patch ...

  if (tMs >= nextSampleTime) {
    const snapshot = recorder.buildSnapshot();
    debugService.pushSnapshot(snapshot);
    nextSampleTime += SAMPLE_PERIOD_MS;
  }
}
```

---

## Part 3: DebugTap (Instrumentation Interface)

### Purpose

Optional interface passed to compiler and runtime. Non-allocating, level-gated. Enables observation without invasive instrumentation.

### Interface

```typescript
interface DebugTap {
  level: DebugLevel;

  // Called at compile time (after DebugGraph is built)
  onDebugGraph?(g: DebugGraph): void;

  // Called at sample rate (~15 Hz)
  onSnapshot?(s: DebugSnapshot): void;

  // Runtime counters (constant-time)
  hitMaterialize?(who: { blockId: string; reason: string }): void;
  hitAdapter?(adapterId: string): void;
  hitLens?(lensId: string): void;

  // Value taps (TRACE/FULL only)
  recordBusNow?(busId: string, v: ValueSummary): void;
  recordBindingNow?(bindingId: string, v: ValueSummary): void;
}
```

**Constraints**:
- Must be safe to call with `tap === undefined`
- All methods must be no-op if level doesn't require them
- No allocations in any method
- No mutable closures or shared state

### Compiler Integration

```typescript
export function compileBusAwarePatch(
  normalizedGraph: NormalizedGraph,
  tap?: DebugTap
): CompilationResult {
  // ... compilation ...

  const debugGraph = buildDebugGraph(buses, publishers, listeners, pipelines);
  tap?.onDebugGraph?.(debugGraph);

  return { program, timeModel, debugGraph };
}
```

### Runtime Integration

**Instrumentation points** (where tap is passed and called):

1. **Bus evaluation**:
   ```typescript
   // After combining all publishers
   tap?.recordBusNow?.(busId, valueSummary);
   ```

2. **Listener delivery**:
   ```typescript
   // After listener adapter/lens chain
   tap?.recordBindingNow?.(listenerId, valueSummary);
   ```

3. **Field materialization**:
   ```typescript
   // In Field allocation function
   tap?.hitMaterialize?.({ blockId, reason });
   ```

4. **Adapter/Lens invocation**:
   ```typescript
   // Constant-time counter increment
   tap?.hitAdapter?.(adapterId);
   tap?.hitLens?.(lensId);
   ```

---

## Part 4: DebugService (Query API)

### Purpose

Central hub that owns DebugGraph, snapshots, and ring buffers. Provides query API for UI without requiring UI to understand compiler internals.

### Interface

```typescript
interface DebugService {
  // Configuration
  setLevel(level: DebugLevel): void;
  getLevel(): DebugLevel;
  setSnapshotFrequency(hz: number): void;

  // Data flow
  setDebugGraph(g: DebugGraph): void;
  pushSnapshot(s: DebugSnapshot): void;

  // Query: what feeds this port?
  probePort(portKey: PortKey): PortProbeResult;

  // Query: what's happening with this bus?
  probeBus(busId: BusId): BusProbeResult;

  // Query: what's the binding chain?
  probeBinding(bindingId: BindingId): BindingProbeResult;

  // Query: timeseries for a bus
  getBusSeries(busId: BusId, windowMs: number): Series;
}

interface PortProbeResult {
  portKey: PortKey;
  blockId: string;
  portName: string;
  type: CanonicalType;

  // Current value (from latest snapshot)
  value: ValueSummary;

  // The bus feeding it
  bus?: {
    busId: BusId;
    busName: string;
  };

  // The listener chain
  listeners?: {
    listenerId: ListenerId;
    adapterChain: AdapterStep[];
    lensStack: LensInstance[];
  }[];
}

interface BusProbeResult {
  busId: BusId;
  name: string;
  type: CanonicalType;
  combineMode: CombineMode;

  // Current value
  value: ValueSummary;

  // Who feeds it
  publishers: {
    publisherId: PublisherId;
    blockId: string;
    portId: string;
    enabled: boolean;
    adapterChain: AdapterStep[];
    lensStack: LensInstance[];
    sortKey: number;
    value: ValueSummary;
  }[];

  // Who reads it
  listeners: {
    listenerId: ListenerId;
    blockId: string;
    portId: string;
    enabled: boolean;
    adapterChain: AdapterStep[];
    lensStack: LensInstance[];
  }[];
}

interface Series {
  busId: BusId;
  windowMs: number;
  values: ValueSummary[];
  stats: {
    min: number;
    max: number;
    mean: number;
    range: number;
    nanCount: number;
    infCount: number;
  };
}
```

All results are preformatted for UI (no further computation needed).

---

## Part 5: Implementation Checklist

### Compile Time

- [ ] Build DebugGraph after bus/publisher/listener resolution
- [ ] Compute byPort reverse-lookup index
- [ ] Pre-compile DebugPipeline for each binding
- [ ] Assign busIndexById and bindingIndexById for array-based snapshots
- [ ] Call `tap?.onDebugGraph?.(debugGraph)`

### Runtime Initialization

- [ ] Allocate ring buffers per bus (capacity = sampleRate * windowSeconds)
- [ ] Use typed arrays for numeric channels
- [ ] Initialize bounded TopK counters for perf tracking
- [ ] Pass tap to BusRuntime and field materializer

### Runtime per Frame

- [ ] Record busNow values after bus evaluation
- [ ] Record bindingNow values after listener chains (if TRACE)
- [ ] Increment hitAdapter/hitLens counters
- [ ] Increment fieldMaterialization counter

### Runtime at Sample Rate (~15 Hz)

- [ ] Build DebugSnapshot from current frame data
- [ ] Append to ring buffers
- [ ] Call `tap?.onSnapshot?.(snapshot)`
- [ ] Reset frame-level counters for next sample period

### UI Integration

- [ ] Implement DebugService as singleton or injected dependency
- [ ] Connect Probe mode UI to `probePort`, `probeBus`, `probeBinding`
- [ ] Connect Trace view to `getBusSeries` and `probeBinding`
- [ ] Connect diagnostics panel to rules engine (topic 08-diagnostic-rules-engine)

---

## Part 6: Memory Safety Guarantees

### Allocation Bounds

| Structure | Bound | Justification |
|-----------|-------|---------------|
| `busNow[]` | # buses (compile-time) | Fixed topology |
| `bindingNow[]` | # bindings (compile-time) | Fixed topology |
| Ring buffers (per bus) | sampleRate × windowSeconds | User configurable |
| `topMaterializers[]` | N=8 | Fixed cap (TopK) |
| `topAdapters[]` | N=8 | Fixed cap (TopK) |
| `topLenses[]` | N=8 | Fixed cap (TopK) |
| `silentBuses[]` | N=8 | Fixed cap (TopK) |
| TraceEvents (if enabled) | configurable maxEvents | User configurable |

### GC Pressure

- No per-frame object allocation in tap methods
- ValueSummary is small tagged union (constant-time)
- Ring buffers pre-allocated, no growth
- TopK counters use space-saving algorithm (no unbounded maps)

---

## Related Documents

- [05-runtime.md: RuntimeHealthSnapshot](./05-runtime.md) - Health monitoring (separate from observation)
- [07-diagnostics-system.md: Rules Engine](./07-diagnostics-system.md) - Diagnostic generation from observation
- [08-diagnostic-rules-engine.md](./08-diagnostic-rules-engine.md) - Specific rules and thresholds
- [09-debug-ui-spec.md](./09-debug-ui-spec.md) - Non-technical UI over observation
- [10-power-user-debugging.md](./10-power-user-debugging.md) - Advanced observation (post-MVP)

---

## Invariants

- **I20**: Traceability by Stable IDs - Every observation is keyed by stable compile-time IDs
- **I28**: Diagnostic Attribution - Observation enables targeting of diagnostics to specific elements

