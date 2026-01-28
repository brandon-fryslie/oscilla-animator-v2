# Handoff: Debug Probe Hover Not Working

**Created**: 2026-01-20 22:09:00
**For**: Debugging agent / developer
**Status**: RESOLVED 2026-01-21

## Resolution

**Root Cause**: `pass7-schedule.ts` was not generating `evalSig` steps for signals with registered slots. Without these steps, the runtime tap that records slot values was never called.

**Fix**: Added `evalSig` step generation to `pass7-schedule.ts`:
1. Added `getSigSlots()` method to IRBuilder interface
2. Generate `evalSig` steps for all signals with registered slots before other schedule steps

**Limitation**: Only Signal edges show values. Field edges (arrays) don't have tap points yet - deferred until after field refactor.

---

## Original Issue (for reference)

---

## Objective

**Issue**: User reports "Nothing happens when I hover over an edge. No errors in the console, nothing appears in the panel."

**Goal**: Diagnose why the edge hover → debug panel data flow is not working and implement a fix.

## Current State

### What's Been Done
- ✅ Sprint 1 implementation completed by iterative-implementer agent
- ✅ All files created/modified:
  - `src/services/DebugService.ts` - Value storage singleton
  - `src/compiler/compile.ts` - Edge-to-slot mapping builder
  - `src/main.ts` - DebugService tap wiring
  - `src/runtime/ScheduleExecutor.ts` - Runtime value recording
  - `src/ui/reactFlowEditor/ReactFlowEditor.tsx` - Edge hover handlers
  - `src/ui/components/SimpleDebugPanel.tsx` - Debug panel UI
  - `src/ui/hooks/useDebugProbe.ts` - Value query hook
- ✅ TypeScript compiles cleanly
- ✅ Vite build succeeds
- ✅ Code committed

### What's In Progress
- 🔄 Debugging why hover functionality doesn't work

### What Remains
- ❌ Identify root cause of hover failure
- ❌ Implement fix
- ❌ Verify hover → panel data flow works end-to-end
- ❌ Test with real runtime values

## Context & Background

### Why We're Doing This
Sprint 1 of the Debug Probe feature was implemented to provide a minimal debug panel showing runtime values for edges in the graph editor. This is foundation work that Sprint 2 will extend with full DebugGraph and ring buffers.

### Key Decisions Made
| Decision | Rationale | Date |
|----------|-----------|------|
| Simple edge→slot Map (not DebugGraph) | MVP approach, full DebugGraph in Sprint 2 | 2026-01-20 |
| 1Hz UI polling | Balance responsiveness vs performance | 2026-01-20 |
| Fixed bottom-right panel | Defer popover positioning to Sprint 3 | 2026-01-20 |
| Foundation work (not throwaway) | User feedback: Sprint 2 extends, not replaces | 2026-01-20 |

### Important Constraints
- Must maintain <5% frame time overhead
- No errors in console (user confirmed this)
- Architecture must support Sprint 2 extension (DebugGraph, ring buffers)
- Use existing debugIndex.slotToPort for slot resolution

## Acceptance Criteria

Sprint 1 is complete when:

- [ ] Hovering an edge in ReactFlow shows SimpleDebugPanel
- [ ] Panel displays edge ID, slot ID, type, and current value
- [ ] Panel updates at ~1Hz while hovering
- [ ] Panel disappears when hover ends
- [ ] No console errors
- [ ] FPS impact <5%
- [ ] Toggle button enables/disables panel

## Data Flow Architecture

**Expected Flow**:
```
1. Compilation:
   compile.ts:buildEdgeToSlotMap() → debugService.setEdgeToSlotMap(edgeMetaMap)

2. Frame Execution:
   ScheduleExecutor.ts:executeSchedule() → state.tap?.recordSlotValue(slot, value)
   → debugService.updateSlotValue(slotId, value)

3. User Hover:
   ReactFlowEditor onEdgeMouseEnter → setHoveredEdgeId(edge.id)

4. UI Query:
   useDebugProbe(hoveredEdgeId) → debugService.getEdgeValue(edgeId)
   → { value, slotId, type }

5. Display:
   SimpleDebugPanel renders formatted value
```

## Scope

### Files to Investigate

**Priority 1: Data Flow Verification**
- `src/compiler/compile.ts:442-479` - Is `buildEdgeToSlotMap()` being called? Are edges mapped?
- `src/runtime/ScheduleExecutor.ts:129` - Is `tap?.recordSlotValue()` being called?
- `src/services/DebugService.ts` - Log map size, value updates, queries

**Priority 2: UI State**
- `src/ui/reactFlowEditor/ReactFlowEditor.tsx:236-248` - Are hover handlers firing?
- `src/ui/reactFlowEditor/ReactFlowEditor.tsx:138-140` - Is `hoveredEdgeId` state updating?
- `src/ui/hooks/useDebugProbe.ts:21-48` - Is hook querying with correct edgeId?
- `src/ui/components/SimpleDebugPanel.tsx:65-127` - Is panel receiving data?

