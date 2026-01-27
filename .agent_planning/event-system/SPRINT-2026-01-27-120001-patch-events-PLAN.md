# Sprint: patch-events - Wire PatchStore Event Emission
Generated: 2026-01-27T12:00:01Z
Confidence: HIGH: 4, MEDIUM: 1, LOW: 0
Status: PARTIALLY READY

## Sprint Goal
Wire PatchStore to emit fine-grained patch mutation events. These are the MOST USEFUL events per user feedback.

**Priority events:**
- `blockAdded` - When added from library or any other way
- `blockRemoved` - When deleted from patch
- `blockUpdated` - When connected, param changed, default source value changed, or any patch-relevant property changed

## Scope
**Deliverables:**
- PatchStore emits events for all mutations
- Cascading event rules enforced
- At least one existing use case migrated per event type

## Work Items

### P0: Emit blockAdded event [HIGH]
**Acceptance Criteria:**
- [ ] Drag from library → `BlockAdded` with blockId
- [ ] Paste/duplicate → `BlockAdded` with blockId
- [ ] Any other block creation → `BlockAdded` with blockId
- [ ] Events fire AFTER mutation is complete (post-mutation semantics)
- [ ] **Migrate one use case:** DiagnosticHub re-runs authoring validators on new block

**Technical Notes:**
- Find all block creation paths in PatchStore
- Emit event after MobX action completes

### P1: Emit blockRemoved event [HIGH]
**Acceptance Criteria:**
- [ ] Delete block → `BlockRemoved` with blockId
- [ ] Undo add → `BlockRemoved` with blockId (if undo is implemented)
- [ ] **Migrate one use case:** SelectionStore clears selection if removed block was selected

**Technical Notes:**
- Find block deletion paths in PatchStore
- Handle cascade: removing block should also emit edge events

### P2: Emit blockUpdated event [HIGH]
**Acceptance Criteria:**
- [ ] Connect wire to block → `BlockUpdated` with blockId
- [ ] Disconnect wire → `BlockUpdated` with blockId
- [ ] Change param value → `BlockUpdated` with blockId
- [ ] Change default source value → `BlockUpdated` with blockId
- [ ] Change display name → `BlockUpdated` with blockId
- [ ] Change any patch-relevant property → `BlockUpdated` with blockId
- [ ] **Migrate one use case:** Auto-recompile triggers on blockUpdated

**Technical Notes:**
- This consolidates the spec's blockChanged with connection changes
- May replace or supplement existing ParamChangedEvent

### P3: Emit edge events (optional) [HIGH]
**Acceptance Criteria:**
- [ ] `addEdge()` emits `EdgeAdded` with edgeId
- [ ] `removeEdge()` emits `EdgeRemoved` with edgeId
- [ ] **Migrate one use case:** Graph visualization updates on edge events

**Technical Notes:**
- Edge events are useful for graph visualization
- Can cascade from block operations

### P4: Implement patchReset event [MEDIUM]
**Acceptance Criteria:**
- [ ] New file load emits `PatchReset`
- [ ] Import/paste entire patch emits `PatchReset`
- [ ] **Migrate one use case:** Clear transient state, reset UI

#### Unknowns to Resolve
- Where is "new file" / "load file" triggered?

#### Exit Criteria
- Locate file operations code
- Confidence → HIGH

## Dependencies
- Sprint 1 (event-types) must be complete
- Need EventHub available in PatchStore

## Risks
- High event volume on bulk operations (mitigate: consider batching flag)
- Cascade complexity (mitigate: follow spec cascade rules)
