# Sprint: multi-patch-support - Multiple Simultaneous Patches

**Generated:** 2026-01-27-122000
**Confidence:** HIGH: 0, MEDIUM: 2, LOW: 2
**Status:** RESEARCH REQUIRED
**Source:** EVALUATION-2026-01-27-120000.md

## Sprint Goal

Enable opening and editing multiple patches simultaneously, with tab-based switching and independent state management per patch.

## Scope

**Deliverables:**
- PatchRegistry for managing multiple patch instances
- Tab UI for switching between open patches
- Independent runtime/compilation per patch
- Patch lifecycle management (create, open, close, save)

## Work Items

### P1 [MEDIUM] Design Multi-Patch Architecture

**Dependencies:** Sprint unified-editor-core complete
**Spec Reference:** PatchStore as single source of truth (CLAUDE.md)
**Status Reference:** EVALUATION - "No Multi-Patch Support"

#### Description

Research and design how multiple patches will coexist. Key questions:
- Should each patch have its own PatchStore instance, or one store with multiple patches?
- How does runtime/compilation work with multiple patches?
- What is the "active patch" concept and how is it managed?
- How do stores that reference PatchStore (RuntimeStore, CompilationStore) handle multiple patches?

#### Unknowns to Resolve

1. **Store architecture**: One PatchStore per patch vs. one store managing all patches?
   - Research: Check how other node editors (Blender, Unreal Blueprints) handle this
   - Consider memory implications

2. **Runtime isolation**: Can multiple patches run simultaneously, or only one active?
   - Research: Runtime dependencies, canvas allocation
   - Consider use cases (preview while editing another?)

3. **Compilation caching**: How to avoid recompiling inactive patches?
   - Research: Hot swap requirements
   - Consider lazy compilation

#### Exit Criteria (to reach HIGH confidence)

- [ ] Architecture decision document written
- [ ] Store structure decided (single vs. multiple instances)
- [ ] Runtime behavior decided (concurrent vs. exclusive)
- [ ] API surface sketched for PatchRegistry

---

### P1 [MEDIUM] Implement PatchRegistry

**Dependencies:** Multi-patch architecture design complete
**Spec Reference:** N/A (new feature)
**Status Reference:** EVALUATION - "PatchStore is singleton"

#### Description

Create a registry that manages multiple patch instances. This becomes the new single source of truth for "all patches", with PatchStore becoming "one patch's state".

#### Acceptance Criteria

- [ ] `PatchRegistry` class in `src/stores/PatchRegistry.ts`
- [ ] Can create new patch (returns PatchStore or ID)
- [ ] Can open existing patch from storage
- [ ] Can close patch (with dirty check)
- [ ] Can switch active patch
- [ ] Observable `activePatch` property
- [ ] Observable `openPatches` collection
- [ ] Integrates with RootStore
- [ ] Unit tests for CRUD operations

#### Technical Notes

Possible shape:
```typescript
class PatchRegistry {
  readonly openPatches: ReadonlyMap<string, PatchStore>;
  activePatchId: string | null;

  get activePatch(): PatchStore | null;

  createPatch(): string; // Returns ID
  openPatch(id: string, data: PatchData): void;
  closePatch(id: string): void;
  setActivePatch(id: string): void;
}
```

---

### P2 [LOW] Tab UI for Patch Switching

**Dependencies:** PatchRegistry implemented
**Spec Reference:** Dockview integration (CLAUDE.md)
**Status Reference:** N/A (new feature)

#### Description

Add a tab bar or similar UI for switching between open patches. Integrate with Dockview panel system.

#### Unknowns to Resolve

1. **Tab location**: Above the graph editor? In a panel header? Separate panel?
   - Research: Dockview tab group features
   - Consider: Does this replace or augment existing panels?

2. **Dirty indicators**: How to show unsaved changes per patch?
   - Research: VS Code, Figma patterns
   - Consider: Auto-save implications

3. **Composite editor interaction**: When editing composite, is that a "patch" or separate?
   - Research: User mental model
   - Consider: Composite as embedded vs. separate tab

#### Exit Criteria (to reach MEDIUM confidence)

- [ ] UI mockup or wireframe created
- [ ] Dockview integration approach decided
- [ ] Tab component library chosen (MUI Tabs? Custom?)

---

### P2 [LOW] Runtime Per-Patch Isolation

**Dependencies:** PatchRegistry, Architecture design
**Spec Reference:** Runtime architecture (CLAUDE.md RuntimeState section)
**Status Reference:** EVALUATION - Risks section

#### Description

Ensure each patch can have independent runtime state. This may require RuntimeStore changes or a new RuntimeRegistry.

#### Unknowns to Resolve

1. **Canvas sharing**: Can multiple patches share a canvas, or need separate canvases?
   - Research: WebGL context limits, canvas element requirements
   - Consider: Split-screen editing use case

2. **Animation loop**: One loop with multiple patches, or independent loops?
   - Research: requestAnimationFrame patterns for multiple contexts
   - Consider: Performance implications

3. **External channels**: How do mouse/input events route to correct patch?
   - Research: Current ExternalChannel implementation
   - Consider: Focus-based routing

#### Exit Criteria (to reach MEDIUM confidence)

- [ ] Runtime isolation approach decided
- [ ] Canvas allocation strategy decided
- [ ] Input routing strategy decided

## Dependencies

- **Blocked by:** Sprint unified-editor-core (need reusable editor first)
- **Partially blocked by:** Architecture research (unknowns must be resolved)

## Risks

- **Risk:** Scope creep - multi-patch touches many systems
  - **Mitigation:** Strict phase boundaries; do architecture first

- **Risk:** Memory pressure with many open patches
  - **Mitigation:** Lazy loading, patch hibernation, limits

- **Risk:** Breaking existing single-patch workflows
  - **Mitigation:** Feature flag; single-patch remains default initially
