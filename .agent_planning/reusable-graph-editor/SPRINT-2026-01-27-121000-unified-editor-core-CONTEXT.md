# Implementation Context: unified-editor-core

**Generated:** 2026-01-27-121000
**Status:** PARTIALLY READY
**Plan:** SPRINT-2026-01-27-121000-unified-editor-core-PLAN.md

## File Paths and Locations

### New Files to Create

```
src/ui/graphEditor/
  GraphEditorCore.tsx      # Main reusable editor component
  UnifiedNode.tsx          # Unified node component
  GraphEditorContext.tsx   # Context for adapter + stores
  useGraphEditorSync.ts    # Hook for MobX sync logic
```

### Files to Modify

```
src/ui/reactFlowEditor/ReactFlowEditor.tsx  # Refactor to use core
src/ui/components/CompositeEditor.tsx       # Replace CompositeInternalGraph
src/ui/reactFlowEditor/menus/BlockContextMenu.tsx   # Use adapter
src/ui/reactFlowEditor/menus/EdgeContextMenu.tsx    # Use adapter
src/ui/reactFlowEditor/menus/PortContextMenu.tsx    # Use adapter
```

### Files to Delete

```
src/ui/components/CompositeInternalGraph.tsx  # Replaced by GraphEditorCore
```

## Existing Code to Extract

### From ReactFlowEditor.tsx - Core Logic

**State and refs (lines 143-166):**
```typescript
const [nodes, setNodes, onNodesChange] = useNodesState([]);
const [edges, setEdges, onEdgesChange] = useEdgesState([]);
const [isLayouting, setIsLayouting] = useState(false);
const [isInitialized, setIsInitialized] = useState(false);
const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
const { fitView, setCenter } = useReactFlow();

const nodesRef = useRef(nodes);
const edgesRef = useRef(edges);
nodesRef.current = nodes;
edgesRef.current = edges;

const nodeTypes = useMemo(() => ({ oscilla: OscillaNode }), []);
```

**Sync handle setup (lines 160-166):**
```typescript
const syncHandle: SyncHandle = useMemo(() => ({
  patchStore,
  layoutStore,
  setNodes,
  setEdges,
  getNodes: () => nodesRef.current,
}), [patchStore, layoutStore, setNodes, setEdges]);
```

Replace with adapter-based version:
```typescript
const syncState = useMemo(() => ({
  adapter,
  setNodes,
  setEdges,
  getNodes: () => nodesRef.current,
}), [adapter, setNodes, setEdges]);
```

**Auto-arrange handler (lines 298-338):**
```typescript
const handleAutoArrange = useCallback(async () => {
  if (isLayouting) return;
  if (nodesRef.current.length === 0) return;

  setIsLayouting(true);
  try {
    if (nodesRef.current.length === 1) {
      setTimeout(() => fitView({ padding: 0.1 }), 50);
      return;
    }

    const { nodes: layoutedNodes } = await getLayoutedElements(
      nodesRef.current,
      edgesRef.current
    );
    setNodes(layoutedNodes);

    // Persist positions via adapter
    for (const node of layoutedNodes) {
      adapter.setBlockPosition(node.id, node.position);
    }

    setTimeout(() => fitView({ padding: 0.1 }), 50);
  } catch (error) {
    // Log error
  } finally {
    setIsLayouting(false);
  }
}, [isLayouting, setNodes, fitView, adapter]);
```

### From OscillaNode.tsx - Node Rendering

**Port rendering pattern (lines 159-236 for inputs, 358-418 for outputs):**
```typescript
{data.inputs.map((input, index) => {
  const topPercent = ((index + 1) * 100) / (data.inputs.length + 1);
  const isSelected = selectedPort?.blockId === data.blockId && selectedPort?.portId === input.id;
  const highlightStyle = getPortHighlightStyle(data.blockId, input.id as PortId, portHighlight);

  return (
    <React.Fragment key={`input-${input.id}`}>
      {/* Port Label */}
      <div style={{ /* label positioning */ }}>
        {input.label}
      </div>

      {/* Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id={input.id}
        onClick={(e) => handlePortClick(input.id as PortId, e)}
        onContextMenu={(e) => handlePortContextMenu(input.id as PortId, true, e)}
        onMouseEnter={(e) => handlePortMouseEnter(input, true, e)}
        onMouseLeave={handlePortMouseLeave}
        style={{ /* type-colored styling */ }}
      />

      {/* Default Source Indicator */}
      {!input.isConnected && input.defaultSource && (
        <div style={{ /* indicator styling */ }} />
      )}
    </React.Fragment>
  );
})}
```

**Parameter controls (lines 308-327):**
```typescript
{data.params.length > 0 && (
  <div style={{ /* container styling */ }}>
    {data.params.map((param) => (
      <ParameterControl
        key={param.id}
        blockId={data.blockId}
        paramId={param.id}
        label={param.label}
        value={param.value}
        hint={param.hint}
      />
    ))}
  </div>
)}
```

### From sync.ts - Reaction Setup

