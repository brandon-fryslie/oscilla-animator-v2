# SPRINT-20260120-170100: Full Data Layer (DebugGraph + Ring Buffers)

**Status**: PLANNED
**Confidence**: MEDIUM
**Started**: TBD
**Completed**: TBD

---

## Context

**Sprint Goal**: Replace Sprint 1's throwaway code with production-quality observation infrastructure matching the spec.

**Prior State** (After Sprint 1):
- Edge hover works with simple Map-based storage
- DebugTap interface proven (recordSlotValue only)
- Runtime instrumentation validated (<1% overhead)
- SimpleDebugPanel displays raw numbers

**Success Criteria**:
- DebugGraph built during compilation (buses, publishers, listeners, pipelines)
- DebugService upgraded with ring buffers and ValueSummary
- All 7 payload types supported (not just float)
- Edge→slot resolution via DebugGraph.byPort (not temporary Map)
- Timeseries data available for Sprint 3's trace view

---

## What We're Building

### 1. DebugGraph Builder (Compiler)
**File**: `src/compiler/DebugGraphBuilder.ts` (NEW)

Builds the complete DebugGraph structure from compilation artifacts.

**Input** (from compileBusAwarePatch):
- Resolved buses: `{ busId, type, combineMode, defaultValue, publisherIds, listenerIds }`
- Publishers: `{ publisherId, busId, from, adapterChain, lensStack, sortKey }`
- Listeners: `{ listenerId, busId, to, adapterChain, lensStack }`
- Slot assignments: `Map<BusId, SlotId>`

**Output**: DebugGraph matching spec (08-observation-system.md, Part 1)

```typescript
interface DebugGraph {
  patchRevision: number;
  buses: Record<BusId, DebugBusNode>;
  publishers: Record<PublisherId, DebugPublisherNode>;
  listeners: Record<ListenerId, DebugListenerNode>;
  byPort: Record<PortKey, PortTopology>;
  pipelines: Record<BindingKey, DebugPipeline>;
  busIndexById: Map<BusId, number>;
  bindingIndexById: Map<BindingId, number>;
}
```

**Complexity**: ~250 lines (builder logic + type definitions)

---

### 2. ValueSummary Tagged Union (Core Types)
**File**: `src/core/debug-types.ts` (NEW)

Type-safe value representation for all payload types.

```typescript
type ValueSummary =
  | { t: 'num'; v: number }
  | { t: 'vec2'; x: number; y: number }
  | { t: 'color'; rgba: number }          // packed uint32
  | { t: 'phase'; v: number }             // 0..1
  | { t: 'bool'; v: 0 | 1 }
  | { t: 'trigger'; v: 0 | 1 }            // fired this sample
  | { t: 'none' }                         // not sampled
  | { t: 'err'; code: string };           // 'nan', 'inf', etc.
```

**Also includes**:
- Helper functions: `summarizeValue(slotId, type, valueStore): ValueSummary`
- Formatters: `formatValueSummary(value): string`
- Type guards: `isNumeric(v)`, `isColor(v)`, etc.

**Complexity**: ~100 lines

---

### 3. DebugService v2 (Upgraded)
**File**: `src/services/DebugService.ts` (REPLACE Sprint 1 version)

Full implementation matching spec (08-observation-system.md, Part 4).

**New Features**:
- Ring buffers per bus (150 samples @ 15Hz = 10 seconds)
- DebugGraph storage and indexing
- ValueSummary instead of raw numbers
- Query methods: `probePort()`, `probeBus()`, `getBusSeries()`
- DebugLevel support (OFF/BASIC/TRACE/PERF/FULL)

**Interface**:
```typescript
interface DebugService {
  // Configuration
  setLevel(level: DebugLevel): void;
  getLevel(): DebugLevel;
  setSnapshotFrequency(hz: number): void;

  // Data flow
  setDebugGraph(g: DebugGraph): void;
  pushSnapshot(s: DebugSnapshot): void;

  // Query API
  probePort(portKey: PortKey): PortProbeResult;
  probeBus(busId: BusId): BusProbeResult;
  getBusSeries(busId: BusId, windowMs: number): Series;
}
```

