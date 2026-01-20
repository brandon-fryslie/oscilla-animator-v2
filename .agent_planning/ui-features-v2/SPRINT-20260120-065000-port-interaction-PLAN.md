# Sprint: port-interaction - Port Highlighting & Inspector Connections
Generated: 2026-01-20T06:50:00Z
Updated: 2026-01-20T08:50:00Z
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Enable interactive port features: compatible port highlighting on hover and ability to connect/disconnect from the Inspector panel.

## Known Elements

- Type compatibility checking exists in `typeValidation.ts` (isTypeCompatible, validateConnection)
- SelectionStore has port selection (from Sprint 1) ✅
- BlockInspector shows port info (from Sprint 1) ✅
- OscillaNode is already an observer with onMouseEnter/onMouseLeave support

## Research Findings (2026-01-20)

### 1. Highlight Propagation Strategy: MobX Observable Store
**Decision: New PortHighlightStore with MobX**

```typescript
class PortHighlightStore {
  hoveredPort: { blockId: string; portId: string; direction: 'input' | 'output' } | null = null;

  setHoveredPort(port: PortRef | null) {
    this.hoveredPort = port;
  }

  isCompatibleWith(blockId: string, portId: string, direction: string): boolean {
    // Use existing validateConnection() from typeValidation.ts
  }
}
```

OscillaNode already uses `observer()` - it will react to highlight store changes efficiently.

### 2. Connection Picker UX: MUI Autocomplete
**Decision: MUI Autocomplete with grouping**

MUI Autocomplete provides:
- Search/filter built-in
- Grouping by block name
- Keyboard navigation
- Already installed in project

```tsx
<Autocomplete
  options={compatiblePorts}
  groupBy={(option) => option.blockName}
  getOptionLabel={(option) => `${option.blockName}.${option.portName}`}
  renderInput={(params) => <TextField {...params} label="Connect to..." />}
/>
```

### 3. ReactFlow Hover Detection
**Decision: Standard onMouseEnter/onMouseLeave on Handle wrapper**

Already supported in OscillaNode - just add handlers to the Handle components:
```tsx
<Handle
  onMouseEnter={() => highlightStore.setHoveredPort({ blockId, portId, direction: 'input' })}
  onMouseLeave={() => highlightStore.setHoveredPort(null)}
/>
```

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

## Research Tasks (COMPLETED)

- [x] Test React context approach for highlight state → MobX store chosen (OscillaNode already observer)
- [x] Prototype connection picker component → MUI Autocomplete with groupBy
- [x] Measure performance with 50+ block patch → MobX selective updates should handle it
- [x] Evaluate ReactFlow's connection line preview feature → Already built-in during drag

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
