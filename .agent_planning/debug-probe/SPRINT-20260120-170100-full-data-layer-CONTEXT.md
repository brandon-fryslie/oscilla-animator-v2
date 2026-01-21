# SPRINT CONTEXT: Full Data Layer (DebugGraph + Ring Buffers)

**Sprint ID**: SPRINT-20260120-170100
**Confidence**: MEDIUM
**Date Created**: 2026-01-20

---

## Purpose of This Document

This CONTEXT file captures:
1. **Why** Sprint 2 is the production data layer (not throwaway like Sprint 1)
2. **What** we learned from Sprint 1 that informs this sprint
3. **Spec alignment** and where we deviate
4. **Decisions** affecting Sprint 3 and beyond

Read this before starting Sprint 3 to understand the DebugGraph structure.

---

## Architectural Decisions

### Decision 1: DebugGraph is Compile-Time Only (Immutable)

**Problem**: How often should DebugGraph be updated?

**Options Considered**:
1. Rebuild DebugGraph every frame (mutable structure)
2. Rebuild DebugGraph on every edit (partial updates)
3. Rebuild DebugGraph on recompilation only (immutable)

**Chosen**: Option 3 (Compile-time only, immutable)

**Rationale**:
- **Single source of truth**: Topology changes = recompilation
- **Performance**: No graph traversal during frame execution
- **Consistency**: DebugGraph matches compiled IR exactly
- **Spec compliance**: "DebugGraph is immutable until next compilation" (08-observation-system.md)

**Implementation**:
- DebugGraph built at end of `compileBusAwarePatch()`
- Stored as immutable object in DebugService
- `setDebugGraph(g)` clears ring buffers (new patch = new data)

**Trade-off**:
- ❌ Can't track partial edits (e.g., user adds wire but doesn't recompile)
- ✅ Zero runtime overhead for graph maintenance
- ✅ Simple consistency model (graph = what's compiled)

**Future Impact**: Sprint 3's trace view depends on DebugGraph.pipelines being stable. This decision guarantees stability.

---

### Decision 2: Ring Buffers are Per-Bus (Not Per-Binding)

**Problem**: What granularity for timeseries storage?

**Options Considered**:
1. One ring buffer per bus (coarse)
2. One ring buffer per binding (fine-grained)
3. One ring buffer per slot (all slots, not just buses)

**Chosen**: Option 1 (Per-bus)

**Rationale**:
- **Spec says**: "Store one ring buffer per bus" (08-observation-system.md, Part 2)
- **Memory efficiency**: 50 buses × 150 samples = 7,500 values (manageable)
- **Sufficient granularity**: Bus value is what users care about (combined result)
- **Listener values**: If needed, capture in bindingNow (TRACE mode), but don't buffer

**Storage Calculation**:
- 50 buses × 150 samples × 20 bytes per ValueSummary = 150KB
- Numeric channels use Float64Array: 50 × 150 × 8 bytes = 60KB

**Trade-off**:
- ❌ Can't see timeseries of individual publisher contributions (but can query current value)
- ✅ Bounded memory (scales with # buses, not # bindings)
- ✅ Matches user mental model (buses are the "signals")

**Future Impact**: Sprint 3's timeseries plot will query `getBusSeries(busId)`. This works because we buffer per-bus.

---

### Decision 3: ValueSummary is Tagged Union (Not Class Hierarchy)

**Problem**: How to represent heterogeneous value types?

**Options Considered**:
1. Class hierarchy: `abstract class Value`, subclasses `NumValue`, `Vec2Value`, etc.
2. Tagged union: `type ValueSummary = { t: 'num', v: number } | { t: 'vec2', x, y } | ...`
3. Generic wrapper: `interface Value<T> { type: string; value: T }`

**Chosen**: Option 2 (Tagged union)

**Rationale**:
- **Spec compliance**: Spec defines ValueSummary as tagged union exactly
- **Exhaustiveness checking**: TypeScript ensures all cases handled in switch
- **Serialization**: Plain objects (JSON-serializable)
- **Performance**: No vtable lookups, no instanceof checks
- **Immutability**: Natural fit for functional style

**Example**:
```typescript
function formatValueSummary(v: ValueSummary): string {
  switch (v.t) {
    case 'num': return v.v.toFixed(2);
    case 'phase': return `${(v.v * 100).toFixed(1)}%`;
    case 'color': return `#${v.rgba.toString(16).padStart(8, '0')}`;
    case 'vec2': return `(${v.x}, ${v.y})`;
    // ... TypeScript enforces exhaustiveness
  }
}
```

**Trade-off**:
- ❌ No polymorphism (can't call `v.format()`)
- ✅ Type-safe exhaustive matching
- ✅ Zero-cost abstraction (compiles to plain objects)
- ✅ Easy to serialize/deserialize

**Future Impact**: Sprint 3's type-specific renderers will switch on `v.t`. This is the canonical pattern.

---

### Decision 4: Sample Rate 15Hz (Not 60Hz or 1Hz)

**Problem**: How often should snapshots be emitted?

**Options Considered**:
1. 60Hz (every frame)
2. 15Hz (spec recommendation)
3. 1Hz (minimal overhead)

**Chosen**: Option 2 (15Hz)

**Rationale**:
- **Spec says**: "Sample at 10-15 Hz" (08-observation-system.md)
- **Nyquist**: Most musical/animation signals are <5Hz, 15Hz is 3× oversampled
- **Performance**: Snapshot building at 15Hz is negligible overhead (~1ms every 66ms)
- **Timeseries quality**: 150 samples at 15Hz = 10 seconds (smooth plots)

**Implementation**:
```typescript
const SAMPLE_PERIOD_MS = 66;  // ~15 Hz
let nextSampleTime = tMs;

