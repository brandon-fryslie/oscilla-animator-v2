# V1 UI Salvage Roadmap (Aligned with Canonical Spec v2.5)

**Created**: 2026-01-11 (Revised from 2026-01-09 version)
**Canonical Spec**: `design-docs/CANONICAL-oscilla-v2.5-20260109/`
**Source**: `/Users/bmf/code/oscilla-animator_codex.worktrees/main-copy`
**Target**: `/Users/bmf/code/oscilla-animator-v2`

---

## Alignment with Canonical Spec

### Canonical Architecture (What's Specified)

The spec defines **system architecture**, not UI/store implementation:

| Canonical Spec | Implementation Status |
|----------------|----------------------|
| **Type System** (Topic 01) | ✅ COMPLETE - SignalType, 5-axis metadata |
| **Block System** (Topic 02) | ✅ COMPLETE - Block, BlockRole, discriminated roles |
| **Time System** (Topic 03) | 📋 PLANNED - TimeRoot, phase continuity |
| **Compilation** (Topic 04) | 🔄 IN PROGRESS - Domain unification done, passes 5-10 remaining |
| **Runtime** (Topic 05) | 📋 PLANNED - Offset-addressed execution |
| **Renderer** (Topic 06) | 💡 PROPOSED - RenderInstances2D contract |
| **Diagnostics** (Topic 07) | ✅ COMPLETE Sprint 1 - EventHub, DiagnosticHub, stable IDs |
| **Observation** (Topic 08) | 💡 PROPOSED - DebugGraph, DebugSnapshot |
| **Event Hub** (Topic 12) | ✅ COMPLETE - Typed event bus, five-event spine |

### Implementation Freedom (Not Specified)

The spec **does NOT** prescribe:
- Store architecture (MobX vs Redux vs Zustand)
- Component hierarchy
- Panel layout system
- Routing or navigation

**Decision**: Continue with MobX (already working in v2, v1 knowledge transfers cleanly).

---

## V2 Store Architecture (Aligned with Spec Patterns)

```
src/stores/
├── RootStore.ts          # Coordinates child stores + EventHub
├── PatchStore.ts         # Patch (canonical source of truth)
├── SelectionStore.ts     # UI selection state (derived from patch)
├── ViewportStore.ts      # Pan/zoom/layout state
├── DiagnosticsStore.ts   # ✅ COMPLETE - Wraps DiagnosticHub (Sprint 1)
└── PlaybackStore.ts      # Time, play state, speed
```

### Key Canonical Principles

**Invariant I3**: State Continuity with Stable IDs
- BlockId, PortId are branded UUIDs (never indices)
- Selection uses stable IDs (survives hot-swap)

**Invariant I28**: Diagnostics are non-blocking
- Diagnostics never block execution
- DiagnosticsStore wraps DiagnosticHub (event-driven)

**Invariant I29**: Diagnostic IDs are stable
- Same root cause → same diagnostic ID
- DiagnosticStore uses stable ID deduplication

**Topic 12**: Event-Driven Coordination
- EventHub coordinates stores (not direct coupling)
- GraphCommitted → triggers authoring validators
- CompileEnd → updates DiagnosticsStore

---

## Canonical Types vs V1 Types

### Type Mapping

| V1 Concept | V2 Canonical | Spec Reference |
|-----------|-------------|----------------|
| `Block` | `Block` with `BlockRole` discriminated union | Topic 02:231-237 |
| `Connection` | `Edge` (from/to endpoints) | Topic 02:44-59 |
| `Parameter` | Input port (no separate params) | Topic 02 |
| `ModulationSource` | Edge with `from: OutputPort` | Topic 14 |
| `Bus` | Block with `role.kind === 'bus'` | Topic 02:25 |
| `DefaultSource` | Bus with default value in `BusMeta` | Topic 02 |
| `Composite` | Block with `role.kind === 'derived'` | Topic 02:237 |
| `Lane` | **Removed** (no lanes in v2) | N/A |

### Signal Type Evolution

**V1**: Separate `SignalType` and `FieldType` enums

**V2 Canonical** (Topic 01):
```typescript
type SignalType = {
  payload: PayloadType;  // 'number' | 'vec2' | 'color' | etc
  extent: Extent;        // 'signal' | 'field' | 'special'
  cardinality: [number, number]; // [min, max] domain size
  temporality: 'static' | 'dynamic' | 'eternal';
  binding: 'eager' | 'lazy';
  axisTags?: AxisTag[];  // Semantic tags (e.g., 'point', 'uv')
};
```

