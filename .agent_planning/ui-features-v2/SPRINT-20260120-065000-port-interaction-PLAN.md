# Sprint: port-interaction - Port Highlighting & Inspector Connections
Generated: 2026-01-20T06:50:00Z
Confidence: MEDIUM
Status: RESEARCH REQUIRED

## Sprint Goal

Enable interactive port features: compatible port highlighting on hover and ability to connect/disconnect from the Inspector panel.

## Known Elements

- Type compatibility checking exists in `typeValidation.ts`
- SelectionStore will have port selection (from Sprint 1)
- BlockInspector shows port info (from Sprint 1)

## Unknowns to Resolve

1. **Highlight propagation performance**
   - Hovering one port must highlight compatible ports across ALL nodes
   - React update strategy to avoid re-rendering all nodes on each hover
   - Options: React context, MobX observable, CSS class approach

2. **Connection picker UX**
   - Modal vs dropdown vs autocomplete
   - Filtering/searching through potentially many compatible ports
   - How to show block + port in the picker

3. **ReactFlow hover detection**
   - Handle component hover events
   - Detecting when mouse leaves port area
   - Coordinating with connection drag behavior

## Tentative Deliverables

**Beads**:
- oscilla-animator-v2-0yp: Compatible port highlighting on hover
- oscilla-animator-v2-nu6: Connect/disconnect edges from Inspector

### Port Highlighting

When hovering an unconnected OUTPUT port:
- Highlight all compatible INPUT ports (green glow)
- Gray out incompatible ports

When hovering an unconnected INPUT port:
- Highlight all compatible OUTPUT ports (green glow)
- Gray out incompatible ports

### Inspector Connection Management

```
┌─────────────────────────────────────┐
│ INPUTS                              │
├─────────────────────────────────────┤
│ phase      ← InfiniteTimeRoot.phaseA│
│            [×] Disconnect           │
├─────────────────────────────────────┤
│ id01       ← Array.t                │
│            [×] Disconnect           │
├─────────────────────────────────────┤
│ base       (default: 0.35)          │
│            [+] Connect...           │
├─────────────────────────────────────┤
│ amplitude  (default: 1.0)           │
│            [+] Connect...           │
└─────────────────────────────────────┘
```

Click [+] Connect... → Opens connection picker:
```
┌─ Connect to base ─────────────────────┐
│ [Search blocks/ports...]              │
├───────────────────────────────────────┤
│ InfiniteTimeRoot                      │
│   ○ phaseA (Signal<phase>)            │
│   ○ phaseB (Signal<phase>)            │
├───────────────────────────────────────┤
│ Array                                 │
│   ○ t (Field<float>)                  │
├───────────────────────────────────────┤
│ Const_1                               │
│   ● out (Signal<float>) [compatible]  │
└───────────────────────────────────────┘
```

## Research Tasks

- [ ] Test React context approach for highlight state
- [ ] Prototype connection picker component
- [ ] Measure performance with 50+ block patch
- [ ] Evaluate ReactFlow's connection line preview feature

## Tentative Implementation

### Highlight State

Option A: MobX observable in separate store
```typescript
class PortHighlightStore {
  hoveredPort: PortRef | null = null;
  compatiblePorts: Set<string> = new Set(); // "blockId:portId"

  setHoveredPort(port: PortRef | null) {
    this.hoveredPort = port;
    if (port) {
      this.compatiblePorts = this.computeCompatible(port);
    } else {
      this.compatiblePorts.clear();
    }
  }
}
```

Option B: CSS-only with data attributes
- Add `data-port-type` to handles
- On hover, add class to ReactFlow container
- CSS matches compatible ports via attribute selectors

### Connection Picker

```typescript
interface ConnectionPickerProps {
  targetPort: PortRef;  // The port we're connecting TO
  targetType: SignalType;
  onSelect: (sourcePort: PortRef) => void;
  onCancel: () => void;
}
```

## Exit Criteria (to reach HIGH confidence)

- [ ] Highlight propagation strategy chosen and tested
- [ ] Connection picker UX designed
- [ ] Performance acceptable with 50+ blocks
- [ ] Integration with existing type validation confirmed

## Dependencies

- Sprint 1 (port-foundation) must be complete
  - Port selection in SelectionStore
  - Port Inspector panel

## Risks

1. **Performance**: Highlighting could cause many re-renders
   - Mitigation: CSS-only approach, or memoize aggressively

2. **Connection picker complexity**: Too many options to browse
   - Mitigation: Good search/filter, group by block

3. **UX confusion**: Highlighting might conflict with connection drag
   - Mitigation: Clear visual distinction, maybe different trigger

## Files to Modify (tentative)

**New files:**
- `src/stores/PortHighlightStore.ts` (if MobX approach)
- `src/ui/components/ConnectionPicker.tsx`

**Modified files:**
- `src/ui/reactFlowEditor/OscillaNode.tsx` - Hover handlers, highlight styles
- `src/ui/components/BlockInspector.tsx` - Connect buttons, picker integration
- `src/ui/reactFlowEditor/ReactFlowEditor.css` - Highlight styles
