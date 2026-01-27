/**
 * CompositeInternalGraph
 *
 * ReactFlow canvas for editing the internal graph of a composite block.
 * Reuses type validation and node rendering patterns from the main ReactFlow editor.
 */

import { useCallback, useEffect, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge as ReactFlowEdge,
  type OnConnect,
  type OnNodesChange,
  type OnEdgesChange,
  type Connection,
  applyNodeChanges,
  applyEdgeChanges,
  Position,
  Handle,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { observer } from 'mobx-react-lite';
import { reaction, toJS } from 'mobx';
import { useStores } from '../../stores';
import type { InternalBlockId, InternalEdge } from '../../blocks/composite-types';
import { getBlockDefinition } from '../../blocks/registry';
import { getTypeColor, formatTypeForTooltip } from '../reactFlowEditor/typeValidation';
import { signalType, FLOAT } from '../../core/canonical-types';
import type { SignalType } from '../../core/canonical-types';

// =============================================================================
// Types
// =============================================================================

interface InternalNodeData {
  internalBlockId: InternalBlockId;
  blockType: string;
  label: string;
  displayName?: string;
  inputs: Array<{
    id: string;
    label: string;
    typeColor: string;
    typeTooltip: string;
    isConnected: boolean;
  }>;
  outputs: Array<{
    id: string;
    label: string;
    typeColor: string;
    typeTooltip: string;
    isConnected: boolean;
  }>;
}

type InternalNode = Node<InternalNodeData>;

// =============================================================================
// Custom Node Component
// =============================================================================

/**
 * Simplified node component for composite internal graph.
 * Similar to OscillaNode but without the full feature set.
 */
const InternalBlockNode = ({ data }: NodeProps<InternalNodeData>) => {
  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: '8px',
        border: '1px solid rgba(78, 205, 196, 0.3)',
        background: 'linear-gradient(180deg, #1e1e3a 0%, #1a1a2e 100%)',
        color: '#e2e8f0',
        minWidth: '140px',
        fontSize: '12px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
      }}
    >
      {/* Input Handles */}
      {data.inputs.map((input, index) => {
        const topPercent = ((index + 1) * 100) / (data.inputs.length + 1);
        return (
          <div key={`input-${input.id}`}>
            <div
              style={{
                position: 'absolute',
                left: '-6px',
                top: `${topPercent}%`,
                transform: 'translate(-100%, -50%)',
                fontSize: '10px',
                color: '#888',
                whiteSpace: 'nowrap',
                paddingRight: '4px',
              }}
            >
              {input.label}
            </div>
            <Handle
              type="target"
              position={Position.Left}
              id={input.id}
              style={{
                top: `${topPercent}%`,
                background: input.isConnected ? input.typeColor : '#333',
                width: '12px',
                height: '12px',
                border: `2px solid ${input.typeColor}`,
                borderRadius: '50%',
              }}
              title={input.typeTooltip}
            />
          </div>
        );
      })}

      {/* Block Label */}
      <div
        style={{
          fontWeight: 500,
          textAlign: 'center',
          color: '#fff',
          marginBottom: data.displayName ? '2px' : 0,
        }}
      >
        {data.label}
      </div>
      {data.displayName && (
        <div
          style={{
            fontSize: '10px',
            textAlign: 'center',
            color: '#888',
          }}
        >
          {data.displayName}
        </div>
      )}

      {/* Output Handles */}
      {data.outputs.map((output, index) => {
        const topPercent = ((index + 1) * 100) / (data.outputs.length + 1);
        return (
          <div key={`output-${output.id}`}>
            <div
              style={{
                position: 'absolute',
                right: '-6px',
                top: `${topPercent}%`,
                transform: 'translate(100%, -50%)',
                fontSize: '10px',
                color: '#888',
                whiteSpace: 'nowrap',
                paddingLeft: '4px',
              }}
            >
              {output.label}
            </div>
            <Handle
              type="source"
              position={Position.Right}
              id={output.id}
              style={{
                top: `${topPercent}%`,
                background: output.isConnected ? output.typeColor : '#333',
                width: '12px',
                height: '12px',
                border: `2px solid ${output.typeColor}`,
                borderRadius: '50%',
              }}
              title={output.typeTooltip}
            />
          </div>
        );
      })}
    </div>
  );
};

