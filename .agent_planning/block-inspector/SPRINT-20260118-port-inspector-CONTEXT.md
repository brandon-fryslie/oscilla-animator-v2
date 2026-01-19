# Implementation Context: port-inspector

**Sprint:** Port Sub-Inspector & Full Control Support
**Generated:** 2026-01-18

## Key Files

### Must Modify

**`src/ui/components/BlockInspector.tsx`**
- Add port click handlers
- Create PortInspector subcomponent
- Add connection link navigation
- Expand param editing with full UIControlHint support

**`src/ui/reactFlowEditor/ReactFlowEditor.tsx`** (for edge inspector)
- Add `onEdgeClick` handler
- Call `rootStore.selection.selectEdge()`

### May Modify

**`src/stores/SelectionStore.ts`**
- Already has `hoveredPortRef: PortRef | null`
- May add `selectedPortRef` for explicit port selection (or use local state)

## Type Reference

### PortRef (existing)

```typescript
// From src/graph/Patch.ts
export interface PortRef {
  readonly blockId: string;
  readonly slotId: string;
}
```

### UIControlHint (existing)

```typescript
// From src/types/index.ts
export type UIControlHint =
  | { kind: 'slider'; min: number; max: number; step: number }
  | { kind: 'int'; min?: number; max?: number; step?: number }
  | { kind: 'float'; min?: number; max?: number; step?: number }
  | { kind: 'select'; options: { value: string; label: string }[] }
  | { kind: 'color' }
  | { kind: 'boolean' }
  | { kind: 'text' }
  | { kind: 'xy' };
```

### InputDef (has uiHint)

```typescript
// From src/blocks/registry.ts
export interface InputDef {
  readonly id: string;
  readonly label: string;
  readonly type: SignalType;
  readonly optional?: boolean;
  readonly defaultValue?: unknown;
  readonly defaultSource?: DefaultSource;
  readonly uiHint?: UIControlHint;  // <-- here
}
```

## Component Architecture

### Suggested Structure

```
BlockInspector (observer)
├── NoSelection
├── TypePreview
├── TimeRootBlock
└── BlockDetails
    ├── Header (displayName, type)
    ├── InputPorts (clickable)
    │   └── PortItem (onClick → setSelectedPort)
    ├── OutputPorts (clickable)
    │   └── PortItem (onClick → setSelectedPort)
    └── ParamEditor
        └── ParamField (switches on UIControlHint)

PortInspector (when selectedPort is set)
├── BackButton → clears selectedPort
├── PortInfo (type, label, optional)
├── DefaultSource (if any)
└── Connections (clickable links)

EdgeInspector (when edge selected)
├── Source (block.port) - clickable
└── Target (block.port) - clickable
```

### State Management

Option A: Local state in BlockInspector
```tsx
const [selectedPort, setSelectedPort] = useState<PortRef | null>(null);
```

Option B: Add to SelectionStore
```typescript
// In SelectionStore
selectedPortRef: PortRef | null = null;
selectPort(ref: PortRef | null): void { ... }
```

Recommend Option A for simplicity - port selection is UI-local concern.

## UIControlHint → Component Mapping

```tsx
function ParamControl({ hint, value, onChange }: Props) {
  if (!hint) {
    // Infer from typeof value
    return typeof value === 'number'
      ? <NumberInput .../>
      : <TextField .../>;
  }

  switch (hint.kind) {
    case 'slider':
      return <Slider min={hint.min} max={hint.max} step={hint.step} .../>;
    case 'int':
      return <TextField type="number" inputProps={{ step: 1 }} .../>;
    case 'float':
      return <TextField type="number" inputProps={{ step: 0.01 }} .../>;
    case 'select':
      return <Select>{hint.options.map(...)}</Select>;
    case 'boolean':
      return <Switch checked={!!value} .../>;
    case 'color':
      return <input type="color" value={value} .../>;
    case 'text':
      return <TextField .../>;
    case 'xy':
      return <XYInput value={value as {x,y}} .../>;
  }
}
```

## Navigation Pattern

```tsx
// Clickable connection link
<span
  style={{ cursor: 'pointer', color: colors.primary }}
  onClick={() => rootStore.selection.selectBlock(sourceBlockId as BlockId)}
>
  {sourceBlockId}.{sourceSlotId}
</span>
```

## Testing Checklist

1. Create patch with multiple connected blocks
2. Click block A input port → port inspector shows
3. Port shows it's connected to block B
4. Click block B link → inspector now shows block B
5. Verify navigation works both directions
6. Test each UIControlHint type with appropriate param
