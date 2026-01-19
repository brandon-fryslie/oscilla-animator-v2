/**
 * ReactFlow Node Types for Oscilla Blocks
 *
 * Maps Oscilla blocks to ReactFlow node format.
 * Each node corresponds to a block in PatchStore.
 */

import type { Node, Edge as ReactFlowEdge } from 'reactflow';
import type { Block, BlockId, Edge, DefaultSource } from '../../types';
import type { BlockDef, InputDef } from '../../blocks/registry';
import type { PayloadType, SignalType } from '../../core/canonical-types';
import { formatTypeForTooltip, getTypeColor } from './typeValidation';

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
}

/**
 * ReactFlow node type for Oscilla blocks.
 */
export type OscillaNode = Node<OscillaNodeData>;

/**
 * Get default source for an input from registry.
 */
function getDefaultSource(
  input: InputDef
): DefaultSource | undefined {
  // Get default source from registry (block definition)
  return (input as InputDef & { defaultSource?: DefaultSource }).defaultSource;
}

/**
 * Create port data with type information.
 */
function createPortData(
  id: string,
  label: string,
  type: SignalType,
  defaultSource?: DefaultSource
): PortData {
  return {
    id,
    label,
    defaultSource,
    payloadType: type.payload,
    typeTooltip: formatTypeForTooltip(type),
    typeColor: getTypeColor(type.payload),
  };
}

/**
 * Create ReactFlow node from Oscilla block.
 */
export function createNodeFromBlock(block: Block, blockDef: BlockDef): OscillaNode {
  return {
    id: block.id,
    type: 'oscilla',
    position: { x: 0, y: 0 }, // Will be set by layout
    data: {
      blockId: block.id,
      blockType: block.type,
      label: block.displayName || blockDef.label,
      inputs: blockDef.inputs.map((input) =>
        createPortData(input.id, input.label, input.type, getDefaultSource(input))
      ),
      outputs: blockDef.outputs.map((output) =>
        createPortData(output.id, output.label, output.type)
      ),
    },
  };
}

/**
 * Create ReactFlow edge from Oscilla edge.
 */
export function createEdgeFromPatchEdge(edge: Edge): ReactFlowEdge {
  return {
    id: edge.id,
    source: edge.from.blockId,
    target: edge.to.blockId,
    sourceHandle: edge.from.slotId,
    targetHandle: edge.to.slotId,
    type: 'default',
  };
}

/**
 * Get handle ID for ReactFlow.
 * ReactFlow uses handle IDs to match source/target connections.
 */
export function getHandleId(slotId: string, direction: 'input' | 'output'): string {
  return `${direction}-${slotId}`;
}