**Structure reaction (lines 294-324):**
```typescript
export function setupStructureReaction(
  handle: SyncHandle,
  diagnostics: DiagnosticsStore
): () => void {
  return reaction(
    () => ({
      blockCount: handle.patchStore.blocks.size,
      edgeCount: handle.patchStore.edges.length,
      combineModes: Array.from(handle.patchStore.blocks.values()).map(block =>
        Array.from(block.inputPorts.values()).map(port => port.combineMode).join(',')
      ).join('|'),
    }),
    () => {
      // Reconcile nodes
    }
  );
}
```

Adapter-based version:
```typescript
export function setupAdapterReaction(
  adapter: GraphDataAdapter,
  setNodes: SetState<Node[]>,
  setEdges: SetState<Edge[]>,
  getNodes: () => Node[],
  diagnostics: DiagnosticsStore
): () => void {
  return reaction(
    () => ({
      blockCount: adapter.blocks.size,
      edgeCount: adapter.edges.length,
    }),
    () => {
      // Reconcile using adapter data
    }
  );
}
```

## Context Provider Pattern

Create `src/ui/graphEditor/GraphEditorContext.tsx`:

```typescript
import { createContext, useContext, type ReactNode } from 'react';
import type { GraphDataAdapter } from './types';

interface GraphEditorContextValue {
  adapter: GraphDataAdapter;
  // Feature flags
  enableParamEditing: boolean;
  enableDebugMode: boolean;
  // Callbacks for stores that aren't in adapter
  onSelectBlock?: (blockId: string) => void;
  onSelectEdge?: (edgeId: string) => void;
}

const GraphEditorContext = createContext<GraphEditorContextValue | null>(null);

export function useGraphEditor(): GraphEditorContextValue {
  const ctx = useContext(GraphEditorContext);
  if (!ctx) {
    throw new Error('useGraphEditor must be used within GraphEditorProvider');
  }
  return ctx;
}

export function GraphEditorProvider({
  children,
  ...value
}: GraphEditorContextValue & { children: ReactNode }) {
  return (
    <GraphEditorContext.Provider value={value}>
      {children}
    </GraphEditorContext.Provider>
  );
}
```

## Node Data Transformation

Currently `nodes.ts` creates `OscillaNodeData` from `Block`. Need adapter-agnostic version:

```typescript
// From adapter's BlockLike, not PatchStore's Block
export function createNodeDataFromBlockLike(
  block: BlockLike,
  edges: readonly EdgeLike[],
  blocks: ReadonlyMap<string, BlockLike>
): UnifiedNodeData {
  const blockDef = getBlockDefinition(block.type);
  if (!blockDef) {
    // Return minimal node data for unknown block
    return { /* ... */ };
  }

  // Build connection info
  const inputConnections = new Map<string, ConnectionInfo>();
  for (const edge of edges) {
    if (edge.targetBlockId === block.id) {
      const sourceBlock = blocks.get(edge.sourceBlockId);
      inputConnections.set(edge.targetPortId, {
        blockId: edge.sourceBlockId,
        blockLabel: sourceBlock?.displayName || edge.sourceBlockId,
        portId: edge.sourcePortId,
        edgeId: edge.id,
      });
    }
  }

  // ... similar to createNodeFromBlock in nodes.ts
}
```

## Feature Flag Pattern in UnifiedNode

```typescript
interface UnifiedNodeProps extends NodeProps<UnifiedNodeData> {
  // Passed via nodeTypes registration
}

export const UnifiedNode: React.FC<UnifiedNodeProps> = ({ data }) => {
  const { adapter, enableParamEditing } = useGraphEditor();

  // Check adapter capabilities
  const canEditParams = enableParamEditing && typeof adapter.updateBlockParams === 'function';
  const canEditDisplayName = typeof adapter.updateBlockDisplayName === 'function';
  const canEditCombineMode = typeof adapter.updateInputPortCombineMode === 'function';

  return (
    <div className="unified-node">
      {/* Always render: ports, label */}
      {renderPorts(data.inputs, 'input')}
      {renderLabel(data, canEditDisplayName)}
      {renderPorts(data.outputs, 'output')}

      {/* Conditionally render: params */}
      {canEditParams && data.params.length > 0 && (
        <ParameterControls
          params={data.params}
          blockId={data.blockId}
          onUpdate={(paramId, value) => adapter.updateBlockParams!(data.blockId, { [paramId]: value })}
        />
      )}
    </div>
  );
};
```

## Testing Strategy

1. **Unit tests for GraphEditorCore:**
   - Mock adapter
   - Verify MobX reaction setup
   - Verify callback forwarding

2. **Integration tests:**
   - ReactFlowEditor + PatchStoreAdapter end-to-end
   - CompositeEditor + CompositeStoreAdapter end-to-end

3. **Visual regression tests:**
   - Screenshot main editor before/after
   - Screenshot composite editor before/after

4. **Performance benchmarks:**
   - Node render time with 100 nodes
   - Edge update latency
   - Memory usage comparison