**Priority 3: ReactFlow Configuration**
- `src/ui/reactFlowEditor/ReactFlowEditor.tsx:487-488` - Are `onEdgeMouseEnter`/`onEdgeMouseLeave` wired to `<ReactFlow />`?
- Check if ReactFlow edges have proper IDs that match PatchStore edge IDs

### Related Components
- `src/types.ts` - ValueSlot type definition
- `src/core/canonical-types.ts` - CanonicalType definition
- `src/runtime/RuntimeState.ts` - Tap interface definition

### Out of Scope
- Sprint 2 features (DebugGraph, ring buffers)
- Sprint 3 features (popover, advanced visualizations)
- Performance optimization beyond basic throttling

## Implementation Approach

### Recommended Debugging Steps

**Step 1: Add Console Logging**
Add logs at each stage of the data flow to identify where it breaks:

```typescript
// In compile.ts buildEdgeToSlotMap()
console.log(`[DEBUG] buildEdgeToSlotMap: debugIndex exists=${!!debugIndex}, edges=${patch.edges.length}`);
console.log(`[DEBUG] buildEdgeToSlotMap: mapped ${edgeMetaMap.size} edges`);

// In ScheduleExecutor.ts
console.log(`[DEBUG] recordSlotValue: slot=${slot}, value=${value}, tap exists=${!!state.tap}`);

// In ReactFlowEditor.tsx handleEdgeMouseEnter
console.log(`[DEBUG] Edge hover: ${edge.id}`);

// In useDebugProbe
console.log(`[DEBUG] useDebugProbe: edgeId=${edgeId}, result=`, result);

// In SimpleDebugPanel
console.log(`[DEBUG] SimpleDebugPanel: enabled=${enabled}, edgeValue=`, edgeValue);
```

**Step 2: Check ReactFlow Edge IDs**
Verify edge IDs in ReactFlow match PatchStore edge IDs:

```typescript
// In ReactFlowEditor, after sync
console.log('[DEBUG] ReactFlow edges:', edges.map(e => e.id));
console.log('[DEBUG] PatchStore edges:', Array.from(rootStore.patch.edges.values()).map(e => e.id));
```

**Step 3: Verify Compilation Triggers Mapping**
Check if `buildEdgeToSlotMap()` is called after compilation:

```typescript
// In compile.ts after calling buildEdgeToSlotMap()
const mapSize = debugService['edgeToSlotMap'].size; // Access private via bracket notation for debugging
console.log(`[DEBUG] DebugService map size after build: ${mapSize}`);
```

**Step 4: Check Runtime Tap Wiring**
Verify tap is set on RuntimeState:

```typescript
// In main.ts after setting currentState.tap
console.log('[DEBUG] RuntimeState tap wired:', !!currentState.tap);
```

**Step 5: Test With Known Edge**
Manually query debugService for a known edge ID:

```typescript
// In browser console
import { debugService } from './services/DebugService';
const result = debugService.getEdgeValue('reactflow__edge-blockA.out-blockB.in');
console.log('Manual query result:', result);
```

### Known Gotchas

**Gotcha 1: Edge ID Format Mismatch**
- ReactFlow generates edge IDs like `'reactflow__edge-${source}${sourceHandle}-${target}${targetHandle}'`
- PatchStore edge IDs are `edge.id` (string)
- If these don't match, the map lookup will fail
- **Fix**: Ensure `buildEdgeToSlotMap()` uses `edge.id` from PatchStore, and ReactFlow edges use same IDs

**Gotcha 2: DebugIndex Missing**
- `buildEdgeToSlotMap()` requires `unlinkedIR.builder?.debugIndex` to exist
- If debugIndex is missing, map will be empty
- Console should show warning: `"[DebugService] No debugIndex available, edge-to-slot map will be empty"`
- **Fix**: Verify compiler Pass 6 builds debugIndex correctly

**Gotcha 3: Hover Event Not Firing**
- ReactFlow `onEdgeMouseEnter` requires edges to have pointer-events enabled
- CSS might disable pointer events on edges
- **Fix**: Check ReactFlowEditor.css for `pointer-events: none` on edges

**Gotcha 4: Panel Hidden Behind Other UI**
- SimpleDebugPanel has `zIndex: 1000` but other UI might be higher
- Fixed positioning might place panel off-screen
- **Fix**: Inspect DOM to verify panel is rendered and visible

**Gotcha 5: State Not Updating**
- `hoveredEdgeId` state set but component not re-rendering
- `useDebugProbe` not triggering updates
- **Fix**: Add console.log in render to verify state changes trigger re-renders

