# SPRINT-20260120-170000: Minimal Debug Panel + Basic Runtime Instrumentation

**Status**: PLANNED
**Confidence**: HIGH
**Started**: TBD
**Completed**: TBD

---

## Context

**Sprint Goal**: Establish the minimum viable observation infrastructure to display runtime values on edge hover.

**Prior State**:
- No runtime value observation exists
- Edge hover shows nothing
- ValueStore exists but no query API
- HealthMonitor provides pattern for throttled sampling

**Success Criteria**:
- Hover any edge → see current value in simple panel
- Values update at ~1Hz (throttled)
- Panel shows: edge identity, current value (formatted), timestamp
- No performance impact on frame execution

---

## What We're Building

### 1. SimpleDebugPanel Component (UI)
**File**: `src/ui/components/SimpleDebugPanel.tsx` (NEW)

A minimal bottom-right floating panel that shows:
```
┌─────────────────────────────────┐
│ Debug Probe                     │
├─────────────────────────────────┤
│ Edge: Slider_1.value → radius   │
│ Type: Signal:Float              │
│ Value: 0.73                     │
│ Updated: 12:34:56               │
└─────────────────────────────────┘
```

**Features**:
- Positioned bottom-right, 300px wide, auto height
- Shows last-hovered edge data
- Updates at 1Hz max (throttled)
- Simple text display (no fancy renderers yet)
- Can be toggled on/off

**Dependencies**: None (pure React component)

---

### 2. Basic DebugService (Data Layer)
**File**: `src/services/DebugService.ts` (NEW)

Singleton service that:
- Stores current slot values: `Map<SlotId, number>`
- Provides query method: `getSlotValue(slotId: number): number | undefined`
- Accepts edge-to-slot mapping: `setEdgeToSlotMap(map: Map<EdgeId, SlotId>)`
- Query method for edges: `getEdgeValue(edgeId: string): { value: number; type: string } | undefined`

**Interface**:
```typescript
interface DebugService {
  // Set the mapping (called after compilation)
  setEdgeToSlotMap(map: Map<string, number>): void;

  // Update slot values (called from runtime)
  updateSlotValue(slotId: number, value: number): void;

  // Query by edge ID (called from UI)
  getEdgeValue(edgeId: string): { value: number; slotId: number } | undefined;
}
```

**Storage**: Simple Map (current values only). Sprint 2 adds ring buffers for timeseries.

---

### 3. Runtime Instrumentation via DebugTap
**File**: `src/runtime/RuntimeState.ts` (MODIFY)

Add optional `tap` field:
```typescript
interface RuntimeState {
  // ... existing fields ...
  tap?: DebugTap;  // NEW
}

interface DebugTap {
  recordSlotValue?(slotId: number, value: number): void;
}
```

**File**: `src/runtime/ScheduleExecutor.ts` (MODIFY)

After each slot write, call tap:
```typescript
// After: state.valueStore.f64[slotId] = computedValue;
state.tap?.recordSlotValue?.(slotId, computedValue);
```

**Throttling**: Record every frame, but DebugService only exposes values at 1Hz to UI.

---

### 4. Edge Hover Handler in ReactFlow
**File**: `src/ui/reactFlowEditor/ReactFlowEditor.tsx` (MODIFY)

Wire up ReactFlow edge events:
```typescript
<ReactFlow
  // ... existing props ...
  onEdgeMouseEnter={(event, edge) => {
    handleEdgeHover(edge.id);
  }}
  onEdgeMouseLeave={() => {
    handleEdgeHoverEnd();
  }}
/>
```

**Hook**: `useDebugProbe(edgeId: string | null)`
- Queries DebugService at 1Hz when edgeId is set
- Returns `{ value: number; type: string } | null`
- Throttles with `useEffect` + `setInterval`

---

### 5. Edge-to-Slot Resolution (Compiler Hook)
**File**: `src/compiler/compileBusAwarePatch.ts` (MODIFY)

At end of compilation, build simple edge→slot map:
```typescript
const edgeToSlotMap = new Map<string, number>();

// For each edge in PatchStore:
for (const edge of patchStore.edges) {
  const slotId = resolveSlotForEdge(edge);  // helper function
  if (slotId !== undefined) {
    edgeToSlotMap.set(edge.id, slotId);
  }
}

// Pass to DebugService
debugService.setEdgeToSlotMap(edgeToSlotMap);
```

