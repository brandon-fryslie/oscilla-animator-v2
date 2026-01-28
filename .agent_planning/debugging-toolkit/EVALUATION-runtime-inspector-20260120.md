# Evaluation: Runtime Value Inspector

**Topic**: Runtime Value Inspector
**Evaluation Date**: 2026-01-20
**Directory**: `.agent_planning/debugging-toolkit/`

---

## EXECUTIVE SUMMARY

**Verdict: CONTINUE** ✅

The Runtime Value Inspector is implementation-ready with HIGH confidence. Key findings:

1. **Foundation exists**: DebugTap interface and DebugService are already in place (Sprint 1 complete)
2. **Architecture is clean**: RuntimeState structure is well-defined with slot metadata, typed storage, and instance tracking
3. **UI patterns established**: Dockview panel system is proven with clear registration patterns
4. **Read-only feature**: No write-back complexity, inspector is purely observational
5. **Spec alignment**: Feature complements the observation system spec (topic 08) at a lower level

**Recommended approach**: Extend existing DebugService with slot query API, create new RuntimeInspector panel following established patterns.

---

## SECTION 1: EXISTING INFRASTRUCTURE

### Debug Services (Sprint 1 Complete)

**DebugService** (`src/services/DebugService.ts`):
- Singleton service for runtime value observation
- Current API: `setEdgeToSlotMap()`, `updateSlotValue()`, `getEdgeValue()`
- Stores edge-to-slot mapping (set by compiler)
- Stores latest slot values (updated by runtime tap)
- **Limitation**: Only edge-based queries, no direct slot inspection

**DebugTap** (`src/runtime/DebugTap.ts`):
- Injectable interface in RuntimeState
- Current method: `recordSlotValue?(slotId, value)`
- Called by ScheduleExecutor after each slot write (line 129)
- Design: One-way dependency (runtime → tap)
- **Ready**: Can be extended for buffer/object notifications

### Runtime Architecture

**RuntimeState** (`src/runtime/RuntimeState.ts`):
- `values.f64: Float64Array` - numeric slot storage
- `values.objects: Map<ValueSlot, unknown>` - buffers, arrays, objects
- `state: Float64Array` - persistent state slots
- `continuity: ContinuityState` - element identity tracking
- `tap?: DebugTap` - optional instrumentation hook

**SlotMetaEntry** (in CompiledProgramIR):
```typescript
interface SlotMetaEntry {
  slot: ValueSlot;
  storage: 'f64' | 'f32' | 'i32' | 'u32' | 'object';
  offset: number;
  type: CanonicalType;
  debugName?: string;
}
```

**InstanceDecl** (in Schedule):
- `instanceId`, `count`, `domainType`, `identityMode`, `layout`

### UI Infrastructure

**Panel Registration** (`src/ui/dockview/panelRegistry.ts`):
- `PANEL_DEFINITIONS`: Array with id, component, title, group
- `PANEL_COMPONENTS`: Map of component references
- Groups: 'left-top', 'left-bottom', 'center', 'right-top', 'right-bottom', 'bottom-left', 'bottom-right'

**Pattern Example** (ContinuityPanel):
- Wrapper: thin delegation in `dockview/panels/`
- Component: `@observer` MobX pattern in `components/app/`
- Access: `rootStore.continuity` for state

---

## SECTION 2: WHAT'S MISSING

### Service Layer

1. **Slot Query API in DebugService**:
   - `getSlot(slot: ValueSlot): SlotValue | undefined`
   - `getAllSlots(): SlotValue[]`
   - `getSlotMetadata(slot: ValueSlot): SlotMetaEntry`

2. **Instance Query API**:
   - `getInstanceInfo(instanceId: InstanceId): InstanceInfo`
   - `getAllInstances(): InstanceInfo[]`

3. **Buffer Inspection**:
   - `getBuffer(slot: ValueSlot): BufferInfo | undefined`

4. **Reference Holders**:
   - DebugService needs references to: `program.slotMeta`, `state.values`, `schedule.instances`

### UI Layer

1. **RuntimeInspectorPanel** (dockview wrapper)
2. **RuntimeInspector** component (main view)
3. **SlotTable** subcomponent (sortable/filterable)
4. **BufferVisualizer** subcomponent (array display)
5. **InstanceList** subcomponent (instance counts)

### Store Layer

- Optional: `DebugInspectorStore` if we need UI state separate from DebugService

---

## SECTION 3: DEPENDENCIES

### Safe Dependencies (No Risk)

| Dependency | Status | Notes |
|------------|--------|-------|
| RuntimeState | ✅ Ready | Full visibility, stable API |
| CompiledProgramIR | ✅ Ready | slotMeta available |
| DebugTap | ✅ Ready | Already integrated |
| Dockview | ✅ Ready | Patterns established |
| MobX/React | ✅ Ready | Standard dependencies |

### What Depends on Inspector

- **Nothing** - Inspector is terminal (read-only, no feedback loops)
- Can be added/removed without affecting runtime

---

## SECTION 4: AMBIGUITIES

### Questions Needing User Input

1. **Update Strategy**:
   - On-demand only (user clicks refresh)?
   - Real-time (update each frame)?
   - Throttled (10-15 Hz per spec)?

2. **Buffer Detail Level**:
   - Show first N values? (e.g., first 10)
   - Show statistics? (min, max, mean, length)
   - Show histogram visualization?
   - Threshold for "large buffer" handling?

3. **Panel Placement**:
   - Which Dockview group? (suggest 'right-bottom' or 'bottom-right')

4. **Slot Naming**:
   - Use `debugName` if present, else "Slot {id}"?
   - Group related slots (e.g., field components)?

---

## SECTION 5: CONFIDENCE ASSESSMENT

| Aspect | Confidence | Rationale |
|--------|------------|-----------|
| Service API design | HIGH | Clear extension of existing DebugService |
| Runtime access | HIGH | All data structures documented and accessible |
| UI implementation | HIGH | Panel patterns well-established |
| Integration | HIGH | No architectural changes needed |
| Testing | HIGH | Can unit test with mock program/state |

**Overall: HIGH CONFIDENCE** - Ready for implementation planning.

---

## SECTION 6: RECOMMENDED SCOPE

### Phase 1 (MVP Sprint)
- Extend DebugService with slot/instance query API
- Create SlotTable component showing all slots with current values
- Create InstanceList showing instance counts
- Basic panel registration and integration
- On-demand refresh (button click)

### Phase 2 (Enhancement)
- Real-time updates via DebugTap
- Buffer detail view (click to expand)
- Search/filter by slot name or type
- Pause/resume toggle

### Phase 3 (Advanced)
- History/timeline ring buffers
- Statistics for buffers
- Per-element inspection for stable-identity instances

---

## SECTION 7: FILE PLAN

```
src/
  services/
    DebugService.ts          # EXTEND with slot query API
  ui/
    dockview/
      panels/
        RuntimeInspectorPanel.tsx   # NEW wrapper
      panelRegistry.ts              # MODIFY to register
    components/
      app/
        RuntimeInspector.tsx        # NEW main component
        RuntimeInspectorSlots.tsx   # NEW slot table
        RuntimeInspectorInstances.tsx  # NEW instance list
```

---

## RELATED SPEC DOCUMENTS

- `08-observation-system.md`: DebugGraph, DebugSnapshot, DebugTap spec
- `09-debug-ui-spec.md`: Probe mode, Trace view (higher-level than this feature)
- `05-runtime.md`: RuntimeState, slot storage model

---

**Verdict**: **CONTINUE** with HIGH confidence sprint planning.