**Gotcha 6: Runtime Not Calling Tap**
- ScheduleExecutor might not be executing (no animation running)
- Tap might be undefined at execution time
- **Fix**: Start animation/playback, verify frame execution via console logs

## Reference Materials

### Planning Documents
- [SPRINT-20260120-170000-minimal-debug-panel-PLAN.md](.agent_planning/debug-probe/SPRINT-20260120-170000-minimal-debug-panel-PLAN.md) - Full Sprint 1 plan
- [SPRINT-20260120-170000-minimal-debug-panel-DOD.md](.agent_planning/debug-probe/SPRINT-20260120-170000-minimal-debug-panel-DOD.md) - Acceptance criteria
- [SPRINT-20260120-170000-minimal-debug-panel-CONTEXT.md](.agent_planning/debug-probe/SPRINT-20260120-170000-minimal-debug-panel-CONTEXT.md) - Implementation context
- [EVALUATION-20260120-163500.md](.agent_planning/debug-probe/EVALUATION-20260120-163500.md) - Initial evaluation

### Recent Commits
- `1e3430b` - "fix(editor): Use useStores() hook in ReactFlowEditor for proper store access"
- Earlier Sprint 1 implementation commits (check git log for DebugService, SimpleDebugPanel)

### Codebase References

**Data Flow Chain**:
1. `src/compiler/compile.ts:442-479` - Edge-to-slot map builder
2. `src/services/DebugService.ts:66-69` - Map setter
3. `src/main.ts:463-466` - Tap wiring to RuntimeState
4. `src/runtime/ScheduleExecutor.ts:129` - Tap invocation during frame execution
5. `src/services/DebugService.ts:78-80` - Value storage
6. `src/ui/hooks/useDebugProbe.ts:21-48` - UI query hook
7. `src/ui/reactFlowEditor/ReactFlowEditor.tsx:236-248` - Hover handlers
8. `src/ui/components/SimpleDebugPanel.tsx:65-127` - Display component

**Key Interfaces**:
- `src/runtime/RuntimeState.ts` - DebugTap interface definition
- `src/types.ts` - ValueSlot type
- `src/core/canonical-types.ts` - CanonicalType definition

## Questions & Blockers

### Open Questions
- [ ] Is `buildEdgeToSlotMap()` being called after compilation?
- [ ] Are ReactFlow edge IDs matching PatchStore edge IDs?
- [ ] Are hover events firing on ReactFlow edges?
- [ ] Is `hoveredEdgeId` state updating in ReactFlowEditor?
- [ ] Is `useDebugProbe` receiving the correct edgeId?
- [ ] Is `debugService.getEdgeValue()` returning data?
- [ ] Is SimpleDebugPanel receiving props correctly?
- [ ] Is runtime executing (animation playing) to call tap?

### Current Blockers
- **User reports no visible behavior** - No console errors, so silent failure
- **No diagnostic logging in place** - Need to add logs to trace data flow

### Need User Input On
- Is the animation/playback running? (tap only called during frame execution)
- Can user open browser console to see debug logs?
- Can user try clicking "Debug: ON" toggle button?

## Testing Strategy

### Manual Testing Steps
1. **Open browser console** (F12)
2. **Add diagnostic logging** to each file listed in "Recommended Debugging Steps"
3. **Reload page**
4. **Check console for**:
   - `"[DebugService] Mapped N edges to slots"` (should show N > 0)
   - `"[DEBUG] buildEdgeToSlotMap: mapped N edges"` (should show N > 0)
5. **Start animation** (if not auto-playing)
6. **Check console for**:
   - `"[DEBUG] recordSlotValue: slot=X, value=Y"` (should appear ~60fps)
7. **Hover over an edge**
8. **Check console for**:
   - `"[DEBUG] Edge hover: <edgeId>"`
   - `"[DEBUG] useDebugProbe: edgeId=<edgeId>, result=<object>"`
   - `"[DEBUG] SimpleDebugPanel: enabled=true, edgeValue=<object>"`
9. **Look for panel in bottom-right** (might need to scroll if canvas is large)

### Expected Successful Output
```
[DebugService] Mapped 5 edges to slots
[DEBUG] buildEdgeToSlotMap: debugIndex exists=true, edges=5
[DEBUG] buildEdgeToSlotMap: mapped 5 edges
[DEBUG] RuntimeState tap wired: true
... (animation frames) ...
[DEBUG] recordSlotValue: slot=0, value=0.523, tap exists=true
[DEBUG] recordSlotValue: slot=1, value=1.234, tap exists=true
... (user hovers edge) ...
[DEBUG] Edge hover: edge-1
[DEBUG] useDebugProbe: edgeId=edge-1, result={value: 0.523, slotId: 0, type: {...}}
[DEBUG] SimpleDebugPanel: enabled=true, edgeValue={value: 0.523, slotId: 0, type: {...}}
```