**NOTE**: This is the minimal version. Sprint 2 will build proper DebugGraph with full topology.

---

## Implementation Steps

### Step 1: Create DebugService Singleton (2 hours)
- [ ] Create `src/services/DebugService.ts`
- [ ] Implement Map-based storage for slot values
- [ ] Implement edge-to-slot mapping
- [ ] Export singleton instance
- [ ] Add basic tests

**Acceptance**:
```typescript
debugService.setEdgeToSlotMap(new Map([["edge1", 42]]));
debugService.updateSlotValue(42, 0.73);
expect(debugService.getEdgeValue("edge1")).toEqual({ value: 0.73, slotId: 42 });
```

---

### Step 2: Add DebugTap to Runtime (1.5 hours)
- [ ] Add `tap?: DebugTap` to RuntimeState interface
- [ ] Add `recordSlotValue` calls in ScheduleExecutor after slot writes
- [ ] Wire up tap to call `debugService.updateSlotValue()`
- [ ] Verify no performance impact (benchmark with/without tap)

**Acceptance**:
- Frame execution time unchanged (<1% variance)
- Slot values observable in DebugService after frame

---

### Step 3: Build Edge-to-Slot Map in Compiler (2 hours)
- [ ] Identify slot resolution mechanism (investigate IR structure)
- [ ] Build `resolveSlotForEdge()` helper
- [ ] Call `debugService.setEdgeToSlotMap()` at end of compilation
- [ ] Log map contents to verify correctness

**Acceptance**:
- All visible edges have slot mappings
- Console log shows: `DebugService: Mapped 15 edges to slots`

---

### Step 4: Create SimpleDebugPanel Component (2.5 hours)
- [ ] Create `src/ui/components/SimpleDebugPanel.tsx`
- [ ] Position bottom-right with fixed width
- [ ] Display: edge name, type, value, timestamp
- [ ] Add toggle button to show/hide
- [ ] Wire to ReactFlowEditor

**Acceptance**:
- Panel visible when toggle is on
- Shows placeholder data when no edge hovered

---

### Step 5: Wire Edge Hover Events (1.5 hours)
- [ ] Add `onEdgeMouseEnter`/`onEdgeMouseLeave` to ReactFlow
- [ ] Create `useDebugProbe(edgeId)` hook
- [ ] Throttle updates to 1Hz
- [ ] Update SimpleDebugPanel with live data

**Acceptance**:
- Hover edge → panel updates within 1 second
- Leave edge → panel shows "No edge selected"
- Values match actual runtime state

---

### Step 6: Basic Type Formatting (1 hour)
- [ ] Add `formatValue(value: number, type: string): string`
- [ ] Handle float (2 decimals), phase (0..1 with %), color (hex if applicable)
- [ ] Display in panel

**Acceptance**:
- Float: `0.73`
- Phase: `25.0%`
- Color: `#C86432` (if color type detected)

---

### Step 7: Integration Testing (1.5 hours)
- [ ] Test with existing patches (oscillator, shapes)
- [ ] Verify edge hover on multiple edge types
- [ ] Verify values update correctly
- [ ] Test panel toggle
- [ ] Test with no edges (empty patch)

**Acceptance**:
- All edge hovers work
- No console errors
- No frame drops

---

## Files Changed

### New Files
- `src/services/DebugService.ts` (~150 lines)
- `src/ui/components/SimpleDebugPanel.tsx` (~100 lines)
- `src/ui/hooks/useDebugProbe.ts` (~50 lines)

### Modified Files
- `src/runtime/RuntimeState.ts` (+10 lines: add `tap` field)
- `src/runtime/ScheduleExecutor.ts` (+5 lines: call tap after slot write)
- `src/compiler/compileBusAwarePatch.ts` (+30 lines: build edge-to-slot map)
- `src/ui/reactFlowEditor/ReactFlowEditor.tsx` (+20 lines: wire edge hover)

**Total LOC**: ~365 lines (NEW: ~300, MODIFIED: ~65)

---

## Dependencies

### External
- None (uses existing ReactFlow, Zustand, etc.)

### Internal
- RuntimeState.ts (exists)
- ScheduleExecutor.ts (exists)
- compileBusAwarePatch.ts (exists)
- ReactFlowEditor.tsx (exists)

### Coordination
- None (isolated sprint)

---

## Risks & Mitigations

