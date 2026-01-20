# Context: port-foundation Sprint
Generated: 2026-01-20T06:40:00Z

## Key Files

### Selection Store
`src/stores/SelectionStore.ts`
- Currently has: selectedBlockId, selectedEdgeId, previewType
- Need to add: selectedPort (PortRef)

### OscillaNode Component
`src/ui/reactFlowEditor/OscillaNode.tsx`
- Custom ReactFlow node component
- Handle elements at lines 86-98 (inputs) and 143-157 (outputs)
- Current handle size: 10x10px with 2px border
- Type colors passed via `input.typeColor`
- Tooltips via `title` attribute
- Default source indicator dots already present (lines 99-114)

### Block Inspector
`src/ui/components/BlockInspector.tsx`
- Main observer function at line 57
- Mode routing: previewType → TypePreview, selectedEdgeId → EdgeInspector, selectedBlockId → BlockDetails
- Add port mode after edge check

### Node Data Types
`src/ui/reactFlowEditor/nodes.ts`
- PortData interface defines port info passed to OscillaNode
- Need to add `isConnected: boolean` field

### Patch Structure
`src/graph/Patch.ts`
- Edge type has: from: PortRef, to: PortRef
- PortRef has: blockId, slotId (portId)

## Existing Patterns

### Selection Pattern
```typescript
// SelectionStore
selectBlock(blockId: BlockId | null) {
  this.selectedBlockId = blockId;
  this.selectedEdgeId = null;
  this.previewType = null;
}
```

### Observer Pattern (BlockInspector)
```typescript
export const BlockInspector = observer(function BlockInspector() {
  const { previewType, selectedBlockId, selectedEdgeId } = rootStore.selection;
  // Mode routing...
});
```

### Port Click in OscillaNode
Currently no port click handler. Need to add:
```typescript
<Handle
  onClick={(e) => {
    e.stopPropagation();
    rootStore.selection.selectPort(blockId, portId, 'input');
  }}
  // ...
/>
```

## PortRef Type

Check if exists in `src/types/index.ts`. If not, define:
```typescript
interface PortRef {
  blockId: BlockId;
  portId: PortId;
  direction: 'input' | 'output';
}
```

## Connection Detection

To check if a port is connected:
```typescript
// For input port
const isConnected = patch.edges.some(e =>
  e.to.blockId === blockId && e.to.slotId === portId
);

// For output port
const isConnected = patch.edges.some(e =>
  e.from.blockId === blockId && e.from.slotId === portId
);
```

## Getting Port Info for Inspector

From block definition:
```typescript
const blockDef = getBlockDefinition(block.type);
const inputDef = blockDef?.inputs.find(i => i.id === portId);
const outputDef = blockDef?.outputs.find(o => o.id === portId);
```

From edges:
```typescript
// Find what's connected to an input
const sourceEdge = patch.edges.find(e =>
  e.to.blockId === blockId && e.to.slotId === portId
);

// Find what's connected to an output
const targetEdges = patch.edges.filter(e =>
  e.from.blockId === blockId && e.from.slotId === portId
);
```
