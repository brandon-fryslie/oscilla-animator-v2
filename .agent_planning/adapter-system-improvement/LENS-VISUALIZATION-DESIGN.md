# Lens Visualization Design Decisions

**Date**: 2026-02-02
**Sprint**: Sprint 4 - Adapter UI Visualization
**Status**: Implemented

## Overview

This document captures design decisions for visualizing lenses on edges in the graph editor.

## V1: Edge Data Population

**Decision**: Store lens information in `edge.data.lenses`

**Rationale**:
- ReactFlow edge data is the standard way to pass custom information to edge components
- Lenses are already stored on `InputPort.lenses` in the Patch model
- During edge sync (`createEdgeFromPatchEdge`), we read from the target port and populate edge data
- This makes lens information available to custom edge components without prop drilling

**Implementation**:
- Created `OscillaEdgeData` interface with `lenses`, `hasAdapter`, `isNonContributing` fields
- Modified `createEdgeFromPatchEdge()` to:
  - Set `edge.type = 'oscilla'` (for custom component)
  - Populate `edge.data.lenses` from `targetPort.lenses`
  - Set `edge.data.isNonContributing` based on combine mode

## V2: Custom Edge Component

**Decision**: Create `OscillaEdge` component with amber lens indicator near target port

**Rationale**:
- Custom edge component allows visual indicators beyond text labels
- Indicator positioned at 90% along edge path (near target) makes it clear which port is transformed
- Amber color (#f59e0b) is consistent with existing lens badges on ports (see `OscillaNode.tsx` lines 236-263)
- Tooltip shows lens type on hover without cluttering the graph

**Implementation**:
- Used ReactFlow's `BaseEdge` + `getBezierPath` for standard edge rendering
- Used `EdgeLabelRenderer` for absolutely positioned lens indicator
- Indicator is a small amber pill/badge (10px height) near the target port
- Shows count when multiple lenses (e.g., "2" instead of empty)
- Tooltip shows comma-separated lens labels

**Visual Design** (V3):
- Color: #f59e0b (amber) with #d97706 border (darker amber)
- Size: 10px height, 10-18px width depending on count
- Position: 90% along edge path toward target (biased toward input port)
- Font: 8px bold black text for count
- Shadow: `0 1px 2px rgba(0,0,0,0.2)` for depth

**Interaction**:
- Hover shows tooltip with full lens names
- Click on indicator stops propagation (prevents edge selection)
- Future: click could open lens editor context menu

## V4: Multiple Lenses

**Decision**: Show count badge when port has multiple lenses

**Rationale**:
- Multiple lenses on a port are supported by the data model (Sprint 3)
- Stacking individual indicators would clutter the edge and create visual collision
- A count badge (e.g., "3") is more compact and clearly indicates "multiple transformations"
- Tooltip shows all lens names comma-separated for full details

**Implementation**:
- Single lens: empty amber pill (no text, just color)
- Multiple lenses: amber pill with count number (e.g., "2", "3")
- Tooltip always shows full lens list regardless of count

**Future Enhancements** (not implemented):
- Click on badge could open a popover showing lens chain with reorder/remove controls
- Hover could show visual preview of transformation (e.g., small waveform comparison)
- Badge could animate when lenses are added/removed

## Alternative Designs Considered

### Alt 1: Edge label for lens names
**Rejected**: Text labels clutter the graph and don't scale to multiple lenses well. Already used for adapter labels.

### Alt 2: Change edge color based on lens type
**Rejected**: Color already used for adapters (amber dashed) and non-contributing edges (dimmed). Would create ambiguity.

### Alt 3: Stacked indicators along edge
**Rejected**: Multiple indicators would collide visually and be hard to position consistently. Count badge is cleaner.

### Alt 4: Indicator at midpoint of edge
**Rejected**: Midpoint is ambiguous - doesn't clearly associate with source or target. Lenses transform *inputs*, so near-target positioning is semantically correct.

### Alt 5: Modify target port handle with lens icon
**Rejected**: Port handles are already color-coded by type. Adding lens icon would clutter the port area and interfere with connection UX.

## Consistency with Existing UI

The design maintains consistency with:
- **Port lens badges** (`OscillaNode.tsx:236-263`): Same amber color, similar size, same tooltip pattern
- **Adapter edge styling** (`nodes.ts:364`): Amber stroke color for type-changing connections
- **Non-contributing edge styling** (`nodes.ts:345-347`): Dimmed/dashed for inactive edges

## Testing Strategy

**V1 Tests** (`nodes-edge-data.test.ts`):
- Edge data populated with single lens
- Edge data populated with multiple lenses
- Edge data undefined when no lenses
- Edge type set to 'oscilla'
- isNonContributing flag set correctly

**V2/V3 Integration Tests** (manual):
- Visual regression: edges with lenses render correctly
- Hover tooltip shows lens names
- Multiple lenses show count badge
- Indicator doesn't block handle interactions
- Click on indicator doesn't select edge

**Future Automated Tests**:
- Playwright visual regression tests
- Hover interaction tests
- Click handler tests (when lens editor menu implemented)

## Migration Notes

**Breaking Changes**: None
- Edge data is additive (new fields, no removals)
- Default edge type changed from 'default' to 'oscilla', but custom component renders identically for edges without lenses
- All existing edges continue to work

**Performance**: Negligible
- Edge indicator only renders when lenses present
- No additional re-renders triggered
- Edge data update already happens during normal sync

## Future Work

1. **Lens Editor Context Menu**: Right-click on lens indicator to edit/remove/reorder lenses
2. **Visual Preview**: Hover tooltip could show small waveform comparison (before/after transformation)
3. **Animation**: Badge could pulse or glow when lens is added/changed
4. **Lens Chain Visualization**: Popover showing lens pipeline for complex multi-lens ports
5. **Accessibility**: Keyboard navigation for lens indicators, screen reader support

## References

- Sprint 3 DOD: `.agent_planning/adapter-system-improvement/SPRINT-20260130-sprint3-adapters-lenses-DOD.md`
- Lens data model: `src/graph/Patch.ts:54-100` (LensAttachment interface)
- Port lens badges: `src/ui/reactFlowEditor/OscillaNode.tsx:236-263`
- Edge sync logic: `src/ui/reactFlowEditor/nodes.ts:332-403`
