/**
 * ReactFlow Node Types for Oscilla Blocks
 *
 * Maps Oscilla blocks to ReactFlow node format.
 * Each node corresponds to a block in PatchStore.
 */

import type { Node, Edge as ReactFlowEdge } from 'reactflow';
import type { Block, BlockId, Edge, DefaultSource, UIControlHint } from '../../types';
import type { BlockDef, InputDef } from '../../blocks/registry';
import type { PayloadType, SignalType } from '../../core/canonical-types';
import { signalType } from '../../core/canonical-types';
import { formatTypeForTooltip, getTypeColor, getPortTypeFromBlockType, formatUnitForDisplay } from './typeValidation';
import { findAdapter } from '../../graph/adapters';

/**
 * Connection info for a port
 */
export interface PortConnectionInfo {
  /** Block ID of the connected block */
  blockId: string;
  /** Block display name */
  blockLabel: string;
  /** Port ID on the connected block */
  portId: string;
  /** Edge ID for debug value lookup */
  edgeId: string;
}

/**
 * Port data for ReactFlow rendering
 */
export interface PortData {
  id: string;
  label: string;
  defaultSource?: DefaultSource;
  /** Payload type for coloring handles */
  payloadType: PayloadType;
  /** Full type for tooltip */
  typeTooltip: string;
  /** Color for handle based on type */
  typeColor: string;
  /** Whether this port is connected to an edge */
  isConnected: boolean;
  /** Connection info if connected */
  connection?: PortConnectionInfo;
  /** UI hint for default source control (min/max/step) */
  uiHint?: UIControlHint;
}

/**
 * Parameter data for ReactFlow rendering
 */
export interface ParamData {
  id: string;
  label: string;
  value: unknown;
  hint?: UIControlHint;
}

/**
 * Custom data stored in each ReactFlow node.
 * Links back to the canonical block in PatchStore.
 */
export interface OscillaNodeData {
  blockId: BlockId;
  blockType: string;
  label: string;
  inputs: PortData[];
  outputs: PortData[];
  params: ParamData[];
}

/**
 * ReactFlow node type for Oscilla blocks.
 */
export type OscillaNode = Node<OscillaNodeData>;

/**
 * Get effective default source for an input port.
 * Instance override takes precedence over registry default.
 */
function getEffectiveDefaultSource(
  block: Block,
  inputId: string,
  input: InputDef
): DefaultSource | undefined {
  // Instance-level override takes precedence
  const instanceOverride = block.inputPorts.get(inputId)?.defaultSource;
  if (instanceOverride) {
    return instanceOverride;
  }
  // Fall back to registry default
  return (input as InputDef & { defaultSource?: DefaultSource }).defaultSource;
}

/**
 * Create port data with type information.
 */
function createPortData(
  id: string,
  label: string,
  type: SignalType | undefined,
  isConnected: boolean,
  defaultSource?: DefaultSource,
  connection?: PortConnectionInfo,
  uiHint?: UIControlHint
): PortData {
  // For inputs without a type (non-port inputs), use a default
  const effectiveType: SignalType = type || signalType('float');

  return {
    id,
    label,
    defaultSource,
    payloadType: effectiveType.payload,
    typeTooltip: formatTypeForTooltip(effectiveType),
    typeColor: getTypeColor(effectiveType.payload),
    isConnected,
    connection,
    uiHint,
  };
}

/**
 * Create ReactFlow node from Oscilla block.
 *
 * @param block - The block to convert
 * @param blockDef - Block definition from registry
 * @param edges - All edges in the patch (for connection info)
 * @param blocks - All blocks in the patch (for looking up connected block labels)
 * @param blockDefs - Block definitions map (for looking up connected block labels)
 */