### Risk 1: Slot Resolution Unclear
**Impact**: MEDIUM
**Probability**: LOW
**Mitigation**:
- Investigate IR structure before Step 3
- If unclear, use port-to-bus mapping instead (temporary)
- Sprint 2 will replace with proper DebugGraph

**Fallback**: Query by port ID instead of edge ID (requires UI change)

---

### Risk 2: Performance Impact from Tap Calls
**Impact**: HIGH
**Probability**: LOW
**Mitigation**:
- DebugTap calls are no-op if tap is undefined
- Only record to Map (constant-time write)
- No allocation per frame
- Benchmark before/after

**Fallback**: Remove tap calls, defer to Sprint 2 with proper throttling

---

### Risk 3: Edge IDs Don't Match IR
**Impact**: MEDIUM
**Probability**: LOW
**Mitigation**:
- Verify edge.id stability across compilation
- Log edge IDs before/after compile
- Use PortKey as backup identifier

**Fallback**: Use port-based lookup instead of edge-based

---

## Testing Strategy

### Unit Tests
- DebugService: Map operations, edge-to-slot lookup
- useDebugProbe: Throttling behavior, null handling

### Integration Tests
- Compile patch → verify edge-to-slot map populated
- Runtime execution → verify slot values update
- UI interaction → verify hover updates panel

### Manual Tests
- Hover multiple edges in sequence
- Toggle panel on/off
- Test with empty patch
- Test with large patch (50+ nodes)

---

## Success Metrics

### Functional
- [ ] Edge hover displays current value
- [ ] Panel updates at ~1Hz
- [ ] All edges resolve to slot values
- [ ] Toggle works correctly

### Performance
- [ ] Frame time unchanged (<1% increase)
- [ ] No memory leaks (run 1000 frames)
- [ ] UI responsive (no stuttering)

### Quality
- [ ] No TypeScript errors
- [ ] No console warnings
- [ ] Code passes lint
- [ ] Tests pass

---

## Follow-up Work (Not This Sprint)

**Sprint 2 Extensions**:
- Add ring buffers to DebugService (for timeseries queries)
- Build proper DebugGraph (extends edge-to-slot map with full topology)
- Add ValueSummary tagged union (extends raw numbers with all types)
- Support all payload types (extends float-only support)

**Deferred Features**:
- Type-specific renderers (meters, phase rings) → Sprint 3
- Popover positioning → Sprint 3
- Trace view → Sprint 3
- Diagnostics integration → Future sprint

---

## Notes

- This sprint establishes the **foundation for observation system**: Compiler → Runtime → Service → UI
- All infrastructure follows **production patterns** (DebugTap interface, DebugService pattern, instrumentation points)
- Goal is **minimal but correct implementation** that Sprint 2 extends
- Keep it simple: text-only display, no fancy visualizations
- If any step takes >2x estimated time, STOP and reassess

---

## Estimated Effort

| Task | Estimate | Confidence |
|------|----------|------------|
| DebugService | 2h | HIGH |
| Runtime tap | 1.5h | HIGH |
| Compiler map | 2h | MEDIUM |
| SimpleDebugPanel | 2.5h | HIGH |
| Edge hover | 1.5h | HIGH |
| Type formatting | 1h | HIGH |
| Integration testing | 1.5h | HIGH |
| **TOTAL** | **12 hours** | **HIGH** |

**Recommended allocation**: 1.5 days with buffer

---

## Dependencies for Next Sprint

**Sprint 2 builds upon**:
- DebugTap interface (defined in this sprint, extended in Sprint 2)
- DebugService pattern (established in this sprint, enriched in Sprint 2)
- Instrumentation points (added in this sprint, used by Sprint 2)
- Understanding of slot resolution (learned in this sprint)

**Sprint 2 extends Sprint 1**:
- Simple Map → Add ring buffers alongside current-value storage
- Edge-to-slot map → Enrich with DebugGraph topology
- Raw numbers → Wrap with ValueSummary
- SimpleDebugPanel → Replaced in Sprint 3 (data layer stays)

---

## Sign-off Checklist

Before marking sprint COMPLETE:
- [ ] All 7 implementation steps checked off
- [ ] All success metrics met
- [ ] DoD items verified (see SPRINT-20260120-170000-minimal-debug-panel-DOD.md)
- [ ] No regressions in existing features
- [ ] Code reviewed
- [ ] Tests passing
- [ ] Performance benchmarked
- [ ] Ready for Sprint 2

---

**END OF SPRINT PLAN**