const nodeTypes = {
  internalBlock: InternalBlockNode,
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a ReactFlow node from an internal block.
 */
function createNodeFromInternalBlock(
  block: { id: InternalBlockId; type: string; position: { x: number; y: number }; displayName?: string },
  connectedInputs: Set<string>,
  connectedOutputs: Set<string>
): InternalNode {
  const blockDef = getBlockDefinition(block.type);
  if (!blockDef) {
    return {
      id: block.id,
      type: 'internalBlock',
      position: block.position,
      data: {
        internalBlockId: block.id,
        blockType: block.type,
        label: block.type,
        displayName: block.displayName,
        inputs: [],
        outputs: [],
      },
    };
  }

  const inputs = Object.entries(blockDef.inputs)
    .filter(([, input]) => input.exposedAsPort !== false)
    .map(([portId, input]) => {
      const type: SignalType = input.type || signalType(FLOAT);
      return {
        id: portId,
        label: input.label || portId,
        typeColor: getTypeColor(type.payload),
        typeTooltip: formatTypeForTooltip(type),
        isConnected: connectedInputs.has(portId),
      };
    });

  const outputs = Object.entries(blockDef.outputs).map(([portId, output]) => {
    const type: SignalType = output.type || signalType(FLOAT);
    return {
      id: portId,
      label: output.label || portId,
      typeColor: getTypeColor(type.payload),
      typeTooltip: formatTypeForTooltip(type),
      isConnected: connectedOutputs.has(portId),
    };
  });

  return {
    id: block.id,
    type: 'internalBlock',
    position: block.position,
    data: {
      internalBlockId: block.id,
      blockType: block.type,
      label: blockDef.label || block.type,
      displayName: block.displayName,
      inputs,
      outputs,
    },
  };
}

/**
 * Create a ReactFlow edge from an internal edge.
 */
function createEdgeFromInternalEdge(edge: InternalEdge, index: number): ReactFlowEdge {
  return {
    id: `edge-${edge.fromBlock}-${edge.fromPort}-${edge.toBlock}-${edge.toPort}-${index}`,
    source: edge.fromBlock,
    target: edge.toBlock,
    sourceHandle: edge.fromPort,
    targetHandle: edge.toPort,
    style: { stroke: '#4ade80', strokeWidth: 2 },
  };
}

/**
 * Validate a connection between two ports.
 */
function validateInternalConnection(
  sourceBlockType: string,
  sourcePortId: string,
  targetBlockType: string,
  targetPortId: string
): boolean {
  const sourceDef = getBlockDefinition(sourceBlockType);
  const targetDef = getBlockDefinition(targetBlockType);

  if (!sourceDef || !targetDef) return false;

  const sourcePort = sourceDef.outputs[sourcePortId];
  const targetPort = targetDef.inputs[targetPortId];

  if (!sourcePort || !targetPort) return false;

  // For now, allow all connections (type checking happens at composite expansion)
  // A more sophisticated implementation would check type compatibility here
  return true;
}

// =============================================================================
// Main Component
// =============================================================================

export const CompositeInternalGraph = observer(function CompositeInternalGraph() {
  const { compositeEditor } = useStores();
  const [nodes, setNodes] = useState<InternalNode[]>([]);
  const [edges, setEdges] = useState<ReactFlowEdge[]>([]);

  // Sync nodes and edges from store using MobX reaction (tracks Map changes properly)
  useEffect(() => {
    const dispose = reaction(
      // Data function: what to track
      () => ({
        blocks: Array.from(compositeEditor.internalBlocks.entries()).map(([id, block]) => ({
          id,
          type: block.type,
          position: toJS(block.position),
          displayName: block.displayName,
        })),
        edges: toJS(compositeEditor.internalEdges),
      }),
      // Effect function: what to do when data changes
      ({ blocks, edges }) => {
        // Recompute connected ports
        const connectedInputs = new Map<InternalBlockId, Set<string>>();
        const connectedOutputs = new Map<InternalBlockId, Set<string>>();

        for (const edge of edges) {
          if (!connectedOutputs.has(edge.fromBlock)) {
            connectedOutputs.set(edge.fromBlock, new Set());
          }
          connectedOutputs.get(edge.fromBlock)!.add(edge.fromPort);

          if (!connectedInputs.has(edge.toBlock)) {
            connectedInputs.set(edge.toBlock, new Set());
          }
          connectedInputs.get(edge.toBlock)!.add(edge.toPort);
        }

        // Create nodes
        const newNodes: InternalNode[] = blocks.map((block) =>
          createNodeFromInternalBlock(
            block,
            connectedInputs.get(block.id) || new Set(),
            connectedOutputs.get(block.id) || new Set()
          )
        );
        setNodes(newNodes);

        // Create edges
        const newEdges = edges.map((edge, index) =>
          createEdgeFromInternalEdge(edge, index)
        );
        setEdges(newEdges);
      },
      { fireImmediately: true } // Run immediately on mount
    );

    return dispose;
  }, [compositeEditor]);

  // Handle node changes (drag, delete)
  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setNodes((nds) => applyNodeChanges(changes, nds));

      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          compositeEditor.updateBlockPosition(
            change.id as InternalBlockId,
            change.position
          );
        } else if (change.type === 'remove') {
          compositeEditor.removeBlock(change.id as InternalBlockId);
        }
      }
    },
    [compositeEditor]
  );

  // Handle edge changes (delete)
  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));

      for (const change of changes) {
        if (change.type === 'remove') {
          // Find the edge to remove from store
          const edge = compositeEditor.internalEdges.find((e, i) => {
            const edgeId = `edge-${e.fromBlock}-${e.fromPort}-${e.toBlock}-${e.toPort}-${i}`;
            return edgeId === change.id;
          });
          if (edge) {
            compositeEditor.removeEdge(
              edge.fromBlock,
              edge.fromPort,
              edge.toBlock,
              edge.toPort
            );
          }
        }
      }
    },
    [compositeEditor]
  );

  // Handle new connections
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (!connection.sourceHandle || !connection.targetHandle) return;

      // Get block types for validation
      const sourceBlock = compositeEditor.internalBlocks.get(connection.source as InternalBlockId);
      const targetBlock = compositeEditor.internalBlocks.get(connection.target as InternalBlockId);

      if (!sourceBlock || !targetBlock) return;

      // Validate connection
      if (!validateInternalConnection(
        sourceBlock.type,
        connection.sourceHandle,
        targetBlock.type,
        connection.targetHandle
      )) {
        return;
      }

      // Add edge to store
      compositeEditor.addEdge({
        fromBlock: connection.source as InternalBlockId,
        fromPort: connection.sourceHandle,
        toBlock: connection.target as InternalBlockId,
        toPort: connection.targetHandle,
      });
    },
    [compositeEditor]
  );

  // Check if connection is valid (for visual feedback)
  const isValidConnection = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return false;
      if (!connection.sourceHandle || !connection.targetHandle) return false;

      // Prevent self-connections
      if (connection.source === connection.target) return false;

      const sourceBlock = compositeEditor.internalBlocks.get(connection.source as InternalBlockId);
      const targetBlock = compositeEditor.internalBlocks.get(connection.target as InternalBlockId);

      if (!sourceBlock || !targetBlock) return false;

      return validateInternalConnection(
        sourceBlock.type,
        connection.sourceHandle,
        targetBlock.type,
        connection.targetHandle
      );
    },
    [compositeEditor]
  );

  // Handle drop from block library
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const blockType = event.dataTransfer.getData('application/oscilla-block-type');
      if (!blockType) return;

      // Get drop position relative to the canvas
      const reactFlowBounds = event.currentTarget.getBoundingClientRect();
      const position = {
        x: event.clientX - reactFlowBounds.left - 75, // Center the node
        y: event.clientY - reactFlowBounds.top - 30,
      };

      compositeEditor.addBlock(blockType, position);
    },
    [compositeEditor]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  return (
    <div style={{ width: '100%', height: '100%' }} onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        defaultEdgeOptions={{
          style: { stroke: '#4ade80', strokeWidth: 2 },
          type: 'default',
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#333" gap={16} />
        <Controls />
        <MiniMap
          nodeColor="#4ade80"
          maskColor="rgba(0, 0, 0, 0.7)"
          style={{ background: '#1a1a2e' }}
        />
      </ReactFlow>
    </div>
  );
});