**Storage**:
- DebugGraph: single immutable object
- Ring buffers: `Map<BusId, RingBuffer<ValueSummary>>`
- Typed arrays for numeric channels: `Float64Array` (optimization)

**Complexity**: ~400 lines (replaces Sprint 1's ~150 lines)

---

### 4. Ring Buffer Implementation
**File**: `src/services/RingBuffer.ts` (NEW)

Generic circular buffer with fixed capacity.

```typescript
class RingBuffer<T> {
  constructor(capacity: number);
  push(item: T): void;
  getWindow(count: number): T[];      // last N items
  getAll(): T[];                      // all items in order
  clear(): void;
  isFull(): boolean;
}
```

**Optimization**: For numeric values, use typed arrays:
```typescript
class NumericRingBuffer {
  private data: Float64Array;
  private writeIndex: number = 0;
  // ... same interface
}
```

**Complexity**: ~150 lines (two implementations)

---

### 5. DebugSnapshot Emission (Runtime)
**File**: `src/runtime/ScheduleExecutor.ts` (MODIFY)

Emit DebugSnapshot at sample rate (~15Hz).

**Current State** (Sprint 1):
```typescript
// After every slot write:
tap?.recordSlotValue?.(slotId, value);
```

**Upgrade to**:
```typescript
// At sample rate (every ~66ms):
if (tMs >= nextSampleTime) {
  const snapshot = buildDebugSnapshot(state, debugGraph, tMs);
  tap?.onSnapshot?.(snapshot);
  nextSampleTime += SAMPLE_PERIOD_MS;
}
```

**DebugSnapshot structure** (from spec):
```typescript
interface DebugSnapshot {
  patchRevision: number;
  tMs: number;
  busNow: ValueSummary[];              // indexed by busIndexById
  bindingNow?: ValueSummary[];         // TRACE mode only
  health: HealthIndicators;
  perf?: PerfCounters;                 // PERF mode only
}
```

**Complexity**: ~100 lines (snapshot builder)

---

### 6. DebugTap Extension (Runtime)
**File**: `src/runtime/RuntimeState.ts` (MODIFY)

Extend DebugTap interface with new methods.

**Sprint 1 version**:
```typescript
interface DebugTap {
  recordSlotValue?(slotId: number, value: number): void;
}
```

**Sprint 2 version** (from spec):
```typescript
interface DebugTap {
  level: DebugLevel;

  // Compile-time
  onDebugGraph?(g: DebugGraph): void;

  // Runtime (sample rate)
  onSnapshot?(s: DebugSnapshot): void;

  // Per-frame recording (TRACE/FULL only)
  recordBusNow?(busId: string, v: ValueSummary): void;
  recordBindingNow?(bindingId: string, v: ValueSummary): void;

  // Performance counters
  hitMaterialize?(who: { blockId: string; reason: string }): void;
  hitAdapter?(adapterId: string): void;
  hitLens?(lensId: string): void;
}
```

**Backward Compatibility**: Sprint 1's `recordSlotValue` removed (replaced by snapshot-based recording).

**Complexity**: ~20 lines (interface extension)

---

### 7. Update SimpleDebugPanel to Use New API
**File**: `src/ui/components/SimpleDebugPanel.tsx` (MODIFY)

Upgrade to use `probePort()` instead of `getEdgeValue()`.

**Changes**:
- Call `debugService.probePort(portKey)` instead of `getEdgeValue(edgeId)`
- Display `PortProbeResult` (includes bus info, listeners, type)
- Show ValueSummary with proper formatting
- Add "Bus:" line showing which bus feeds the port

**Still simple text display** (no fancy renderers yet—that's Sprint 3).

**Complexity**: ~50 lines changed

---

## Implementation Steps

### Step 1: Define Core Types (2 hours)
- [ ] Create `src/core/debug-types.ts`
- [ ] Define ValueSummary tagged union
- [ ] Define DebugGraph, DebugSnapshot, DebugTap interfaces
- [ ] Add type guards and formatters
- [ ] Export from `src/core/index.ts`

**Acceptance**:
```typescript
const v: ValueSummary = { t: 'num', v: 0.73 };
expect(formatValueSummary(v)).toBe("0.73");
expect(isNumeric(v)).toBe(true);
```

---

### Step 2: Implement Ring Buffers (2.5 hours)
- [ ] Create `src/services/RingBuffer.ts`
- [ ] Implement generic RingBuffer<T>
- [ ] Implement NumericRingBuffer (Float64Array)
- [ ] Add tests (push, getWindow, wrap-around)
- [ ] Benchmark allocation and access time

**Acceptance**:
```typescript
const rb = new RingBuffer<number>(3);
rb.push(1); rb.push(2); rb.push(3); rb.push(4);
expect(rb.getAll()).toEqual([2, 3, 4]);  // wrapped
```

---

### Step 3: Build DebugGraph in Compiler (5 hours)
- [ ] Create `src/compiler/DebugGraphBuilder.ts`
- [ ] Implement `buildDebugGraph(compilerState): DebugGraph`
- [ ] Build buses, publishers, listeners records
- [ ] Build byPort reverse-lookup index
- [ ] Build pipelines (pre-rendered transformation chains)
- [ ] Assign busIndexById and bindingIndexById
- [ ] Call at end of `compileBusAwarePatch()`
- [ ] Call `tap?.onDebugGraph?.(debugGraph)`

**Acceptance**:
- Compile test patch with 5 buses, 10 bindings
- DebugGraph.buses has 5 entries
- DebugGraph.byPort maps all input ports
- DebugGraph.pipelines has entries for all bindings
- Log: "DebugGraph: 5 buses, 10 publishers, 10 listeners"

---

### Step 4: Upgrade DebugService (4 hours)
- [ ] Replace `src/services/DebugService.ts` with v2
- [ ] Store DebugGraph (immutable field)
- [ ] Allocate ring buffers per bus (from DebugGraph.buses)
- [ ] Implement `setDebugGraph(g)` (resets buffers on recompile)
- [ ] Implement `pushSnapshot(s)` (append to ring buffers)
- [ ] Implement `probePort(portKey): PortProbeResult`
- [ ] Implement `probeBus(busId): BusProbeResult`
- [ ] Implement `getBusSeries(busId, windowMs): Series`
- [ ] Add DebugLevel getter/setter

**Acceptance**:
```typescript
debugService.setDebugGraph(graph);
debugService.pushSnapshot(snapshot);
const result = debugService.probePort("Slider_1.value");
expect(result.bus?.busId).toBe("energy");
expect(result.value.t).toBe("num");
```

---

### Step 5: Implement DebugSnapshot Builder (3 hours)
- [ ] Create `buildDebugSnapshot(state, graph, tMs): DebugSnapshot`
- [ ] Sample busNow values (indexed by busIndexById)
- [ ] Convert slot values to ValueSummary (using SignalType from graph)
- [ ] Include health indicators (NaN/Inf counts from HealthMonitor)
- [ ] Include perf counters if level = PERF/FULL
- [ ] Call from ScheduleExecutor at sample rate

**Acceptance**:
- Snapshot has busNow array matching # of buses
- All ValueSummary tags match bus types
- Health indicators populated (can be zero)

---

### Step 6: Emit Snapshots from Runtime (2 hours)
- [ ] Modify `ScheduleExecutor` to track sample time
- [ ] Call `buildDebugSnapshot()` at 15Hz
- [ ] Call `tap?.onSnapshot?.(snapshot)`
- [ ] Remove Sprint 1's `recordSlotValue` calls (replaced)
- [ ] Wire DebugService as tap implementation

**Acceptance**:
- Run 1000 frames (~16 seconds at 60fps)
- DebugService receives ~240 snapshots (15Hz × 16s)
- Ring buffers have expected # of samples

---

### Step 7: Update SimpleDebugPanel (1.5 hours)
- [ ] Replace `getEdgeValue()` with `probePort()`
- [ ] Display PortProbeResult fields (bus name, type, value)
- [ ] Format ValueSummary using `formatValueSummary()`
- [ ] Add "Bus:" line
- [ ] Keep text-only display (no renderers yet)

**Acceptance**:
- Hover edge → panel shows bus name
- Panel shows: "Signal:Float" or "Signal:Phase" etc.
- Value formatted correctly (0.73, not raw bits)

---

### Step 8: Handle All Payload Types (2.5 hours)
- [ ] Test with float (already working)
- [ ] Test with phase (0..1 wrapping value)
- [ ] Test with color (RGBA packed int)
- [ ] Test with vec2 (x, y pair)
- [ ] Test with bool (0/1)
- [ ] Test with trigger (discrete pulse)
- [ ] Verify ValueSummary tags match

**Acceptance**:
- Create test patch with all 7 types
- Hover edges of each type
- Panel displays correct tag and formatted value
- No "t: 'err'" unless actual error

---

### Step 9: Integration & Performance Testing (2.5 hours)
- [ ] Test with complex patch (50+ nodes, 100+ edges)
- [ ] Verify DebugGraph builds correctly
- [ ] Verify ring buffers don't overflow
- [ ] Benchmark frame time (should still be <1% overhead)
- [ ] Benchmark memory usage (ring buffers should be ~150KB total)
- [ ] Test recompilation (DebugGraph updates, buffers reset)

**Acceptance**:
- No performance regression vs. Sprint 1
- Memory stable over 10,000 frames
- Recompile updates graph correctly

---

## Files Changed

### New Files
- `src/core/debug-types.ts` (~200 lines: types + helpers)
- `src/compiler/DebugGraphBuilder.ts` (~250 lines: graph builder)
- `src/services/RingBuffer.ts` (~150 lines: two implementations)
- `src/runtime/buildDebugSnapshot.ts` (~100 lines: snapshot builder)

### Replaced Files
- `src/services/DebugService.ts` (~400 lines, replaces Sprint 1's ~150)

### Modified Files
- `src/runtime/RuntimeState.ts` (+20 lines: extend DebugTap interface)
- `src/runtime/ScheduleExecutor.ts` (+50 lines: snapshot emission, remove recordSlotValue)
- `src/compiler/compileBusAwarePatch.ts` (+10 lines: call DebugGraphBuilder)
- `src/ui/components/SimpleDebugPanel.tsx` (~50 lines changed: use probePort)

**Total LOC**: ~1,100 lines (NEW: ~700, REPLACED: ~250, MODIFIED: ~150)

---

## Dependencies

### External
- None (uses existing types and runtime structures)

### Internal
- Sprint 1 completion (DebugTap interface proven)
- RuntimeState.valueStore (slot storage)
- SignalType definitions (canonical-types.ts)
- compileBusAwarePatch (bus resolution)

### Coordination
- None (isolated sprint, no parallel work)

---

## Risks & Mitigations

### Risk 1: DebugGraph Builder Complexity
**Impact**: HIGH (blocks entire sprint)
**Probability**: MEDIUM

**Mitigation**:
- Study compiler output structures before Step 3
- Write builder incrementally (buses first, then publishers, then listeners)
- Log intermediate structures for debugging
- Use existing test patches for validation

**Fallback**: Build minimal DebugGraph (just buses, skip pipelines). Trace view in Sprint 3 will be limited.

---

### Risk 2: ValueSummary Type Mismatches
**Impact**: MEDIUM (incorrect value display)
**Probability**: LOW

**Mitigation**:
- SignalType available from DebugGraph.buses
- Validate type tag matches expected type
- Add assertion: `if (type.payload === 'phase') assert(summary.t === 'phase')`
- Log warnings for mismatches

**Fallback**: Use `{ t: 'num', v }` for all numeric types (less precise but safe).

---

### Risk 3: Ring Buffer Memory Overhead
**Impact**: LOW (bounded by design)
**Probability**: VERY LOW

**Mitigation**:
- 150 samples × ~20 bytes per ValueSummary × 50 buses = ~150KB
- Pre-allocate all buffers at setDebugGraph
- Use Float64Array for numeric channels (8 bytes per sample)

**Verification**: Log memory usage after allocation.

**Fallback**: Reduce capacity to 75 samples (5 seconds instead of 10).

---

### Risk 4: Performance Regression from Snapshot Building
**Impact**: MEDIUM
**Probability**: LOW

**Mitigation**:
- Snapshot building only happens at 15Hz (not every frame)
- ValueSummary creation is cheap (tagged union, no allocation)
- Typed arrays avoid GC pressure
- Benchmark before/after

**Fallback**: Reduce sample rate to 10Hz or 5Hz.

---

### Risk 5: byPort Index Complexity
**Impact**: MEDIUM (affects Sprint 3's trace view)
**Probability**: LOW

**Mitigation**:
- byPort is reverse-lookup: for each listener, index by `toPortKey`
- For each publisher, index by `fromPortKey`
- Test with multi-input ports (e.g., Add block with 2 inputs)

**Fallback**: Skip byPort in Sprint 2, build it in Sprint 3 when needed.

---

## Testing Strategy

### Unit Tests
- RingBuffer: push, getWindow, wrap-around, clear
- ValueSummary formatters: all 7 types + error cases
- Type guards: isNumeric, isColor, etc.
- DebugService: setDebugGraph, pushSnapshot, probePort, probeBus

### Integration Tests
- Compile patch → DebugGraph built with correct structure
- Runtime execution → snapshots emitted at 15Hz
- DebugService queries → return correct PortProbeResult
- Recompilation → DebugGraph updates, buffers reset

### Manual Tests
- Test patch with all 7 payload types
- Hover edges, verify correct ValueSummary tags
- Let patch run for 60 seconds, verify ring buffers don't overflow
- Check memory usage (should be ~150KB for 50 buses)

---

## Success Metrics

### Functional
- [ ] DebugGraph builds with all fields populated
- [ ] Ring buffers store 10 seconds of history per bus
- [ ] ValueSummary supports all 7 payload types
- [ ] probePort() returns complete PortProbeResult
- [ ] Snapshots emitted at 15Hz ±10%

### Performance
- [ ] Frame time unchanged vs. Sprint 1 (<1% variance)
- [ ] Memory usage bounded (~150KB for ring buffers)
- [ ] No GC pauses during snapshot emission
- [ ] DebugGraph build time <50ms (negligible)

### Quality
- [ ] All TypeScript types defined (no `any`)
- [ ] All tests pass
- [ ] No console warnings
- [ ] Code passes lint

---

## Follow-up Work (Not This Sprint)

**Sprint 3 Prep**:
- DebugGraph.pipelines available for trace view
- getBusSeries() ready for timeseries plots
- ValueSummary ready for type-specific renderers

**Deferred Features**:
- DebugLevel enforcement (all levels emit at FULL for now) → Future sprint
- Performance counters (perf field in snapshot) → Future sprint
- Diagnostics integration → Future sprint

---

## Notes

- Sprint 2 is the **production data layer**. Code from this sprint will NOT be thrown away.
- DebugGraph is **compile-time only** (immutable until recompile)
- Ring buffers are **runtime only** (cleared on recompile)
- ValueSummary is **the canonical representation** for all debug values
- SimpleDebugPanel still exists (upgraded, not replaced). Sprint 3 replaces it.

---

## Estimated Effort

| Task | Estimate | Confidence |
|------|----------|------------|
| Core types | 2h | HIGH |
| Ring buffers | 2.5h | HIGH |
| DebugGraph builder | 5h | MEDIUM |
| DebugService v2 | 4h | MEDIUM |
| Snapshot builder | 3h | MEDIUM |
| Runtime emission | 2h | HIGH |
| Update panel | 1.5h | HIGH |
| All payload types | 2.5h | MEDIUM |
| Integration testing | 2.5h | HIGH |
| **TOTAL** | **25 hours** | **MEDIUM** |

**Recommended allocation**: 3-4 days with buffer

---

## Dependencies for Next Sprint

**Sprint 3 requires**:
- DebugGraph.pipelines (for trace summary display)
- getBusSeries() (for timeseries plots)
- ValueSummary (for type-specific renderers)
- probePort() and probeBus() (for popover data)

**Sprint 3 will replace**:
- SimpleDebugPanel → DebugProbePopover
- Text-only display → Type-specific renderers (meters, phase rings, etc.)

**Sprint 3 will NOT change**:
- DebugGraph structure
- Ring buffers
- DebugService API

---

## Sign-off Checklist

Before marking sprint COMPLETE:
- [ ] All 9 implementation steps checked off
- [ ] All success metrics met
- [ ] DoD items verified (see SPRINT-20260120-170100-full-data-layer-DOD.md)
- [ ] No performance regression vs. Sprint 1
- [ ] Code reviewed
- [ ] Tests passing
- [ ] DebugGraph structure validated with logs
- [ ] Ready for Sprint 3

---

**END OF SPRINT PLAN**
