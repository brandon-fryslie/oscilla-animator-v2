# Sprint: runtime-inspector - Runtime Value Inspector

**Generated**: 2026-01-20
**Confidence**: HIGH
**Status**: READY FOR IMPLEMENTATION

---

## Sprint Goal

Deliver a Runtime Value Inspector panel that displays live slot values, instance counts, and buffer statistics at 5 Hz, enabling developers to debug runtime state directly.

---

## Scope

**Deliverables**:
1. Extended DebugService with slot/instance query API
2. RuntimeInspector panel with slot table and instance list
3. Buffer inspection (stats + expandable values)
4. Real-time updates at ~5 Hz with pause/resume

**Out of Scope** (deferred to future sprints):
- History/timeline ring buffers
- Per-element inspection for stable-identity instances
- Histogram visualization for buffers
- Search/filter by slot name

---

## Work Items

### P0: Extend DebugService with Slot Query API

**Description**: Add methods to query slot values directly by slot ID, independent of edge mapping.

**Acceptance Criteria**:
- [ ] `setRuntimeRefs(program, state)` method stores references needed for queries
- [ ] `getSlot(slot): SlotValue | undefined` returns current value + metadata
- [ ] `getAllSlots(): SlotValue[]` returns all slots with values and metadata
- [ ] `getBuffer(slot): BufferInfo | undefined` returns buffer stats (length, min, max, mean, first 10 values)
- [ ] Existing edge-based API continues to work unchanged

**Technical Notes**:
- SlotValue: `{ slot, value, type, storage, debugName? }`
- BufferInfo: `{ slot, length, min, max, mean, values: number[] (first 10) }`
- Use `program.slotMeta` for metadata, `state.values.f64` / `state.values.objects` for values
- Guard against null references (program/state may not be set yet)

**Files**:
- `src/services/DebugService.ts` (modify)

---

### P1: Extend DebugService with Instance Query API

**Description**: Add methods to query instance information from the schedule.

**Acceptance Criteria**:
- [ ] `setScheduleRef(schedule)` method stores schedule reference
- [ ] `getInstanceInfo(instanceId): InstanceInfo | undefined` returns instance details
- [ ] `getAllInstances(): InstanceInfo[]` returns all instances with counts

**Technical Notes**:
- InstanceInfo: `{ instanceId, domainType, count, identityMode, layout? }`
- Use `schedule.instances: Map<InstanceId, InstanceDecl>`
- Count may be static number or dynamic (SigExprId) - resolve at query time

**Files**:
- `src/services/DebugService.ts` (modify)

---

### P2: Implement RuntimeInspector Panel Registration

**Description**: Create panel wrapper and register in Dockview.

**Acceptance Criteria**:
- [ ] `RuntimeInspectorPanel.tsx` wrapper component created
- [ ] Panel registered in `panelRegistry.ts` with id `'runtime-inspector'`
- [ ] Panel assigned to `'bottom-right'` group
- [ ] Panel title: "Runtime Inspector"

**Technical Notes**:
- Follow ContinuityPanel pattern for wrapper structure
- IDockviewPanelProps typing for props

**Files**:
- `src/ui/dockview/panels/RuntimeInspectorPanel.tsx` (new)
- `src/ui/dockview/panelRegistry.ts` (modify)

---

### P3: Implement RuntimeInspector Main Component

**Description**: Create the main inspector UI with slot table and instance list.

**Acceptance Criteria**:
- [ ] Displays collapsible "Slots" section with all slots
- [ ] Slot rows show: slot ID, debug name (if any), type, storage class, current value
- [ ] Displays collapsible "Instances" section with all instances
- [ ] Instance rows show: instance ID, domain type, count, identity mode
- [ ] Uses monospace font for values
- [ ] Follows existing panel styling patterns (dark theme, colors from theme.ts)

**Technical Notes**:
- Use `@observer` MobX pattern for reactivity
- Access DebugService via import (singleton)
- Component state for section collapse
- Sort slots by slot ID for stability

**Files**:
- `src/ui/components/app/RuntimeInspector.tsx` (new)

---

### P4: Implement Real-time Updates (5 Hz)

**Description**: Add automatic refresh with pause/resume toggle.

**Acceptance Criteria**:
- [ ] Slot/instance values refresh at ~5 Hz (200ms interval)
- [ ] Pause/Resume button in panel header
- [ ] When paused, shows "Paused" indicator
- [ ] Resume restarts the update loop
- [ ] Update loop cleans up on unmount

**Technical Notes**:
- Use `useEffect` with `setInterval` for update loop
- Store paused state in component
- Consider using requestAnimationFrame throttled to 5 Hz for better frame alignment
- Show frame count or timestamp to indicate freshness

**Files**:
- `src/ui/components/app/RuntimeInspector.tsx` (modify)

---

### P5: Implement Buffer Expansion

**Description**: Allow clicking on buffer slots to see detailed values.

**Acceptance Criteria**:
- [ ] Buffer slots show stats by default: `[length] min..max (mean)`
- [ ] Click "Show values" button to expand
- [ ] Expanded view shows first 10 values in a compact list
- [ ] Click again to collapse
- [ ] Large buffers (>1000) show warning about truncation

**Technical Notes**:
- Buffer detection: check `storage === 'object'` and value is ArrayBufferView
- Use collapsible row expansion pattern
- Format numbers to 3 decimal places for readability

**Files**:
- `src/ui/components/app/RuntimeInspector.tsx` (modify)

---

### P6: Wire Up Compiler/Runtime to DebugService

**Description**: Ensure DebugService receives references when compilation completes.

**Acceptance Criteria**:
- [ ] After successful compilation, `debugService.setRuntimeRefs(program, state)` is called
- [ ] After schedule creation, `debugService.setScheduleRef(schedule)` is called
- [ ] On recompilation, references are updated
- [ ] On patch unload, `debugService.clear()` resets all state

**Technical Notes**:
- Find existing compilation hook (where `setEdgeToSlotMap` is called)
- Add new calls alongside existing integration
- Ensure order: slotMap → runtimeRefs → scheduleRef

**Files**:
- `src/main.ts` or compilation integration file (identify and modify)

---

## Dependencies

- **DebugService** (exists) - Will be extended
- **DebugTap** (exists) - No changes needed for MVP (read from state directly)
- **Dockview panel system** (exists) - Will use for registration
- **CompiledProgramIR.slotMeta** (exists) - Source of slot metadata
- **RuntimeState** (exists) - Source of live values
- **Schedule** (exists) - Source of instance information

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| State references null during initialization | Medium | Low | Guard all queries with null checks, show "No runtime" message |
| 5 Hz updates cause UI jank | Low | Medium | Use requestAnimationFrame, batch state reads |
| Large buffer inspection causes memory pressure | Low | Low | Only read first 10 values, don't copy entire buffer |

---

## Testing Strategy

1. **Unit Tests** (DebugService):
   - Mock program with slotMeta, verify `getSlot` returns correct values
   - Mock state with values.f64, verify value retrieval
   - Test buffer stats calculation

2. **Component Tests** (RuntimeInspector):
   - Snapshot tests for slot table rendering
   - Test pause/resume toggle behavior

3. **Integration Test**:
   - Compile a simple patch → execute one frame → verify inspector shows correct slot values

---

## Implementation Order

1. P0: DebugService slot query API (foundation)
2. P1: DebugService instance query API
3. P6: Wire up compiler/runtime integration
4. P2: Panel registration
5. P3: Main component (static rendering first)
6. P4: Real-time updates
7. P5: Buffer expansion

This order ensures each step builds on verified foundations.
