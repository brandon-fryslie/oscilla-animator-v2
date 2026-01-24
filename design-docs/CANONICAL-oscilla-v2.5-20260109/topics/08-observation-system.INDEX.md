---
source_file: 08-observation-system.md
source_hash: 8fbf548eb702
index_version: 1
generated: 2026-01-12
---

# INDEX: Runtime Observation System

## 1. Concepts

### Core Concepts
- **Observation System**: Provides compile-time and runtime metadata to enable non-technical debugging without exposing implementation details
- **DebugGraph**: Captures the static topology the compiler resolves (buses, publishers, listeners, combine modes, adapter chains)
- **DebugSnapshot**: Periodic sample of runtime state emitted at 10-15 Hz, containing bus values, binding final values, health metrics
- **DebugTap**: Optional instrumentation interface passed to compiler and runtime for non-allocating, level-gated observation
- **DebugService**: Central hub owning DebugGraph, snapshots, and ring buffers; provides query API for UI
- **ValueSummary**: Compact representation of values in snapshots (never raw objects/arrays)

### Distinction from Diagnostics
- **DiagnosticHub** (topic 07): Reports *problems* ("What's broken?")
- **Observation System** (topic 08): Captures *state* ("What's happening right now?")

## 2. Key Invariants

- **I20**: Traceability by Stable IDs - Every observation is keyed by stable compile-time IDs (busId, bindingId, portKey, blockId)
- **I28**: Diagnostic Attribution - Observation enables targeting of diagnostics to specific elements

## 3. Non-Negotiable Constraints

1. **Bounded**: All data structures are fixed-size or capped (ring buffers, not unbounded arrays)
2. **Opt-in**: Debug capture is disabled by level (OFF → BASIC → TRACE → PERF → FULL)
3. **Keyed by stable IDs**: Use busId, bindingId, portKey, blockId—never mutable references
4. **No forced materialization**: Observation must not materialize lazy Fields or traverse RenderTree
5. **Cheap queries**: UI questions answered from cached snapshots, not recomputed

## 4. Architecture

### DebugGraph Structure (Part 1, L45-185)
- `patchRevision`: Invalidates on recompile
- `buses`: Record<BusId, DebugBusNode> - topology of each bus
- `publishers`: Record<PublisherId, DebugPublisherNode> - who publishes to buses
- `listeners`: Record<ListenerId, DebugListenerNode> - who reads from buses
- `byPort`: Reverse-lookup index for instant UI queries
- `pipelines`: Pre-resolved transformation chains (no hover re-computation)
- `busIndexById` / `bindingIndexById`: Indices for array-based snapshots

#### DebugBusNode Properties
- id, name, type (canonical five-axis SignalType)
- combineMode, defaultValueSummary
- publisherIds, listenerIds (sorted by sortKey)
- Optional reservedRole ('phaseA', 'pulse', 'palette', etc.)

#### DebugPublisherNode Properties
- id, busId, from endpoint, fromPortKey
- enabled flag, adapterChain, lensStack
- sortKey for combine ordering

#### DebugListenerNode Properties
- id, busId, to endpoint, toPortKey
- enabled flag, adapterChain, lensStack

#### DebugPipeline Structure
- bindingId, kind ('publisher' | 'listener')
- fromType, toType, stages array
- Stages: source, adapter, lens, combine (in evaluation order)

### DebugSnapshot Structure (Part 2, L188-326)
- patchRevision, tMs (timestamp)
- busNow: ValueSummary[] (indexed by busIndexById)
- bindingNow?: ValueSummary[] (TRACE mode only, indexed by bindingIndexById)
- health: nanCount, infCount, cycleDetected?, silentBuses
- perf?: fpsEstimate, avgFrameMs, worstFrameMs, fieldMaterializations, topMaterializers, adapterCalls, lensCalls

#### ValueSummary Types
- { t: 'num'; v: number }
- { t: 'vec2'; x: number; y: number }
- { t: 'color'; rgba: number } (packed uint32)
- { t: 'float'; v: number; unit?: 'phase01' } (0..1 with wrap)
- { t: 'bool'; v: 0 | 1 }
- { t: 'trigger'; v: 0 | 1 } ("fired this sample")
- { t: 'none' } (not sampled / no data)
- { t: 'err'; code: string } ('nan', 'inf', 'type-mismatch')

### DebugTap Interface (Part 3, L330-409)
- Optional instrumentation interface (non-allocating, level-gated)
- Methods: onDebugGraph?, onSnapshot?, hitMaterialize?, hitAdapter?, hitLens?, recordBusNow?, recordBindingNow?
- Must be safe to call with undefined
- All methods must be no-op if level doesn't require them

