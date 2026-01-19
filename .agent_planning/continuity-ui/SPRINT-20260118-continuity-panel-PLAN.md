# Sprint: continuity-panel - Continuity Inspector Panel

Generated: 2026-01-18
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Create a dedicated dockview panel showing continuity system state for debugging and verification.

## Scope

**Deliverables:**
1. ContinuityStore exposing runtime state to UI
2. ContinuityPanel dockview component
3. Real-time display of active targets, mapping stats, slew progress

## Work Items

### P0: Create ContinuityStore

**Acceptance Criteria:**
- [ ] MobX store with observable state
- [ ] Exposes: activeTargets, lastDomainChange, mappingStats
- [ ] Updated from runtime (batched to 5Hz)

**Technical Notes:**
- Create `src/stores/ContinuityStore.ts`
- Add to RootStore
- Update from main.ts animation loop

### P1: Create ContinuityPanel component

**Acceptance Criteria:**
- [ ] Shows list of active continuity targets
- [ ] Shows mapping stats per target (mapped/unmapped count)
- [ ] Shows slew progress (% complete) for each target
- [ ] Auto-refreshes at 5Hz

**Technical Notes:**
- Create `src/ui/dockview/panels/ContinuityPanel.tsx`
- Register in panelRegistry.ts
- Use observer() for MobX reactivity

### P2: Add to default layout

**Acceptance Criteria:**
- [ ] Panel appears in bottom panel area by default
- [ ] Can be closed and reopened via menu
- [ ] Tab title: "Continuity"

**Technical Notes:**
- Update `src/ui/dockview/defaultLayout.ts`
- Add to bottom panel group with LogPanel

## Dependencies

- DockView panel system (exists)
- RuntimeState.continuity (exists)
- RootStore (exists)

## Risks

| Risk | Mitigation |
|------|------------|
| UI performance | Batch updates to 5Hz |
| State synchronization | Use MobX reactions |