**UI Impact**: Type badges show extent + payload (e.g., "field:vec2(point)")

---

## Component Salvage Tiers (Revised for Canonical Alignment)

### Tier 1: Direct Port (Minimal Changes)

These work with v2 canonical types after import updates:

| Component | V1 File | LOC | Changes | Spec Alignment |
|-----------|---------|-----|---------|----------------|
| **InspectorContainer** | `InspectorContainer.tsx` | 82 | Import paths | Uses SelectionStore (allowed) |
| **DiagnosticBadge** | `DiagnosticBadge.tsx` | ~50 | ~~Import paths~~ **Replaced by Sprint 1** | ✅ DiagnosticConsole exists (Topic 07) |
| **BlockLibrary** | `BlockLibrary.tsx` | 416 | Hook to v2 block registry | BlockRole.kind filtering (Topic 02) |
| **SettingsToolbar** | `SettingsToolbar.tsx` | 708 | Hook to PlaybackStore | Time controls (Topic 03) |
| ~~**DiagnosticsConsole**~~ | ~~`DiagnosticsConsole.tsx`~~ | ~~384~~ | ✅ **Already exists in v2** | ✅ Sprint 1 complete (Topic 07) |
| **ViewportSurface** | `board/ViewportSurface.tsx` | 175 | Hook to ViewportStore | Pan/zoom (implementation detail) |

### Tier 2: Adapt to Canonical Types

Require updates to use v2 canonical structures:

| Component | V1 File | LOC | Adaptation | Spec Alignment |
|-----------|---------|-----|------------|----------------|
| **BlockView** | `board/BlockView.tsx` | 221 | Use `Block` with `BlockRole` | Topic 02:14-26 |
| **ConnectorOverlay** | `board/ConnectorOverlay.tsx` | 137 | Use `Edge` (from/to Endpoint) | Topic 02:44-59 |
| **GraphWorkspace** | `board/GraphWorkspace.tsx` | 280 | Render from `Patch.blocks`, `Patch.edges` | Topic 02:74-77 |
| **BoardScene** | `board/BoardScene.tsx` | 104 | Minor Block type updates | Topic 02 |
| **PatchBay** | `PatchBay.tsx` | 1010 | Compose updated children | Integration only |

**Key Change**: Blocks no longer have separate "parameters" - all inputs are ports (Topic 02).

### Tier 3: Significant Rework (Canonical Model Simpler)

| Component | V1 File | LOC | Why Rework | Canonical Guidance |
|-----------|---------|-----|-----------|-------------------|
| **Inspector** | `Inspector.tsx` | 1679 | **No separate params** - all inputs are ports | Topic 02: Ports are uniform |
| **ConnectionInspector** | `ConnectionInspector.tsx` | 965 | **Edges simpler** - no multi-level lens chains (yet) | Topic 14: Transform chains are UI extension |
| **ModulationTable** | `modulation-table/*.tsx` | 2556 | Adapt to canonical Edge + Transform model | ✅ Topic 14: Modulation Table UI spec |

**Modulation Table Guidance** (Topic 14):
- Rows = Input ports
- Columns = Output ports
- Cells = Edges (with optional transform chains)
- Transforms: Adapters (type conversion) + Lenses (value transformation)
- **UI view only** - not architectural mandate

### Tier 4: Skip / Defer

| Component | Reason | Canonical Status |
|-----------|--------|------------------|
| **LensChainEditor** (1204 LOC) | V2 transforms simpler initially | Topic 14: Transform chains exist but start simple |
| **HelpCenter** (794 LOC) | Redesign for v2 mental model | Not in spec |
| **BusPicker** | Buses implicit in type system | Topic 02: Buses are blocks |
| **Lane UI** | **No lanes in v2** | Removed from canonical spec |

---

## Canonical Spec Checklist for UI Components

When porting a component, verify alignment:

### Block System (Topic 02)

- [ ] Uses `BlockRole` discriminated union (not string types)
- [ ] Filters by `role.kind` (e.g., hide derived blocks in Block Library)
- [ ] Treats buses as blocks with `role.kind === 'bus'`
- [ ] No separate "parameter" concept (all inputs are ports)

### Type System (Topic 01)

- [ ] Displays `SignalType` with extent + payload (e.g., "field:vec2")
- [ ] Shows axis tags where relevant (e.g., "(point)" for position)
- [ ] Handles cardinality ranges [min, max] for domain sizes

### Diagnostics (Topic 07)

