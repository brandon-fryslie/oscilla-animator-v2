# Sprint: multi-patch-support - Multiple Simultaneous Patches

**Generated:** 2026-01-27-122000
**Updated:** 2026-01-27 (user decisions captured)
**Confidence:** HIGH: 3, MEDIUM: 1, LOW: 0
**Status:** READY FOR IMPLEMENTATION

## User Decisions (2026-01-27)

These decisions resolve the previous unknowns:

1. **Tab model:** Tabs in the center Dockview panel group
   - Patch tabs: "Patch - \<patch name\>"
   - Composite editor tabs: "Edit Block - \<composite block name\>"
   - Both tab types coexist in the same tab group (with Table, Matrix)

2. **Multiple tabs:** Can have multiple patch tabs AND multiple composite editor tabs open simultaneously

3. **Runtime:** Multiple runtimes will be supported
   - **For this sprint:** Design the Patch Editor ↔ Runtime API
   - **Deferred:** Actual multi-runtime implementation (separate initiative)

## Sprint Goal

Enable opening and editing multiple patches/composites simultaneously via Dockview dynamic tabs, with a well-designed API that will support multiple runtimes in the future.

## Scope

**Deliverables:**
- Dynamic tab creation in center panel group
- Tab naming convention ("Patch - X", "Edit Block - X")
- PatchRegistry for managing multiple patch instances
- Runtime API design document (for future multi-runtime)
- Patch lifecycle management (create, open, close)

## Work Items

### P0 [HIGH] Dynamic Tab System for Center Panel

**Dependencies:** Sprint unified-editor-core complete
**Spec Reference:** Dockview panel system

#### Description

Extend Dockview integration to support dynamic tab creation. Currently tabs are static (Flow, Table, Matrix, Composite). Need to:
- Create tabs dynamically when opening a patch/composite
- Close tabs when done editing
- Handle multiple instances of same panel type with different data

#### Acceptance Criteria

- [ ] Can programmatically add a new tab to center panel group
- [ ] Tabs show correct title ("Patch - MyPatch" or "Edit Block - SmoothNoise")
- [ ] Can have multiple "Patch" tabs open simultaneously
- [ ] Can have multiple "Edit Block" tabs open simultaneously
- [ ] Closing a tab removes it from the panel group
- [ ] Tab close button with dirty state confirmation
- [ ] Active tab selection reflects which patch/composite is being edited

#### Technical Notes

Dockview supports dynamic panels via `api.addPanel()`. Each panel needs:
- Unique ID (e.g., `patch-${patchId}`, `composite-${compositeType}`)
- Component reference (reusable GraphEditorCore)
- Props including the adapter instance

---

### P0 [HIGH] PatchRegistry Implementation

**Dependencies:** None (can start immediately)
**Spec Reference:** PatchStore as single source of truth (CLAUDE.md)

#### Description

Create a registry that manages multiple patch instances. PatchStore becomes "one patch's state" while PatchRegistry manages "all open patches".

#### Acceptance Criteria

- [ ] `PatchRegistry` class in `src/stores/PatchRegistry.ts`
- [ ] `createPatch(name?: string): string` - creates new patch, returns ID
- [ ] `openPatch(id: string, data: PatchData): void` - opens existing patch
- [ ] `closePatch(id: string): boolean` - closes patch (returns false if dirty and user cancels)
- [ ] `getStore(id: string): PatchStore | null` - gets store for a patch
- [ ] Observable `activePatchId: string | null`
- [ ] Observable `openPatches: ReadonlyMap<string, PatchStore>`
- [ ] Computed `activePatch: PatchStore | null`
- [ ] Integrates with RootStore
- [ ] Unit tests for CRUD operations

#### Technical Notes

```typescript
class PatchRegistry {
  readonly openPatches = observable.map<string, PatchStore>();
  activePatchId: string | null = null;

  get activePatch(): PatchStore | null {
    return this.activePatchId ? this.openPatches.get(this.activePatchId) ?? null : null;
  }

  createPatch(name?: string): string {
    const id = generateId();
    const store = new PatchStore(id, name ?? `Untitled ${this.openPatches.size + 1}`);
    this.openPatches.set(id, store);
    this.activePatchId = id;
    return id;
  }
  // ...
}
```

---

### P0 [HIGH] CompositeEditorRegistry Implementation

**Dependencies:** CompositeEditorStore exists
**Spec Reference:** CompositeEditorStore

#### Description

Similar to PatchRegistry, but for composite editors. Multiple composites can be edited simultaneously.

#### Acceptance Criteria

- [ ] `CompositeEditorRegistry` class in `src/stores/CompositeEditorRegistry.ts`
- [ ] `openComposite(type: string): string` - opens composite for editing, returns editor ID
- [ ] `closeEditor(id: string): boolean` - closes editor
- [ ] `getEditor(id: string): CompositeEditorStore | null`
- [ ] Observable `activeEditorId: string | null`
- [ ] Observable `openEditors: ReadonlyMap<string, CompositeEditorStore>`
- [ ] Each editor has independent state (blocks, edges, metadata)
- [ ] Unit tests

---

### P1 [MEDIUM] Runtime API Design Document

**Dependencies:** None (design work)
**Spec Reference:** Runtime architecture, RuntimeState, ScheduleExecutor

#### Description

Design the API contract between Patch Editor and Runtime that will support multiple runtimes in the future. This is **design only** - implementation is deferred.

The goal is to ensure our editor refactoring doesn't create assumptions that would block multi-runtime later.

#### Acceptance Criteria

- [ ] Design document at `.agent_planning/reusable-graph-editor/RUNTIME-API-DESIGN.md`
- [ ] Defines `RuntimeHandle` interface (start, stop, pause, getState, etc.)
- [ ] Defines how editor requests runtime for a specific patch
- [ ] Defines canvas allocation strategy (one per runtime? shared?)
- [ ] Defines input routing (how mouse events reach correct runtime)
- [ ] Identifies breaking changes needed in current RuntimeStore
- [ ] Lists open questions for future multi-runtime sprint

#### Technical Notes

Key design questions to address:
1. Should RuntimeStore become RuntimeRegistry?
2. How does preview canvas work with multiple runtimes?
3. Can we have multiple canvases, or render-on-demand to single canvas?
4. ExternalChannel (mouse) - focus-based routing?

**This sprint produces the design document. Implementation is a separate future sprint.**

---

## Dependencies

- **Sprint adapter-interface:** Must complete first (defines how editor talks to data)
- **Sprint unified-editor-core:** Must complete first (provides reusable editor component)

## Risks

- **Risk:** Dockview dynamic panel complexity
  - **Mitigation:** Spike/prototype tab creation early

- **Risk:** Store reference updates when switching active patch
  - **Mitigation:** Use registry.activePatch computed property everywhere

## Non-Goals (Deferred)

- Actual multi-runtime implementation (separate sprint after API design)
- Patch persistence/serialization changes
- Undo/redo across patches
