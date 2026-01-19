# Block Inspector Improvements - Evaluation

**Generated:** 2026-01-18
**Verdict:** CONTINUE

## Executive Summary

The block inspector exists but is **read-only**. Making it fully interactive requires:
1. Wiring ReactFlow selection to SelectionStore (gap)
2. Building editable field components for block params
3. Creating port sub-inspector with click-to-navigate
4. Leveraging existing architecture (PatchStore actions, UIControlHint types)

## Current State Analysis

### What Exists

**BlockInspector Component** (`src/ui/components/BlockInspector.tsx`):
- Observer-based, reacts to `rootStore.selection`
- Three modes: NoSelection, TypePreview, BlockDetails
- Shows ports with connection status (incoming/outgoing)
- Displays params as read-only JSON
- Filters timeRoot blocks (system-managed)

**Selection Infrastructure** (`src/stores/SelectionStore.ts`):
- Stores IDs only (architectural invariant - ONE SOURCE OF TRUTH)
- Has `selectBlock(id)`, `selectEdge(id)`, `setPreviewType(type)` actions
- Derives actual Block/Edge objects via computed getters from PatchStore
- Has hover state: `hoveredBlockId`, `hoveredPortRef`
- Computes `relatedBlockIds`, `relatedEdgeIds` for highlighting

**Edit Infrastructure** (`src/stores/PatchStore.ts`):
- `updateBlockParams(id, params)` - partial update
- `updateBlockDisplayName(id, name)` - display name update
- Both are MobX actions, properly observable

**Block Definition System** (`src/blocks/registry.ts`):
- `InputDef` has optional `uiHint: UIControlHint`
- `UIControlHint` types: slider, int, float, select, color, boolean, text, xy
- Block params defined with defaults in registry

**UI Components**:
- MUI theme configured with dark mode, sliders, inputs, selects
- `InspectorContainer` component exists (currently unused)

### Critical Gap: Selection Wiring

**ReactFlow → SelectionStore is NOT wired up:**
- ReactFlow manages its own `node.selected` state
- Delete handler reads `nodes.filter(n => n.selected)` locally
- But clicking a node does NOT call `rootStore.selection.selectBlock()`
- This means the BlockInspector never sees editor selections!

This is the **blocking prerequisite** for the entire feature.

### What's Missing

1. **Selection sync**: ReactFlow click → SelectionStore.selectBlock()
2. **Editable param fields**: Components for each UIControlHint kind
3. **Port sub-inspector**: Clicking a port shows port details with navigation
4. **Const block value editor**: Specific UI for editing Const.value param
5. **DisplayName editing**: Inline or input field editing
6. **Edge inspector**: When clicking connections in port view

## Dependencies

- ReactFlow API (`onNodeClick`, `onSelectionChange`)
- MUI components (TextField, Slider, Select, Switch, ColorPicker)
- MobX observer pattern (already in use)
- Existing theme colors and styling

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| ReactFlow selection API complexity | Medium | Use simple onNodeClick, not onSelectionChange for single-select |
| UIControlHint coverage incomplete | Low | Fall back to text input for unknown hints |
| Port navigation complexity | Medium | Start with "select block" on port click, defer deep drill-down |
| Const block polymorphism | Low | Existing payloadType param determines edit control |

## Recommendations

1. **Sprint 1 (HIGH confidence)**: Wire selection + basic param editing
   - Fix the selection sync gap first
   - Add editable text/number fields for basic params

2. **Sprint 2 (HIGH confidence)**: Full UIControlHint support + port inspector
   - Slider, select, boolean, color controls
   - Port click → shows port detail panel
   - Navigate from port connections to source/target blocks

## Files To Modify

**Selection wiring:**
- `src/ui/reactFlowEditor/ReactFlowEditor.tsx` - add onNodeClick handler

**Inspector enhancement:**
- `src/ui/components/BlockInspector.tsx` - main component changes

**New components (if needed):**
- `src/ui/components/inspector/ParamEditor.tsx` - generic param editor
- `src/ui/components/inspector/PortInspector.tsx` - port detail view

**Potentially useful:**
- `src/ui/components/InspectorContainer.tsx` - could reuse for structure