- [ ] Uses `DiagnosticsStore` (wraps DiagnosticHub)
- [ ] Diagnostics shown by severity (error/warn/info/hint)
- [ ] Diagnostic IDs stable (same error → same ID)
- [ ] No direct diagnostic creation (emit events instead)

### Event Hub (Topic 12)

- [ ] Components listen to EventHub for coordination
- [ ] Never mutate PatchStore directly from UI (emit events)
- [ ] GraphCommitted emitted after patch mutations

### Invariants

- [ ] **I3**: Uses stable IDs (BlockId, PortId are branded UUIDs)
- [ ] **I28**: Diagnostics non-blocking (async display)
- [ ] **I29**: Diagnostic IDs deterministic

---

## Implementation Order (Revised)

### Phase 1: Store Foundation ✅ (MOSTLY COMPLETE)

1. ✅ Create `RootStore` with context provider (exists)
2. ✅ Create `PatchStore` with v2's `Patch` type (exists)
3. ✅ Create `SelectionStore` (exists)
4. ✅ Create `ViewportStore` (exists)
5. ✅ Create `PlaybackStore` (exists)
6. ✅ Create `DiagnosticsStore` (Sprint 1 complete - Topic 07)
7. ✅ Wire EventHub into RootStore (Sprint 1 complete - Topic 12)

**Status**: Foundation complete. Ready for UI porting.

### Phase 2: Tier 1 Components (Direct Port)

1. Port **InspectorContainer** (pure presentational)
2. ~~Port DiagnosticBadge~~ **Skip - DiagnosticConsole exists**
3. Port **BlockLibrary** with BlockRole filtering
4. Port **SettingsToolbar**
5. Port **ViewportSurface**

**Estimated**: 2-3 days

### Phase 3: Board Components (Tier 2)

1. Port **BlockView** with canonical `Block` + `BlockRole`
2. Port **ConnectorOverlay** with canonical `Edge`
3. Port **GraphWorkspace**
4. Port **BoardScene**
5. Integrate into PatchBay

**Estimated**: 3-4 days

### Phase 4: Inspector & Editing (Tier 3)

1. Build slot-based port inspector (no separate params)
2. Adapt Inspector layout for canonical Block model
3. Build simplified connection editor (direct edges initially)
4. **Optional**: Adapt ModulationTable per Topic 14 spec

**Estimated**: 4-5 days

---

## File Mapping (Updated)

### Stores (V2 Locations - Existing)

```
✅ src/stores/RootStore.ts
✅ src/stores/PatchStore.ts
✅ src/stores/SelectionStore.ts
✅ src/stores/ViewportStore.ts
✅ src/stores/PlaybackStore.ts
✅ src/stores/DiagnosticsStore.ts  # Sprint 1
✅ src/events/EventHub.ts          # Sprint 1
✅ src/events/types.ts             # Sprint 1
```

### Diagnostics (V2 - Sprint 1 Complete)

```
✅ src/diagnostics/DiagnosticHub.ts
✅ src/diagnostics/types.ts
✅ src/diagnostics/diagnosticId.ts
✅ src/diagnostics/validators/authoringValidators.ts
✅ src/ui/components/app/DiagnosticConsole.tsx
✅ src/diagnostics/README.md
```

### Components to Port (V1 → V2)

```
v1: src/editor/components/InspectorContainer.tsx
v2: src/ui/components/InspectorContainer.tsx

v1: src/editor/BlockLibrary.tsx
v2: src/ui/components/BlockLibrary.tsx

v1: src/editor/SettingsToolbar.tsx
v2: src/ui/components/SettingsToolbar.tsx

v1: src/editor/board/BlockView.tsx
v2: src/ui/board/BlockView.tsx

v1: src/editor/board/ViewportSurface.tsx
v2: src/ui/board/ViewportSurface.tsx

v1: src/editor/board/ConnectorOverlay.tsx
v2: src/ui/board/ConnectorOverlay.tsx

v1: src/editor/board/GraphWorkspace.tsx
v2: src/ui/board/GraphWorkspace.tsx

v1: src/editor/Inspector.tsx
v2: src/ui/components/Inspector.tsx (significant rework)

v1: src/editor/modulation-table/*.tsx
v2: src/ui/components/ModulationTable/*.tsx (adapt to Topic 14)
```

### CSS (Copy As-Is, Minor Tweaks)

```
v1: src/editor/components/InspectorContainer.css
v1: src/editor/Inspector.css
v1: src/editor/board/Board.css
v1: src/editor/SettingsToolbar.css
v1: src/editor/BlockLibrary.css
```

