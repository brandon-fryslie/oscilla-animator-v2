# V1 UI Salvage Roadmap (MobX Architecture)

**Created**: 2026-01-09
**Source**: `/Users/bmf/code/oscilla-animator_codex.worktrees/main-copy`
**Target**: `/Users/bmf/code/oscilla-animator-v2`

## Architecture Decision

**Using MobX** - This makes v1's store patterns directly portable. The problem wasn't MobX itself, but scattered sources of truth and implicit coupling.

### V2 Store Principles (Learn from V1 Mistakes)

1. **Single Source of Truth**: One `PatchStore` owns the patch data
2. **Derived State via `computed`**: No duplicated data across stores
3. **Clear Store Boundaries**: UI state vs domain state vs transient state
4. **Actions at Boundaries**: Mutations only through defined actions

---

## Store Architecture (New for V2)

```
src/stores/
├── RootStore.ts          # Coordinates child stores, single context
├── PatchStore.ts         # THE source of truth for patch data
├── SelectionStore.ts     # UI selection state (derived views into patch)
├── ViewportStore.ts      # Pan/zoom/layout state
├── DiagnosticsStore.ts   # Errors, warnings, logs
└── PlaybackStore.ts      # Time, play state, speed
```

### Key Differences from V1

| V1 Problem | V2 Solution |
|-----------|-------------|
| 6+ stores with overlapping block/connection data | Single `PatchStore.patch` as canonical |
| `BusStore` separate from `PatchStore` | Buses are just blocks with `role.kind === 'bus'` |
| `DefaultSourceStore` for implicit params | Defaults live on slot definitions |
| `UIStateStore` mixed concerns | Split: `SelectionStore`, `ViewportStore` |
| `CompositeStore` redundant | Composites are blocks, expansion is compile-time |

---

## Salvage Tiers (Revised for MobX)

### Tier 1: Direct Port (Minimal Changes)

These components work with MobX and need only import path updates:

| Component | V1 File | LOC | Changes Needed |
|-----------|---------|-----|----------------|
| InspectorContainer | `components/InspectorContainer.tsx` | 82 | Import paths only |
| DiagnosticBadge | `components/DiagnosticBadge.tsx` | ~50 | Import paths only |
| BlockLibrary | `BlockLibrary.tsx` | 416 | Hook to v2 block registry |
| SettingsToolbar | `SettingsToolbar.tsx` | 708 | Hook to PlaybackStore |
| DiagnosticsConsole | `DiagnosticsConsole.tsx` | 384 | Hook to DiagnosticsStore |
| ViewportSurface | `board/ViewportSurface.tsx` | 175 | Hook to ViewportStore |

### Tier 2: Adapt Store References

These need store interface updates but logic is portable:

| Component | V1 File | LOC | Adaptation |
|-----------|---------|-----|------------|
| BlockView | `board/BlockView.tsx` | 221 | Use v2 Block type, SelectionStore |
| ConnectorOverlay | `board/ConnectorOverlay.tsx` | 137 | Use v2 Edge type |
| GraphWorkspace | `board/GraphWorkspace.tsx` | 280 | Compose v2 stores |
| BoardScene | `board/BoardScene.tsx` | 104 | Minor type updates |
| PatchBay | `PatchBay.tsx` | 1010 | Compose updated children |

### Tier 3: Significant Rework (Simpler V2 Model)

| Component | V1 File | LOC | Why Rework |
|-----------|---------|-----|-----------|
| Inspector | `Inspector.tsx` | 1679 | V2 has no separate params; all inputs are slots |
| ConnectionInspector | `ConnectionInspector.tsx` | 965 | V2 edges simpler (no lens chains) |
| ModulationTable | `modulation-table/*.tsx` | 2556 | Adapt for simpler transform model |

### Tier 4: Skip / Redesign Later

| Component | Reason |
|-----------|--------|
| LensChainEditor (1204 LOC) | V2 transforms are simpler |
| HelpCenter (794 LOC) | Redesign for v2 mental model |
| BusPicker | Buses implicit in type system |
| Lane UI | No lanes in v2 |33