### DebugService Query API (Part 4, L412-514)
- setLevel(level), getLevel(), setSnapshotFrequency(hz)
- setDebugGraph(g), pushSnapshot(s)
- probePort(portKey): PortProbeResult
- probeBus(busId): BusProbeResult
- probeBinding(bindingId): BindingProbeResult
- getBusSeries(busId, windowMs): Series
- All results preformatted for UI (no further computation needed)

## 5. Operational Details

### Debug Levels (L265-282)
- OFF (0): nothing
- BASIC (1): busNow + health
- TRACE (2): BASIC + bindingNow
- PERF (3): BASIC + perf counters
- FULL (4): TRACE + PERF + per-stage values (expensive)

### Ring Buffers (L284-307)
- Fixed capacity (e.g., 150 samples for 10 seconds at 15 Hz)
- One per bus, keyed by busId
- Use typed arrays (Float32Array, Uint32Array) to avoid GC churn
- No allocation after initialization

### Snapshot Emission (L309-326)
- Fixed sampling rate: 10-15 Hz (configurable via SAMPLE_PERIOD_MS)
- Not every frame, to avoid memory explosion
- Built from accumulated frame data, reset frame-level counters after emission

### Compiler Integration (L170-184)
- Insertion point: End of compileBusAwarePatch(), after all buses/publishers/listeners resolved
- Returns: { program, timeModel, debugGraph }
- Calls: tap?.onDebugGraph?.(debugGraph)

### Runtime Integration Points (L365-408)
1. Bus evaluation: tap?.recordBusNow?(busId, valueSummary)
2. Listener delivery: tap?.recordBindingNow?(listenerId, valueSummary)
3. Field materialization: tap?.hitMaterialize?({ blockId, reason })
4. Adapter/Lens invocation: tap?.hitAdapter?.(adapterId), tap?.hitLens?.(lensId)

## 6. Implementation Checklist

### Compile Time (L520-526)
- [ ] Build DebugGraph after bus/publisher/listener resolution
- [ ] Compute byPort reverse-lookup index
- [ ] Pre-compile DebugPipeline for each binding
- [ ] Assign busIndexById and bindingIndexById for array-based snapshots
- [ ] Call tap?.onDebugGraph?.(debugGraph)

### Runtime Initialization (L529-533)
- [ ] Allocate ring buffers per bus (capacity = sampleRate × windowSeconds)
- [ ] Use typed arrays for numeric channels
- [ ] Initialize bounded TopK counters for perf tracking
- [ ] Pass tap to BusRuntime and field materializer

### Runtime per Frame (L536-540)
- [ ] Record busNow values after bus evaluation
- [ ] Record bindingNow values after listener chains (if TRACE)
- [ ] Increment hitAdapter/hitLens counters
- [ ] Increment fieldMaterialization counter

### Runtime at Sample Rate (L542-547)
- [ ] Build DebugSnapshot from current frame data
- [ ] Append to ring buffers
- [ ] Call tap?.onSnapshot?.(snapshot)
- [ ] Reset frame-level counters for next sample period

### UI Integration (L549-554)
- [ ] Implement DebugService as singleton or injected dependency
- [ ] Connect Probe mode UI to probePort, probeBus, probeBinding
- [ ] Connect Trace view to getBusSeries and probeBinding
- [ ] Connect diagnostics panel to rules engine (topic 08-diagnostic-rules-engine)

## 7. Memory Safety Guarantees

### Allocation Bounds (L560-571)

| Structure | Bound | Justification |
|-----------|-------|---------------|
| busNow[] | # buses (compile-time) | Fixed topology |
| bindingNow[] | # bindings (compile-time) | Fixed topology |
| Ring buffers (per bus) | sampleRate × windowSeconds | User configurable |
| topMaterializers[] | N=8 | Fixed cap (TopK) |
| topAdapters[] | N=8 | Fixed cap (TopK) |
| topLenses[] | N=8 | Fixed cap (TopK) |
| silentBuses[] | N=8 | Fixed cap (TopK) |
| TraceEvents (if enabled) | configurable maxEvents | User configurable |

### GC Pressure Minimization (L574-578)
- No per-frame object allocation in tap methods
- ValueSummary is small tagged union (constant-time)
- Ring buffers pre-allocated, no growth
- TopK counters use space-saving algorithm (no unbounded maps)

### DebugService Query Results (L444-511)
- PortProbeResult: portKey, blockId, portName, type, value, bus, listeners
- BusProbeResult: busId, name, type, combineMode, value, publishers[], listeners[]
- BindingProbeResult: transformation chain from binding ID
- Series: busId, windowMs, values[], stats (min, max, mean, range, nanCount, infCount)
