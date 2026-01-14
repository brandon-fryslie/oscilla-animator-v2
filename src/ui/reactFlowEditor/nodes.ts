/**
 * ReactFlow Node Types for Oscilla Blocks
 *
 * Maps Oscilla blocks to ReactFlow node format.
 * Each node corresponds to a block in PatchStore.
 */

import type { Node, Edge as ReactFlowEdge } from 'reactflow';
import type { Block, BlockId, Edge } from '../../types';
import type { BlockDef } from '../../blocks/registry';

/**
 * Custom data stored in each ReactFlow node.
 * Links back to the canonical block in PatchStore.
 */
export interface OscillaNodeData {
  blockId: BlockId;
  blockType: string;
  label: string;
  inputs: Array<{ id: string; label: string }>;
  outputs: Array<{ id: string; label: string }>;
}

/**
 * ReactFlow node type for Oscilla blocks.
 */
export type OscillaNode = Node<OscillaNodeData>;

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
      inputs: blockDef.inputs.map((input) => ({
        id: input.id,
        label: input.label,
      })),
      outputs: blockDef.outputs.map((output) => ({
        id: output.id,
        label: output.label,
      })),
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
