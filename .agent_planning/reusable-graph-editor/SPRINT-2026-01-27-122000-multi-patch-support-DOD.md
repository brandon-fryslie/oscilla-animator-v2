# Definition of Done: multi-patch-support

**Generated:** 2026-01-27-122000
**Updated:** 2026-01-27 (user decisions incorporated)
**Status:** READY FOR IMPLEMENTATION
**Plan:** SPRINT-2026-01-27-122000-multi-patch-support-PLAN.md

## User Decisions Summary

- **Tabs:** Center panel group, named "Patch - X" and "Edit Block - X"
- **Multiple:** Can have multiple patch tabs AND multiple composite editor tabs
- **Runtime:** Design API now, implement multi-runtime later

## Acceptance Criteria

### P0: Dynamic Tab System for Center Panel

- [ ] Dockview `api.addPanel()` integration for dynamic tabs
- [ ] New patch opens as "Patch - \<name\>" tab in center group
- [ ] New composite editor opens as "Edit Block - \<name\>" tab in center group
- [ ] Multiple "Patch" tabs can be open simultaneously
- [ ] Multiple "Edit Block" tabs can be open simultaneously
- [ ] Closing tab removes panel from Dockview
- [ ] Dirty state indicator shown on tab
- [ ] Close confirmation dialog when dirty
- [ ] Switching tabs updates active patch/editor in registry

### P0: PatchRegistry Implementation

- [ ] `PatchRegistry` class exists at `src/stores/PatchRegistry.ts`
- [ ] `createPatch(name?)` creates new patch, returns ID
- [ ] `openPatch(id, data)` opens existing patch data
- [ ] `closePatch(id)` closes patch with dirty check
- [ ] `getStore(id)` returns PatchStore for ID
- [ ] `activePatchId` is observable
- [ ] `openPatches` map is observable
- [ ] `activePatch` computed property works correctly
- [ ] RootStore integration complete
- [ ] Unit tests pass

### P0: CompositeEditorRegistry Implementation

- [ ] `CompositeEditorRegistry` class exists at `src/stores/CompositeEditorRegistry.ts`
- [ ] `openComposite(type)` opens existing composite for editing, returns editor ID
- [ ] `createNew()` creates new blank composite editor
- [ ] `closeEditor(id)` closes editor with dirty check
- [ ] `getEditor(id)` returns CompositeEditorStore for ID
- [ ] Multiple editors have fully independent state
- [ ] Observable properties trigger UI updates
- [ ] Unit tests pass

### P1: Runtime API Design Document

- [ ] Document exists at `.agent_planning/reusable-graph-editor/RUNTIME-API-DESIGN.md`
- [ ] `RuntimeHandle` interface defined (start, stop, pause, getState)
- [ ] Editor → Runtime request flow documented
- [ ] Canvas allocation strategy documented (one per runtime? shared?)
- [ ] Input routing strategy documented (focus-based?)
- [ ] Breaking changes to current RuntimeStore identified
- [ ] Open questions listed for future multi-runtime sprint

## Exit Criteria

Sprint is complete when:
1. All P0 acceptance criteria pass
2. Can open 2+ patches as separate tabs in center panel
3. Can open 2+ composite editors as separate tabs in center panel
4. Tab titles correctly show patch/composite name
5. Switching tabs switches the active editing context
6. Closing tabs works with dirty confirmation
7. Runtime API design document exists and is reviewed

## Test Plan

### Manual Tests
- [ ] Create new patch → opens as "Patch - Untitled 1" tab
- [ ] Create second patch → both tabs visible, can switch between
- [ ] Rename patch → tab title updates to "Patch - NewName"
- [ ] Close patch with unsaved changes → confirm dialog appears
- [ ] Edit library composite → opens as "Edit Block - SmoothNoise" tab
- [ ] Edit user composite → opens as "Edit Block - MyComposite" tab
- [ ] Have 2+ composite editor tabs open simultaneously
- [ ] Save composite → tab dirty indicator clears

### Unit Tests
- [ ] PatchRegistry.createPatch() returns valid ID and creates store
- [ ] PatchRegistry.closePatch() removes from openPatches map
- [ ] PatchRegistry.activePatch computed returns correct store
- [ ] CompositeEditorRegistry parallel tests
- [ ] Dirty state tracking in both registries

## Dependencies

- **Sprint adapter-interface:** MUST be complete first
- **Sprint unified-editor-core:** MUST be complete first

## Non-Goals (Deferred)

- Actual multi-runtime implementation (separate future sprint)
- Patch persistence to localStorage/file
- Undo/redo stack per patch
- Keyboard shortcuts (Cmd+W, Cmd+1-9)
