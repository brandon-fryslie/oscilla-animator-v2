# Definition of Done: Sprint 1 - Minimal Debug Panel

**Sprint ID**: SPRINT-20260120-170000
**Feature**: Minimal Debug Panel + Basic Runtime Instrumentation

---

## Functional Requirements

### F1: Edge Hover Value Display
- [ ] Hovering any edge in ReactFlow triggers edge hover event
- [ ] SimpleDebugPanel becomes visible on edge hover
- [ ] Panel displays:
  - [ ] Edge identifier (e.g., "Slider_1.value → DotsRenderer.radius")
  - [ ] Signal type (e.g., "Signal:Float")
  - [ ] Current numeric value (e.g., "0.73")
  - [ ] Last update timestamp
- [ ] Panel hides or shows "No edge selected" when hover ends
- [ ] Panel persists across multiple edge hovers (updates content)

### F2: Value Updates
- [ ] Displayed value updates at least once per second (~1Hz)
- [ ] Value reflects actual runtime state (matches ValueStore contents)
- [ ] Stale values are marked (e.g., "Last updated: 3s ago")
- [ ] No value displayed if edge has no slot mapping

### F3: Panel Toggle
- [ ] Toggle button exists in UI (toolbar or corner)
- [ ] Clicking toggle shows/hides SimpleDebugPanel
- [ ] Panel state persists during session (doesn't reset on hover)
- [ ] Default state is hidden (user must enable)

### F4: Basic Type Formatting
- [ ] Float values show 2 decimal places (e.g., "0.73")
- [ ] Phase values show percentage (e.g., "25.0%")
- [ ] Color values show hex if type is color (e.g., "#C86432")
- [ ] Unknown types show raw number

---

## Technical Requirements

### T1: DebugService Implementation
- [ ] Singleton instance exported from `src/services/DebugService.ts`
- [ ] Methods implemented:
  - [ ] `setEdgeToSlotMap(map: Map<string, number>): void`
  - [ ] `updateSlotValue(slotId: number, value: number): void`
  - [ ] `getEdgeValue(edgeId: string): { value: number; slotId: number } | undefined`
- [ ] Thread-safe (no race conditions if called from multiple contexts)
- [ ] No memory leaks (Map doesn't grow unbounded)
- [ ] TypeScript types exported

### T2: Runtime Instrumentation
- [ ] `RuntimeState` interface has optional `tap?: DebugTap` field
- [ ] `ScheduleExecutor` calls `tap?.recordSlotValue?.()` after each slot write
- [ ] Tap calls are guarded (no error if tap is undefined)
- [ ] DebugTap interface matches spec:
  ```typescript
  interface DebugTap {
    recordSlotValue?(slotId: number, value: number): void;
  }
  ```
- [ ] Tap can be injected at runtime initialization
- [ ] Works correctly with tap = undefined (no-op)

### T3: Compiler Integration
- [ ] `compileBusAwarePatch()` builds edge-to-slot map
- [ ] Map includes all edges that have slot assignments
- [ ] Map is passed to `debugService.setEdgeToSlotMap()` after compilation
- [ ] Console log confirms map size (e.g., "Mapped 15 edges")
- [ ] Recompilation clears old map and builds new one

### T4: UI Integration
- [ ] `ReactFlowEditor` has `onEdgeMouseEnter` and `onEdgeMouseLeave` handlers
- [ ] Handlers call `useDebugProbe()` hook
- [ ] `useDebugProbe(edgeId)` queries DebugService at 1Hz max
- [ ] Hook returns `{ value: number; type: string } | null`
- [ ] SimpleDebugPanel renders returned data
- [ ] No infinite re-render loops
- [ ] No React warnings in console

---

## Performance Requirements

### P1: Frame Budget
- [ ] Frame execution time with tap enabled ≤ 1% slower than without tap
- [ ] Benchmark: 1000 frames with/without tap, compare average frame time
- [ ] No frame drops during normal operation (60fps maintained)
- [ ] Memory usage stable over 1000 frames (no unbounded growth)

### P2: UI Responsiveness
- [ ] Edge hover response time < 100ms (visible panel update)
- [ ] Value update latency < 1.5s (from runtime to UI)
- [ ] Panel toggle instant (< 50ms)
- [ ] No UI freezes during patch execution

---

## Quality Requirements

### Q1: Code Quality
- [ ] All new files have TypeScript types (no `any` without justification)
- [ ] ESLint passes with no warnings
- [ ] Prettier formatting applied
- [ ] No console.log statements (use proper logging if needed)
- [ ] No commented-out code blocks
- [ ] Meaningful variable names (no `x`, `tmp`, `data`)

### Q2: Testing
- [ ] Unit tests for DebugService:
  - [ ] Map storage and retrieval
  - [ ] Edge-to-slot lookup
  - [ ] Missing edge returns undefined
- [ ] Unit tests for useDebugProbe:
  - [ ] Throttling behavior (updates at most 1Hz)
  - [ ] Null handling (edgeId = null)
- [ ] Integration test: Compile → Runtime → Service → UI
  - [ ] Patch compiles successfully
  - [ ] Edge map populated
  - [ ] Runtime updates slot values
  - [ ] UI displays correct value
- [ ] All tests pass (`npm run test`)

### Q3: Error Handling
- [ ] No TypeScript errors (`npm run typecheck`)
- [ ] No runtime errors in console during normal operation
- [ ] Graceful handling of:
  - [ ] Edge with no slot mapping → show "No data"
  - [ ] DebugService not initialized → show "Service unavailable"
  - [ ] Invalid edge ID → no crash, show "Unknown edge"
- [ ] No uncaught exceptions

---

## Documentation Requirements

### D1: Code Comments
- [ ] DebugService has JSDoc comments on public methods
- [ ] DebugTap interface has comments explaining contract
- [ ] Complex logic has inline comments (e.g., slot resolution)

### D2: Sprint Artifacts
- [ ] PLAN.md completed (this file's companion)
- [ ] CONTEXT.md completed (architectural decisions)
- [ ] This DOD.md reviewed and updated

---

## Acceptance Criteria (End-User Perspective)

### AC1: Basic Probe Workflow
**Given** a patch with at least one edge
**When** user hovers over an edge
**Then**:
- [ ] A panel appears in the bottom-right corner
- [ ] Panel shows the edge name (from/to blocks)
- [ ] Panel shows a numeric value
- [ ] Value updates approximately once per second
- [ ] Value matches expected runtime state (manually verified)

### AC2: Panel Toggle
**Given** the debug panel is visible
**When** user clicks the toggle button
**Then**:
- [ ] Panel disappears
- [ ] Edge hover no longer shows panel
- [ ] Clicking toggle again re-enables panel

### AC3: Multi-Edge Hover
**Given** multiple edges in the patch
**When** user hovers edge A, then edge B, then edge A again
**Then**:
- [ ] Panel updates to show edge A's value
- [ ] Panel updates to show edge B's value
- [ ] Panel updates back to edge A's value
- [ ] No stale data from previous edge

---

## Regression Prevention

### R1: Existing Features Unaffected
- [ ] Patch compilation still works (no breakage)
- [ ] Runtime execution still works (no performance degradation)
- [ ] ReactFlow editor still functional (pan, zoom, node drag)
- [ ] Edge context menu still works (right-click)
- [ ] All existing tests still pass

### R2: Backward Compatibility
- [ ] System works with `tap = undefined` (optional feature)
- [ ] No breaking changes to RuntimeState interface (field is optional)
- [ ] No breaking changes to compilation output (DebugGraph not required yet)

---

## Known Limitations (Acceptable for Sprint 1)

**Documented limitations** (not DoD failures):
- Only displays raw numbers (type-specific renderers added in Sprint 3)
- No popover positioning (fixed bottom-right panel, popover in Sprint 3)
- No trace view (shows only current value, ring buffers added in Sprint 2)
- Only works for edges with direct slot mappings (full topology added in Sprint 2)
- Edge-to-slot map is minimal (full DebugGraph topology added in Sprint 2)
- No support for Field/Shape types (only numeric scalars, all types in Sprint 2)

These are **intentional scope limits** for Sprint 1. Foundation is correct, Sprint 2 and 3 extend it.

---

## Sign-off Checklist

Before marking sprint DONE:
- [ ] All checkboxes in sections F1-F4 checked
- [ ] All checkboxes in sections T1-T4 checked
- [ ] All checkboxes in sections P1-P2 checked
- [ ] All checkboxes in sections Q1-Q3 checked
- [ ] All checkboxes in sections AC1-AC3 verified by manual testing
- [ ] All checkboxes in sections R1-R2 verified
- [ ] Sprint retrospective completed (what went well, what didn't)
- [ ] CONTEXT.md updated with learnings and decisions

---

**DEFINITION OF DONE ENDS HERE**

---

## Verification Protocol

**Who**: Developer implementing sprint
**When**: Before marking sprint COMPLETE
**How**:

1. Run automated tests: `npm run test && npm run typecheck`
2. Start dev server: `npm run dev`
3. Load test patch with 5+ edges
4. Enable debug panel toggle
5. Hover each edge, verify:
   - Panel shows correct edge name
   - Value displays and updates
   - No console errors
6. Disable panel toggle, verify panel hidden
7. Re-enable, verify still works
8. Check performance: Run 1000 frames, ensure stable 60fps
9. Review code: All new files have proper types, no TODOs left
10. Sign off in PLAN.md

**Evidence**: Screenshots of panel in action, test output logs, performance benchmark results

---

**END OF DEFINITION OF DONE**
