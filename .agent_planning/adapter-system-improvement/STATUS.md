# Status: Adapter System Improvement (Lenses)

**Topic**: adapter-system-improvement
**Last Updated**: 2026-01-27
**Status**: SPRINT 3 READY FOR IMPLEMENTATION

## Current Phase

**Phase**: Sprint 3 Planning Complete - Ready for Implementation

## Progress Summary

| Sprint | Description | Status |
|--------|-------------|--------|
| Sprint 1 | Data Model & Addressing | COMPLETED |
| Sprint 2 | Lenses System Redesign (Normalization) | COMPLETED |
| Sprint 3 | Editor Integration | PLANNED - READY |
| Sprint 4 | UI Visualization | NOT STARTED |
| Sprint 5 | Context Menu & Editing | MERGED INTO SPRINT 3 |

## Recent Activity

- 2026-01-27: **Sprint 3 Planning Complete**
  - Created SPRINT3-EDITOR-INTEGRATION-PLAN.md
  - Created SPRINT3-EDITOR-INTEGRATION-DOD.md
  - Created SPRINT3-EDITOR-INTEGRATION-CONTEXT.md
  - 15 work items defined (12 HIGH, 3 MEDIUM confidence)
  - Estimated 14-18 hours of implementation

- 2026-01-27: **Sprint 2 COMPLETED** - Lenses System Redesign
  - Renamed `AdapterAttachment` to `LensAttachment`
  - Renamed `InputPort.adapters` to `InputPort.lenses`
  - Added `OutputPort.lenses` field (future-proofing)
  - Renamed `AdapterAddress` to `LensAddress`
  - Path changed from `.adapters.` to `.lenses.`
  - Added `generateLensId()` function
  - Refactored Pass 2 into two independent phases:
    - Phase 1: `expandExplicitLenses()` - expands user-defined lenses
    - Phase 2: `autoInsertAdapters()` - backwards compatible adapter insertion
  - All 1907 tests pass

- 2026-01-27: **Sprint 1 COMPLETED** - Data Model & Addressing
  - Added `AdapterAttachment` interface
  - Extended `InputPort` with optional `adapters` field
  - Added canonical addressing for adapters
  - All tests passing

## Sprint 3 Overview

**Goal**: Enable users to add, view, and remove lenses through the editor UI.

**Key Deliverables**:
1. PatchStore methods: `addLens`, `removeLens`, `getLensesForPort`, `updateLensParams`
2. Visual indicator on ports with lenses (amber badge)
3. PortInfoPopover extension to display lens information
4. Port context menu with Add Lens / Remove Lens options
5. Edge context menu with Add Lens option

**Confidence**: HIGH (12 items), MEDIUM (3 items)

**Estimated Effort**: 14-18 hours

**Files to Modify**:
- `src/stores/PatchStore.ts` - Lens CRUD methods
- `src/graph/Patch.ts` - PatchBuilder extension
- `src/ui/reactFlowEditor/nodes.ts` - PortData extension
- `src/ui/reactFlowEditor/OscillaNode.tsx` - Lens indicator
- `src/ui/reactFlowEditor/PortInfoPopover.tsx` - Lenses section
- `src/ui/reactFlowEditor/menus/PortContextMenu.tsx` - Lens menu items
- `src/ui/reactFlowEditor/menus/EdgeContextMenu.tsx` - Lens menu items
- `src/ui/reactFlowEditor/lensUtils.ts` - NEW: Lens utilities
- `src/stores/__tests__/PatchStore-lens.test.ts` - NEW: Unit tests

## Blockers

None currently.

## Next Actions

1. **Start Sprint 3 Implementation**
   - Begin with PatchStore lens methods (items 1-4)
   - Create unit tests as methods are implemented
   - Then proceed to UI components

2. **Recommended Order**:
   - Day 1: PatchStore methods + tests
   - Day 2: Lens utilities + PatchBuilder
   - Day 3: Port indicators + popover
   - Day 4: Context menus
   - Day 5: Edge visualization + polish

## Key Decisions Made

1. **Lenses vs Adapters**:
   - "Lenses" is the user-facing term for explicit transformations
   - "Adapters" remain as compiler auto-inserted blocks (backwards compat)
   - Both systems coexist independently

2. **UI Entry Points**:
   - Port context menu for connected input ports
   - Edge context menu as alternative
   - Visual indicator on ports with lenses

3. **Type Compatibility**:
   - Filter lens options by type compatibility
   - Source type must match lens input, lens output must match target

## Open Questions

None - Sprint 3 is fully specified.

## Dependencies

- Sprint 2 completion (DONE)
- Canonical addressing system (implemented)
- Block registry (implemented)
- Normalization pipeline with lens expansion (implemented)

## References

- SPRINT3-EDITOR-INTEGRATION-PLAN.md - Full implementation plan
- SPRINT3-EDITOR-INTEGRATION-DOD.md - Definition of Done
- SPRINT3-EDITOR-INTEGRATION-CONTEXT.md - Implementation context
- SPRINT2-REDESIGN-LENSES.md - Sprint 2 design doc
- SPRINT2-SUMMARY.md - Sprint 2 summary
- `src/graph/passes/pass2-adapters.ts` - Lens expansion pass
- `src/blocks/adapter-blocks.ts` - Available lens blocks