### If No Edges Mapped
```
[DebugService] No debugIndex available, edge-to-slot map will be empty
[DEBUG] buildEdgeToSlotMap: debugIndex exists=false, edges=5
[DEBUG] buildEdgeToSlotMap: mapped 0 edges
```
→ **Root cause**: debugIndex not built by compiler

### If Tap Not Called
```
(No recordSlotValue logs appear)
```
→ **Root cause**: Runtime not executing, or tap not wired

### If Hover Not Firing
```
(No "Edge hover" logs when hovering edges)
```
→ **Root cause**: ReactFlow hover handlers not wired, or pointer-events disabled

## Success Metrics

Implementation is successful when:

1. **Compilation**: Console shows `"[DebugService] Mapped N edges to slots"` with N > 0
2. **Runtime**: Console shows `"[DEBUG] recordSlotValue"` logs at ~60fps during animation
3. **Hover**: Console shows `"[DEBUG] Edge hover"` when hovering edges
4. **Query**: Console shows `"[DEBUG] useDebugProbe: ... result={...}"` with non-null result
5. **Display**: SimpleDebugPanel appears in bottom-right with edge value
6. **Toggle**: Clicking "Debug: ON/OFF" button hides/shows panel
7. **Performance**: FPS remains >57fps (within 5% of baseline)

---

## Next Steps for Agent

**Immediate actions**:
1. Add console logging to all 7 files in data flow chain
2. Reload page and check console output
3. Identify where data flow breaks (compilation, runtime, UI state, query)
4. Implement fix for root cause

**Before starting implementation**:
- [ ] Review Sprint 1 planning docs for acceptance criteria
- [ ] Review DebugService API contract
- [ ] Check if recent commits might have broken the implementation

**When complete**:
- [ ] Remove debug logging (or gate behind debug flag)
- [ ] Verify all acceptance criteria pass
- [ ] Commit fix with clear message explaining root cause
- [ ] Update STATUS doc if major state change
- [ ] Report findings to user

---

## Hypotheses (Ordered by Likelihood)

### Hypothesis 1: Edge ID Mismatch (HIGH PROBABILITY)
**Symptom**: Hover fires, but `getEdgeValue()` returns undefined
**Cause**: ReactFlow edge IDs don't match PatchStore edge IDs
**Test**: Log both sets of IDs and compare
**Fix**: Ensure sync layer uses consistent edge IDs

### Hypothesis 2: DebugIndex Not Built (MEDIUM PROBABILITY)
**Symptom**: Map size is 0 after compilation
**Cause**: Compiler Pass 6 not building debugIndex
**Test**: Check console for "[DebugService] No debugIndex available" warning
**Fix**: Verify compiler pass ordering and debugIndex builder

### Hypothesis 3: Runtime Not Executing (MEDIUM PROBABILITY)
**Symptom**: No `recordSlotValue` calls
**Cause**: Animation not playing, or schedule not executing
**Test**: Check if playback is running, verify frame execution
**Fix**: Start animation, or check if schedule executor is being called

### Hypothesis 4: Hover Events Not Wired (LOW PROBABILITY)
**Symptom**: No "Edge hover" logs
**Cause**: ReactFlow props not set, or CSS blocks pointer events
**Test**: Check ReactFlow component props, inspect edge CSS
**Fix**: Ensure `onEdgeMouseEnter`/`onEdgeMouseLeave` are passed to `<ReactFlow />`

### Hypothesis 5: Panel Rendering But Hidden (LOW PROBABILITY)
**Symptom**: Data flows correctly, but panel not visible
**Cause**: CSS z-index issue, or panel off-screen
**Test**: Inspect DOM for SimpleDebugPanel element, check computed styles
**Fix**: Adjust z-index or positioning

### Hypothesis 6: React State Not Updating (VERY LOW PROBABILITY)
**Symptom**: State changes but no re-render
**Cause**: React optimization bug, or stale closure
**Test**: Add console.log in component render
**Fix**: Force re-render with key prop or useReducer

---

## Additional Context

### Sprint 1 Constraints
- **No DebugGraph**: Using simple edge→slot Map
- **No ring buffers**: Only latest value stored
- **No history**: Sprint 3 feature
- **Text-only panel**: Sprint 3 adds popover and rich visualizations

### Sprint 2 Will Extend
- DebugGraph builder in compiler (buses, publishers, listeners)
- Ring buffers for timeseries (150 samples @ 15Hz = 10 seconds)
- ValueSummary tagged union for all payload types
- Proper topology resolution (edge → bus → publishers → listeners)

### Architecture Principles
- **ONE SOURCE OF TRUTH**: debugIndex is source for slot→port mapping
- **SINGLE ENFORCER**: DebugService is single point for value storage
- **ONE-WAY DEPENDENCIES**: UI → Service → Runtime (no back-references)