export function createNodeFromBlock(
  block: Block,
  blockDef: BlockDef,
  edges?: readonly Edge[],
  blocks?: ReadonlyMap<BlockId, Block>,
  blockDefs?: ReadonlyMap<string, BlockDef>
): OscillaNode {
  // Build connection info maps for this block's ports
  const inputConnections = new Map<string, PortConnectionInfo>();
  const outputConnections = new Map<string, PortConnectionInfo>();

  if (edges && blocks && blockDefs) {
    for (const edge of edges) {
      // Input connection: edge goes TO this block
      if (edge.to.blockId === block.id) {
        const sourceBlock = blocks.get(edge.from.blockId as BlockId);
        const sourceBlockDef = sourceBlock ? blockDefs.get(sourceBlock.type) : undefined;
        inputConnections.set(edge.to.slotId, {
          blockId: edge.from.blockId,
          blockLabel: sourceBlock?.displayName || sourceBlockDef?.label || edge.from.blockId,
          portId: edge.from.slotId,
          edgeId: edge.id,
        });
      }
      // Output connection: edge comes FROM this block
      if (edge.from.blockId === block.id) {
        const targetBlock = blocks.get(edge.to.blockId as BlockId);
        const targetBlockDef = targetBlock ? blockDefs.get(targetBlock.type) : undefined;
        outputConnections.set(edge.from.slotId, {
          blockId: edge.to.blockId,
          blockLabel: targetBlock?.displayName || targetBlockDef?.label || edge.to.blockId,
          portId: edge.to.slotId,
          edgeId: edge.id,
        });
      }
    }
  }

  // Extract parameters from block.params and match with input definitions
  const params: ParamData[] = [];
  for (const [inputId, inputDef] of Object.entries(blockDef.inputs)) {
    // Only include params for non-port inputs (config-only inputs)
    if (inputDef.exposedAsPort === false && block.params[inputId] !== undefined) {
      params.push({
        id: inputId,
        label: inputDef.label || inputId,
        value: block.params[inputId],
        hint: inputDef.uiHint,
      });
    }
  }

  return {
    id: block.id,
    type: 'oscilla',
    position: { x: 0, y: 0 }, // Will be set by layout
    data: {
      blockId: block.id,
      blockType: block.type,
      label: block.displayName || blockDef.label,
      inputs: Object.entries(blockDef.inputs).map(([inputId, input]) =>
        createPortData(
          inputId,
          input.label || inputId,
          input.type,
          inputConnections.has(inputId),
          getEffectiveDefaultSource(block, inputId, input),
          inputConnections.get(inputId),
          input.uiHint
        )
      ),
      outputs: Object.entries(blockDef.outputs).map(([outputId, output]) =>
        createPortData(
          outputId,
          output.label || outputId,
          output.type,
          outputConnections.has(outputId),
          undefined,
          outputConnections.get(outputId)
        )
      ),
      params,
    },
  };
}

/**
 * Create ReactFlow edge from Oscilla edge.
 * Optionally computes adapter label from source/target block types.
 */
export function createEdgeFromPatchEdge(
  edge: Edge,
  blocks?: ReadonlyMap<BlockId, Block>
): ReactFlowEdge {
  const rfEdge: ReactFlowEdge = {
    id: edge.id,
    source: edge.from.blockId,
    target: edge.to.blockId,
    sourceHandle: edge.from.slotId,
    targetHandle: edge.to.slotId,
    type: 'default',
  };

  // Compute adapter label if block context is available
  if (blocks) {
    const sourceBlock = blocks.get(edge.from.blockId as BlockId);
    const targetBlock = blocks.get(edge.to.blockId as BlockId);
    if (sourceBlock && targetBlock) {
      const sourceType = getPortTypeFromBlockType(sourceBlock.type, edge.from.slotId, 'output');
      const targetType = getPortTypeFromBlockType(targetBlock.type, edge.to.slotId, 'input');
      if (sourceType && targetType) {
        const adapter = findAdapter(sourceType, targetType);
        if (adapter) {
          const fromUnit = formatUnitForDisplay(sourceType.unit);
          const toUnit = formatUnitForDisplay(targetType.unit);
          rfEdge.label = `${fromUnit}→${toUnit}`;
          rfEdge.labelStyle = { fontSize: 10, fill: '#888' };
          rfEdge.style = { stroke: '#f59e0b', strokeDasharray: '4 2' };
        }
      }
    }
  }

  return rfEdge;
}

/**
 * Get handle ID for ReactFlow.
 * ReactFlow uses handle IDs to match source/target connections.
 */
export function getHandleId(slotId: string, direction: 'input' | 'output'): string {
  return `${direction}-${slotId}`;
}