---

## V1 Stores to Study / Adapt

### Worth Porting (with cleanup)

| Store | V1 File | Notes |
|-------|---------|-------|
| SelectionStore | `stores/SelectionStore.ts` | Clean pattern, adapt to v2 types |
| EmphasisStore | `stores/EmphasisStore.ts` | Hover state, merge into SelectionStore |
| HistoryStore | `stores/HistoryStore.ts` | Undo/redo pattern works with immutable patches |
| TimeStore | `stores/TimeStore.ts` | Playback state, rename to PlaybackStore |

### Don't Port (Replaced by V2 Design)

| Store | Reason |
|-------|--------|
| PatchStore | V1 version has wrong structure; write fresh |
| BusStore | Buses are blocks in v2 |
| DefaultSourceStore | Defaults on slots |
| CompositeStore | Composites are blocks |
| LaneStore | No lanes |
| ModulationTableStore | Coupled to v1 lens model |

---

## Implementation Order

### Phase 1: Store Foundation
1. Create `RootStore` with context provider
2. Create `PatchStore` with v2's `Patch` type
3. Create `SelectionStore` (adapted from v1)
4. Create `ViewportStore` (from v1 patterns)
5. Create `PlaybackStore` (from TimeStore)

### Phase 2: Tier 1 Components
1. Port InspectorContainer (pure presentational)
2. Port DiagnosticBadge
3. Port BlockLibrary (needs block registry)
4. Port SettingsToolbar
5. Port ViewportSurface

### Phase 3: Board Components (Tier 2)
1. Port BlockView with v2 Block type
2. Port ConnectorOverlay with v2 Edge type
3. Port GraphWorkspace
4. Port BoardScene
5. Integrate into PatchBay

### Phase 4: Inspector & Editing (Tier 3)
1. Build slot-based parameter forms (new)
2. Adapt Inspector layout
3. Build simplified connection editor
4. Adapt ModulationTable for v2 transforms

---

## File Mapping

### CSS (Copy As-Is)
```
v1: src/editor/components/InspectorContainer.css
v1: src/editor/Inspector.css
v1: src/editor/board/Board.css
v1: src/editor/SettingsToolbar.css
v1: src/editor/LogWindow.css
v1: src/editor/BlockLibrary.css
```

### Stores (New Location)
```
v2: src/stores/RootStore.ts
v2: src/stores/PatchStore.ts
v2: src/stores/SelectionStore.ts
v2: src/stores/ViewportStore.ts
v2: src/stores/PlaybackStore.ts
v2: src/stores/DiagnosticsStore.ts
```

### Components (New Location)
```
v2: src/ui/components/InspectorContainer.tsx
v2: src/ui/components/DiagnosticBadge.tsx
v2: src/ui/board/BlockView.tsx
v2: src/ui/board/ViewportSurface.tsx
v2: src/ui/board/GraphWorkspace.tsx
v2: src/ui/BlockLibrary.tsx
v2: src/ui/SettingsToolbar.tsx
v2: src/ui/Inspector.tsx
v2: src/ui/PatchBay.tsx
```

---

## Success Criteria

- [ ] RootStore provides single context for all stores
- [ ] PatchStore is THE source of truth (no duplicates)
- [ ] Selection/hover state works with v2 block/edge types
- [ ] Board renders blocks from PatchStore
- [ ] BlockLibrary shows available block types
- [ ] Basic inspector shows selected block slots
- [ ] Can create connections between blocks
- [ ] Undo/redo works via HistoryStore

---

## Quick Reference: V1 Files Location

All v1 source at: `/Users/bmf/code/oscilla-animator_codex.worktrees/main-copy/src/editor/`

Key directories:
- `stores/` - MobX stores
- `board/` - Canvas/graph components
- `components/` - Reusable UI components
- `modulation-table/` - Connection editing table
- `blocks/` - Block definitions & registry
