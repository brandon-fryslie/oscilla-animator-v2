# Implementation Context: multi-patch-support

**Generated:** 2026-01-27-122000
**Status:** RESEARCH REQUIRED
**Plan:** SPRINT-2026-01-27-122000-multi-patch-support-PLAN.md

## Research Needed Before Implementation

This sprint requires significant research before implementation can begin. The context below captures what we know and what needs investigation.

## Current Single-Patch Architecture

### RootStore Structure (src/stores/RootStore.ts - assumed)

Currently, stores are likely instantiated as singletons:
```typescript
class RootStore {
  patch: PatchStore;        // Single patch
  layout: LayoutStore;      // Single layout
  runtime: RuntimeStore;    // Single runtime
  compilation: CompilationStore;
  selection: SelectionStore;
  // ...
}
```

### PatchStore as Single Instance

From `src/stores/PatchStore.ts` (line 1-11):
```typescript
/**
 * PatchStore - THE Single Source of Truth
 *
 * This store is the ONLY place where blocks and edges are stored.
 * All other stores may reference IDs, but must derive block/edge data from here.
 */
```

This design assumes one patch. Multi-patch needs either:
1. Multiple PatchStore instances
2. PatchStore holding multiple patch datasets

## Potential Architecture Options

### Option A: Multiple Store Instances

```typescript
class PatchRegistry {
  private patches: Map<string, PatchStoreBundle> = new Map();

  createPatch(): string {
    const id = generateId();
    const bundle = {
      patch: new PatchStore(),
      layout: new LayoutStore(),
      runtime: new RuntimeStore(),
    };
    this.patches.set(id, bundle);
    return id;
  }
}
```

**Pros:** Clean isolation, existing code works per-instance
**Cons:** Memory overhead, need to wire up inter-store dependencies per instance

### Option B: Single Store, Multiple Datasets

```typescript
class PatchStore {
  private patches: Map<string, PatchData> = new Map();
  activePatchId: string | null = null;

  get patch(): ImmutablePatch {
    return this.patches.get(this.activePatchId) || emptyPatch;
  }
}
```

**Pros:** Less memory, simpler store injection
**Cons:** Major refactor, all code assumes `.patch` is the patch

## Files That Would Need Changes

### Definitely Need Changes

- `src/stores/RootStore.ts` - Add PatchRegistry or modify store creation
- `src/stores/PatchStore.ts` - Potentially multi-patch aware
- `src/stores/LayoutStore.ts` - Positions per patch
- `src/stores/SelectionStore.ts` - Selection per patch

### Likely Need Changes

- `src/stores/RuntimeStore.ts` - Runtime state per patch
- `src/stores/CompilationStore.ts` - Compiled IR per patch
- `src/runtime/` - State isolation concerns

### UI Changes

- `src/ui/dockview/` - Tab UI integration
- `src/ui/App.tsx` or layout component - Tab bar location

## Research Questions

### Q1: How do other editors handle multi-document?

**VS Code approach:**
- Each file has independent editor instance
- Tabs manage switching
- "Active editor" concept
- Monaco handles state per instance

**Figma approach:**
- Multiple tabs = multiple files
- One canvas, redraws on switch
- File state independent

**Blender approach:**
- One file, multiple "scenes"
- Scene selector, not tabs
- Single runtime, multiple data blocks

### Q2: What's the runtime isolation strategy?

Options:
1. **Hot-swap active patch**: One runtime, swap which patch it executes
2. **Multiple runtimes**: Each patch has own runtime, only active one animates
3. **Suspended runtimes**: Inactive patches pause, resume on switch

### Q3: Canvas and rendering considerations?

Current setup (from CLAUDE.md):
- Canvas2DRenderer
- Single canvas element
- RenderAssembler prepares ops from runtime state

Multi-patch options:
- Reuse canvas, clear and redraw on switch (simplest)
- Multiple canvases, show/hide (smoother switching)
- Off-screen render for thumbnails (nice-to-have)

## Dockview Integration Research

From `.agent_planning/_completed/dockview-integration/`:
- Dockview supports multiple panel instances
- Could each patch be a panel?
- Or tabs within a panel?

Dockview API to research:
- `addPanel()` with same component, different params
- Panel groups with tabs
- Panel lifecycle (close, reopen)

## Sketch: Minimal Viable Multi-Patch

Phase 1 (MVP):
1. PatchRegistry with Map<id, PatchStore>
2. `activePatchId` observable
3. UI uses `registry.activePatch` instead of `rootStore.patch`
4. Simple dropdown/tabs to switch
5. Single runtime, hot-swaps patch data

This gets core functionality without runtime isolation complexity.

Phase 2 (Enhanced):
1. Independent LayoutStore per patch
2. Compilation caching per patch
3. Proper tab UI with dirty indicators
4. Close/open persistence

Phase 3 (Full):
1. Runtime isolation research completed
2. Concurrent preview consideration
3. Performance optimization

## Dependencies and Blockers

- **Blocked by:** Need unified editor first (adapter pattern)
- **Research blocker:** Architecture decision required before coding
- **UI blocker:** Tab design needed before implementation