---

## Canonical Compliance Summary

### Fully Aligned ✅

- **Type System** (Topic 01): SignalType with 5-axis metadata implemented
- **Block System** (Topic 02): BlockRole discriminated union, buses as blocks
- **Diagnostics** (Topic 07): Sprint 1 complete - EventHub, DiagnosticHub, stable IDs
- **Event Hub** (Topic 12): Typed event bus, five-event spine

### Partially Aligned 🔄

- **Compilation** (Topic 04): Domain unification done, passes 5-10 remaining
- **Time System** (Topic 03): Planned but not implemented

### Not Yet Started 💡

- **Runtime** (Topic 05): Offset-addressed execution planned
- **Renderer** (Topic 06): RenderInstances2D contract proposed
- **Observation** (Topic 08): DebugGraph, DebugSnapshot proposed

### V1 UI Salvage Impact

**Can Port Now** (depends on complete canonical components):
- InspectorContainer, BlockLibrary, SettingsToolbar, ViewportSurface
- BlockView, ConnectorOverlay, GraphWorkspace (adapt to canonical types)

**Defer Until Runtime Complete** (Topic 05):
- Performance monitoring UI
- Runtime diagnostic displays

**Defer Until Renderer Complete** (Topic 06):
- Canvas rendering components
- Render tree inspection

---

## Success Criteria (Revised for Canonical Alignment)

### Phase 1 ✅ (COMPLETE)
- [x] RootStore provides single context for all stores
- [x] PatchStore is THE source of truth (uses canonical `Patch` type)
- [x] Selection/hover state uses canonical BlockId/PortId (stable UUIDs)
- [x] DiagnosticsStore wraps DiagnosticHub (event-driven, Topic 07)
- [x] EventHub coordinates stores (typed events, Topic 12)

### Phase 2 (Tier 1 Components)
- [ ] InspectorContainer renders with v2 SelectionStore
- [ ] BlockLibrary shows blocks filtered by `BlockRole.kind`
- [ ] SettingsToolbar controls PlaybackStore (time/speed)
- [ ] ViewportSurface handles pan/zoom

### Phase 3 (Board Components)
- [ ] BlockView renders canonical `Block` with `BlockRole` visual discrimination
- [ ] ConnectorOverlay draws canonical `Edge` (from/to Endpoint)
- [ ] GraphWorkspace displays `Patch.blocks` and `Patch.edges`
- [ ] Can select blocks/edges via SelectionStore

### Phase 4 (Inspector & Editing)
- [ ] Inspector shows selected block's input/output **ports** (no separate params)
- [ ] Can create edges between compatible ports
- [ ] Type compatibility shown (SignalType with extent + payload)
- [ ] Undo/redo works via HistoryStore

---

## Quick Reference

**V1 Source**: `/Users/bmf/code/oscilla-animator_codex.worktrees/main-copy/src/editor/`

**Canonical Spec**: `design-docs/CANONICAL-oscilla-v2.5-20260109/`

**Key Spec Topics for UI**:
- Topic 02: Block System (BlockRole, Port, Bus as block)
- Topic 07: Diagnostics System (DiagnosticHub, stable IDs) ✅ Sprint 1
- Topic 12: Event Hub (EventHub, GraphCommitted) ✅ Sprint 1
- Topic 14: Modulation Table UI (Transform chains, Adapter, Lens)

**Implementation Status**:
- Phase 1 (Stores): ✅ Complete
- Phase 2 (Tier 1): 📋 Ready to start
- Phase 3 (Board): 📋 Blocked on Phase 2
- Phase 4 (Inspector): 📋 Blocked on Phase 3

---

## Changes from Previous Version

### Additions
- Canonical spec alignment section
- Type mapping table (V1 → V2 canonical)
- Canonical compliance checklist for components
- Topic 14 guidance for Modulation Table
- EventHub/DiagnosticsStore Sprint 1 completion noted

### Removals
- Removed obsolete V1 assumptions (lanes, separate params)
- Removed DiagnosticsConsole from port list (Sprint 1 delivered it)
- Clarified "no separate params" throughout

### Corrections
- Buses are blocks (not separate store) per Topic 02
- Composites are blocks (not separate store) per Topic 02
- All canonical invariants referenced explicitly
- Spec topics cited with numbers (e.g., Topic 07, Topic 12)

**Status**: Ready for Phase 2 implementation (Tier 1 component porting).
