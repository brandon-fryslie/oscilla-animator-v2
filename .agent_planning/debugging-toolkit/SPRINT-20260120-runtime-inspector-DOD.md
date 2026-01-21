# Definition of Done: Runtime Value Inspector

**Sprint**: runtime-inspector
**Generated**: 2026-01-20

---

## Acceptance Criteria Checklist

### Service Layer

- [ ] **DebugService.setRuntimeRefs()** stores program and state references
- [ ] **DebugService.setScheduleRef()** stores schedule reference
- [ ] **DebugService.getSlot(slot)** returns `SlotValue | undefined`
- [ ] **DebugService.getAllSlots()** returns `SlotValue[]` sorted by slot ID
- [ ] **DebugService.getBuffer(slot)** returns `BufferInfo | undefined` with stats
- [ ] **DebugService.getInstanceInfo(id)** returns `InstanceInfo | undefined`
- [ ] **DebugService.getAllInstances()** returns `InstanceInfo[]`
- [ ] All new methods handle null refs gracefully (return empty/undefined)
- [ ] Existing `getEdgeValue()` API still works

### UI Layer

- [ ] **RuntimeInspectorPanel.tsx** wrapper exists and renders
- [ ] Panel registered in **panelRegistry.ts** with correct id and group
- [ ] Panel appears in Dockview layout in **bottom-right** group
- [ ] Panel title shows "Runtime Inspector"

### RuntimeInspector Component

- [ ] Displays "Slots" section with all numeric slots
- [ ] Each slot row shows: slot ID, debug name, type, storage, value
- [ ] Displays "Instances" section with all instances
- [ ] Each instance row shows: ID, domain type, count, identity mode
- [ ] Sections are collapsible
- [ ] Uses monospace font for numeric values
- [ ] Styling matches existing panel conventions (dark theme)

### Real-time Updates

- [ ] Values refresh at ~5 Hz (every ~200ms)
- [ ] Pause/Resume button is visible in panel header
- [ ] Clicking Pause stops updates and shows "Paused" indicator
- [ ] Clicking Resume restarts updates
- [ ] Update loop stops on component unmount (no memory leak)

### Buffer Inspection

- [ ] Buffer slots show stats: `[length] min..max (mean)`
- [ ] "Show values" button expands to show first 10 values
- [ ] Expanded view can be collapsed
- [ ] Large buffers (>1000 elements) show truncation notice

### Integration

- [ ] Compilation success triggers `setRuntimeRefs()` and `setScheduleRef()`
- [ ] Recompilation updates references
- [ ] Patch unload calls `debugService.clear()`

---

## Test Coverage Requirements

### Unit Tests (Required)

- [ ] `DebugService.getSlot()` returns correct value from mock state
- [ ] `DebugService.getAllSlots()` returns all slots sorted
- [ ] `DebugService.getBuffer()` calculates min/max/mean correctly
- [ ] `DebugService.getInstanceInfo()` returns correct instance data
- [ ] All methods return undefined/empty when refs not set

### Component Tests (Required)

- [ ] RuntimeInspector renders slot table with mock data
- [ ] RuntimeInspector renders instance list with mock data
- [ ] Pause/resume toggle updates UI state

### Integration Tests (Recommended)

- [ ] Compile patch → execute frame → inspector shows slot values
- [ ] Hot-swap recompilation → inspector shows updated slots

---

## Performance Requirements

- [ ] UI does not visibly lag during 5 Hz updates
- [ ] No console errors or warnings during normal operation
- [ ] Buffer inspection does not copy entire buffer (reads in-place)

---

## Documentation Requirements

- [ ] `SlotValue` interface documented with JSDoc
- [ ] `BufferInfo` interface documented with JSDoc
- [ ] `InstanceInfo` interface documented with JSDoc
- [ ] New DebugService methods have JSDoc comments

---

## Non-Functional Requirements

- [ ] No TypeScript errors (`npm run typecheck` passes)
- [ ] No new ESLint errors/warnings
- [ ] Code follows existing project conventions

---

## Exit Criteria

Sprint is complete when:

1. All acceptance criteria checkboxes are marked
2. Unit tests pass
3. Manual verification: open patch, see slots update live, pause works, buffers expand
4. No console errors during operation

---

## Verification Procedure

1. Run `npm run build` - should succeed
2. Run `npm run test` - all tests pass
3. Start dev server: `npm run dev`
4. Load any patch that compiles
5. Open Runtime Inspector panel (View menu or panel button)
6. Verify slots appear with values
7. Verify values update (~5 times per second)
8. Click Pause - verify updates stop
9. Click Resume - verify updates resume
10. Find a buffer slot (if any) - click to expand, verify values shown
11. Check Instances section - verify instance counts

**Done when all 11 verification steps pass.**