if (tMs >= nextSampleTime) {
  const snapshot = buildDebugSnapshot(state, graph, tMs);
  tap?.onSnapshot?.(snapshot);
  nextSampleTime += SAMPLE_PERIOD_MS;
}
```

**Trade-off**:
- ❌ Can't capture 60Hz oscillations (but rare in animation patches)
- ✅ Low overhead (snapshot every 4 frames)
- ✅ Sufficient for trace view plots

**Future Impact**: Sprint 3's timeseries plot will have 150 points over 10 seconds. Smooth enough for visual inspection.

---

### Decision 5: byPort Index Structure

**Problem**: How to resolve "what feeds this port?" efficiently?

**Options Considered**:
1. Linear search through listeners on every query
2. Build Map<PortKey, ListenerId[]> once per compilation
3. Embed in DebugGraph as `byPort: Record<PortKey, PortTopology>`

**Chosen**: Option 3 (Embedded in DebugGraph)

**Rationale**:
- **Spec compliance**: "byPort: Fast reverse lookups for UI queries" (08-observation-system.md)
- **Precomputed**: O(1) lookup, not O(N) search
- **Complete structure**: Also tracks outgoing publishers (for source ports)

**Structure**:
```typescript
byPort: Record<PortKey, {
  incomingListeners: ListenerId[];      // who feeds this input
  outgoingPublishers: PublisherId[];    // who publishes to buses
  wiredIncoming?: ConnectionId[];       // if wires still exist
  wiredOutgoing?: ConnectionId[];
}>
```

**Build Algorithm**:
1. Iterate all listeners, index by `toPortKey`
2. Iterate all publishers, index by `fromPortKey`
3. Result: instant lookup for `probePort(portKey)`

**Trade-off**:
- ❌ Slightly larger DebugGraph (extra ~10KB for 100 ports)
- ✅ O(1) port queries (not O(N) listener search)
- ✅ Enables Sprint 3's trace view ("where does this come from?")

**Future Impact**: Sprint 3's DebugProbePopover will call `probePort(portKey)`, which uses byPort for instant resolution.

---

## Sprint 1 Learnings Applied

### Learning 1: Slot Resolution is Two-Level (Edge → Bus → Slot)

**From Sprint 1 Investigation**:
- Edges don't have unique slots
- Buses have slots
- Edge value = bus value = slot value

**Applied in Sprint 2**:
- DebugGraph.buses maps BusId → SlotId (via busIndexById)
- probePort resolves: PortKey → ListenerId → BusId → SlotId → Value
- No direct edge-to-slot mapping needed

**Impact**: DebugGraph structure is simpler (no edge concept, only buses/publishers/listeners).

---

### Learning 2: DebugTap Pattern is Proven

**From Sprint 1 Validation**:
- Optional tap interface works (<1% overhead)
- Runtime doesn't depend on services layer (one-way dependency)
- Interface is extensible (Sprint 1 had recordSlotValue, Sprint 2 adds more methods)

**Applied in Sprint 2**:
- Extended DebugTap with `onDebugGraph`, `onSnapshot`, etc.
- Removed recordSlotValue (replaced by snapshot-based recording)
- Kept optional chaining (`tap?.method?.()`)

**Impact**: Sprint 2 doesn't need to re-validate the pattern. We know it works.

---

### Learning 3: 1Hz UI Updates Are Sufficient

**From Sprint 1 Testing**:
- Users don't need 60Hz UI updates for debugging
- 1Hz is smooth enough for casual inspection
- Lower update rate = fewer React re-renders

**Applied in Sprint 2**:
- SimpleDebugPanel still updates at 1Hz
- Ring buffers store 15Hz data (for Sprint 3's plots)
- UI queries at 1Hz, but data is available at 15Hz

**Impact**: Sprint 3 can query higher rates for specific use cases (e.g., timeseries plot), but default UI stays at 1Hz.

---

### Learning 4: Type Metadata Must Be Stored

**From Sprint 1 Discovery**:
- Runtime slots are typeless (just numbers or objects)
- SignalType is compile-time only
- To display "Signal:Phase" vs "Signal:Float", need to store type

**Applied in Sprint 2**:
- DebugGraph.buses has `type: SignalType`
- ValueSummary tag is derived from SignalType
- probePort returns `{ value: ValueSummary, type: SignalType }`

**Impact**: Sprint 3's type-specific renderers can switch on `value.t` or `type.payload`.

---

## Spec Alignment

### What Sprint 2 Implements from Spec

From **08-observation-system.md**:
- ✅ Part 1: DebugGraph (complete)
  - ✅ buses, publishers, listeners
  - ✅ byPort reverse-lookup
  - ✅ pipelines (pre-rendered)
  - ✅ busIndexById, bindingIndexById
- ✅ Part 2: DebugSnapshot (partial)
  - ✅ busNow array
  - ✅ health indicators
  - ❌ bindingNow (TRACE mode) → deferred
  - ❌ perf counters (PERF mode) → deferred
- ✅ Part 3: DebugTap (extended)
  - ✅ onDebugGraph
  - ✅ onSnapshot
  - ❌ hitMaterialize, hitAdapter, hitLens → deferred
- ✅ Part 4: DebugService (complete)
  - ✅ setDebugGraph, pushSnapshot
  - ✅ probePort, probeBus, getBusSeries
  - ✅ Ring buffers
  - ❌ DebugLevel enforcement → deferred

**Deferred to Future Sprints**:
- DebugLevel gating (all recording at FULL for now)
- Performance counters (perf field in snapshot)
- Binding-level recording (bindingNow array)
- Field materialization tracking

**Verdict**: Sprint 2 is **production-complete** for the observation data layer. Deferred items are optimizations, not core functionality.

---

## Risks Identified During Planning

### Risk 1: DebugGraph Builder Complexity
**Status**: MANAGEABLE
**Mitigation**:
- Break builder into phases: buses first, then publishers, then listeners, then byPort
- Log each phase's output for debugging
- Write builder tests with small test cases first

**Acceptance Criteria**:
- Builder works for empty patch (0 buses)
- Builder works for single-bus patch
- Builder works for multi-input port (2+ listeners)

---

### Risk 2: ValueSummary Type Mismatches
**Status**: MITIGATED
**Mitigation**:
- SignalType available from DebugGraph.buses
- summarizeValue enforces tag matches payload type
- Add assertion in debug builds: `assert(tag === expectedTag)`

**Fallback**: If type mismatch detected, use `{ t: 'err', code: 'type-mismatch' }`

---

### Risk 3: Ring Buffer Memory Overhead
**Status**: ACCEPTABLE
**Analysis**:
- 50 buses × 150 samples × 20 bytes = 150KB (worst case)
- Numeric-only patches: 50 × 150 × 8 bytes = 60KB (Float64Array)
- Compare: HealthMonitor ring buffer is ~5KB (proven negligible)

**Fallback**: Reduce capacity to 75 samples (5 seconds) if memory becomes issue.

---

### Risk 4: Snapshot Building Performance
**Status**: LOW RISK
**Mitigation**:
- Snapshot built at 15Hz (not 60Hz)
- ValueSummary creation is cheap (tagged union, no allocation)
- Benchmark target: <1ms per snapshot

**Verification**: Profile snapshot builder in Step 9 (integration testing).

---

### Risk 5: byPort Index Correctness
**Status**: MANAGEABLE
**Mitigation**:
- Test with multi-input ports (e.g., Add block with 2 inputs)
- Verify incomingListeners arrays have correct length
- Log byPort structure after build for manual inspection

**Fallback**: If byPort is buggy, Sprint 3 can query listeners directly (slower but correct).

---

## Open Questions for Sprint 3

### Q1: Popover Positioning Strategy
**Question**: How to position DebugProbePopover near cursor without obscuring graph?
**Recommendation**: Use Radix UI Popover or similar library (handles viewport bounds automatically)

### Q2: Timeseries Plot Library
**Question**: What charting library for getBusSeries visualization?
**Options**: D3, Chart.js, Recharts, custom canvas
**Recommendation**: Recharts (React-friendly, lightweight)

### Q3: Type-Specific Renderer Complexity
**Question**: How fancy should phase ring / color swatch renderers be?
**Recommendation**: Sprint 3 scope is "functional, not beautiful". Polish in future sprint.

### Q4: Trace Summary Expansion
**Question**: Should trace summary be expandable inline, or link to separate panel?
**Recommendation**: Inline expansion (fewer navigation steps). Separate panel for deep dive (Phase 2).

---

## Lessons Learned (To Be Updated After Sprint)

**Placeholder**: Fill this section after sprint completion.

### What Went Well
- TBD

### What Didn't Go Well
- TBD

### What We'd Do Differently
- TBD

### Surprises (Good or Bad)
- TBD

### DebugGraph Structure Insights
- TBD (log actual structure after Step 3, inspect for patterns)

---

## Sprint 3 Preparation Notes

**Before starting Sprint 3, ensure**:
1. Sprint 2 DoD fully met (all checkboxes)
2. DebugGraph structure logged and inspected (verify pipelines look correct)
3. Ring buffers validated (150 samples over 10 seconds)
4. getBusSeries tested with manual query

**Sprint 3 will need**:
- DebugGraph.pipelines (for trace summary display)
- ValueSummary (for type-specific renderers)
- probePort and probeBus (for popover data)
- getBusSeries (for timeseries plots)

**Sprint 3 will NOT need**:
- Changes to DebugGraph structure (immutable API)
- Changes to ring buffers (sufficient capacity)
- Changes to DebugService query API (stable)

**Sprint 3 will replace**:
- SimpleDebugPanel → DebugProbePopover (new component)
- Text-only display → Type-specific renderers

**Sprint 3 will add** (no changes to Sprint 2 code):
- DebugProbePopover.tsx (new)
- Type-specific renderer components (new)
- Identity badges, trace summary UI (new)

---

## References

### Spec Documents
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/08-observation-system.md`
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/09-debug-ui-spec.md`

### Related Code (To Be Created)
- `src/core/debug-types.ts` (ValueSummary, DebugGraph types)
- `src/compiler/DebugGraphBuilder.ts` (graph builder)
- `src/services/RingBuffer.ts` (ring buffer implementations)
- `src/services/DebugService.ts` (query API)
- `src/runtime/buildDebugSnapshot.ts` (snapshot builder)

### Planning Artifacts
- `.agent_planning/debug-probe/EVALUATION-20260120-163500.md`
- `.agent_planning/debug-probe/SPRINT-20260120-170000-minimal-debug-panel-*` (Sprint 1)
- `.agent_planning/debug-probe/SPRINT-20260120-170100-full-data-layer-*` (Sprint 2)

---

## DebugGraph Structure Example (To Be Filled After Implementation)

**Placeholder**: After Step 3 completion, paste actual DebugGraph output here for reference.

```typescript
// Example (to be replaced with real output):
{
  patchRevision: 1,
  buses: {
    "energy": {
      id: "energy",
      name: "energy",
      type: { payload: "float", cardinality: { kind: "one" }, temporality: "continuous" },
      combineMode: "sum",
      publisherIds: ["slider_1->energy", "osc_1->energy"],
      listenerIds: ["energy->dots.radius"]
    }
  },
  byPort: {
    "DotsRenderer_1.radius": {
      incomingListeners: ["energy->dots.radius"],
      outgoingPublishers: []
    }
  },
  // ... etc.
}
```

---

**END OF CONTEXT DOCUMENT**
