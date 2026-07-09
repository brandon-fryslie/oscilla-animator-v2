/**
 * nodeDataTransform - Transform adapter data to ReactFlow nodes/edges
 *
 * Works with the neutral adapter vocabulary (BlockLike/EdgeLike and their
 * self-describing ports) rather than any backend's block/port model.
 *
 * ARCHITECTURAL: Single source of truth is the adapter. This module only
 * transforms data for presentation, never stores state, and NEVER consults a
 * backend block registry — a BlockLike carries everything needed to render it.
 * [LAW:composability]
 */

import type { Node, Edge as ReactFlowEdge } from 'reactflow';
import type {
  BlockLike,
  EdgeLike,
  GraphDataAdapter,
  ParamData,
  PortDecoration,
  PortTypeDisplay,
} from './types';
import type { OscillaEdgeData } from '../reactFlowEditor/nodes';
import type { Diagnostic } from '../../diagnostics/types';

/**
 * Connection info for a port
 */
export interface PortConnectionInfo {
  blockId: string;
  blockLabel: string;
  portId: string;
  edgeId: string;
}

/** Neutral fallback color for ports with no resolved type. */
const UNTYPED_PORT_COLOR = '#888888';

/**
 * Port data for ReactFlow rendering. Neutral: carries presentation-ready type
 * color/tooltip and a decoration list; no backend type objects.
 */
export interface PortData {
  id: string;
  label: string;
  /** Handle/swatch color (from the port's neutral type display). */
  typeColor: string;
  /** Type tooltip text (from the port's neutral type display). */
  typeTooltip: string;
  /** Full neutral type display, when known. */
  typeDisplay?: PortTypeDisplay;
  /** Visual annotations painted beside the handle. */
  decorations: readonly PortDecoration[];
  isConnected: boolean;
  connection?: PortConnectionInfo;
}

/**
 * Custom data stored in each ReactFlow node.
 */
export interface UnifiedNodeData {
  blockId: string;
  blockType: string;
  label: string;
  displayName: string;
  commentText?: string;
  inputs: PortData[];
  outputs: PortData[];
  params: ParamData[];
}

/**
 * ReactFlow node type for unified editor.
 */
export type UnifiedNode = Node<UnifiedNodeData>;

function portData(
  id: string,
  label: string,
  typeDisplay: PortTypeDisplay | undefined,
  decorations: readonly PortDecoration[],
  isConnected: boolean,
  connection?: PortConnectionInfo,
): PortData {
  return {
    id,
    label,
    typeColor: typeDisplay?.color ?? UNTYPED_PORT_COLOR,
    typeTooltip: typeDisplay?.tooltip ?? label,
    typeDisplay,
    decorations,
    isConnected,
    connection,
  };
}

/**
 * Create ReactFlow node from a neutral BlockLike. Enumerates ports from the
 * block itself (self-describing) — no registry lookup.
 */
export function createNodeFromBlockLike(
  block: BlockLike,
  edges: readonly EdgeLike[],
  blocks: ReadonlyMap<string, BlockLike>,
  position: { x: number; y: number }
): UnifiedNode {
  // Build connection info maps for this block's ports
  const inputConnections = new Map<string, PortConnectionInfo>();
  const outputConnections = new Map<string, PortConnectionInfo>();

  for (const edge of edges) {
    // Input connection: edge goes TO this block. An input can legally have
    // multiple incoming edges (combine); keep the first for a stable summary.
    if (edge.targetBlockId === block.id && !inputConnections.has(edge.targetPortId)) {
      const sourceBlock = blocks.get(edge.sourceBlockId);
      inputConnections.set(edge.targetPortId, {
        blockId: edge.sourceBlockId,
        blockLabel: sourceBlock?.displayName || edge.sourceBlockId,
        portId: edge.sourcePortId,
        edgeId: edge.id,
      });
    }

    // Output connection: edge goes FROM this block. Keep the first for summary.
    if (edge.sourceBlockId === block.id && !outputConnections.has(edge.sourcePortId)) {
      const targetBlock = blocks.get(edge.targetBlockId);
      outputConnections.set(edge.sourcePortId, {
        blockId: edge.targetBlockId,
        blockLabel: targetBlock?.displayName || edge.targetBlockId,
        portId: edge.targetPortId,
        edgeId: edge.id,
      });
    }
  }

  // Build input ports directly from the self-describing block.
  const inputs: PortData[] = [];
  for (const [inputId, port] of block.inputPorts) {
    const connection = inputConnections.get(inputId);
    inputs.push(
      portData(
        inputId,
        port.label,
        port.typeDisplay,
        port.decorations ?? [],
        connection !== undefined,
        connection,
      )
    );
  }

  // Build output ports directly from the self-describing block.
  const outputs: PortData[] = [];
  for (const [outputId, port] of block.outputPorts) {
    const connection = outputConnections.get(outputId);
    outputs.push(
      portData(
        outputId,
        port.label,
        port.typeDisplay,
        [],
        connection !== undefined,
        connection,
      )
    );
  }

  // Inline controls: block-level config controls, plus per-port controls for
  // exposed inputs that are currently unconnected. The provider owns which
  // controls exist and where they write. [LAW:one-source-of-truth]
  const params: ParamData[] = [...block.controls];
  for (const [inputId, port] of block.inputPorts) {
    if (inputConnections.has(inputId)) continue;
    if (port.controls) params.push(...port.controls);
  }

  const commentText = block.type === 'Comment'
    ? (typeof block.params.text === 'string'
      ? block.params.text
      : typeof block.params.message === 'string'
        ? block.params.message
        : undefined)
    : undefined;

  return {
    id: block.id,
    type: 'unified', // All nodes use unified node component
    position,
    data: {
      blockId: block.id,
      blockType: block.type,
      label: block.typeLabel,
      displayName: block.displayName,
      commentText,
      inputs,
      outputs,
      params,
    },
  };
}

/**
 * Create ReactFlow edge from a neutral EdgeLike.
 */
export function createEdgeFromEdgeLike(
  edge: EdgeLike,
  blocks?: ReadonlyMap<string, BlockLike>,
  diagnosticsGetter?: (edge: EdgeLike) => Diagnostic[]
): ReactFlowEdge<OscillaEdgeData> | null {
  const sourceBlock = blocks?.get(edge.sourceBlockId);
  const targetBlock = blocks?.get(edge.targetBlockId);

  // [LAW:single-enforcer] GraphEditor transform is the single boundary that
  // enforces ReactFlow handle validity for projected edges.
  if (sourceBlock && !sourceBlock.outputPorts.has(edge.sourcePortId)) return null;
  if (targetBlock && !targetBlock.inputPorts.has(edge.targetPortId)) return null;

  const diagnostics = diagnosticsGetter ? diagnosticsGetter(edge) : undefined;

  return {
    id: edge.id,
    source: edge.sourceBlockId,
    sourceHandle: edge.sourcePortId,
    target: edge.targetBlockId,
    targetHandle: edge.targetPortId,
    type: 'oscilla',
    animated: false,
    data: {
      diagnostics,
    },
  };
}

/**
 * Reconcile nodes from adapter data. Updates existing nodes in-place to
 * preserve position, creates new nodes.
 */
export function reconcileNodesFromAdapter(
  adapter: GraphDataAdapter,
  currentNodes: Node[],
  getBlockPosition: (blockId: string) => { x: number; y: number } | undefined,
  diagnosticsGetter?: (edge: EdgeLike) => Diagnostic[],
): { nodes: Node[]; edges: ReactFlowEdge[]; droppedInvalidEdgeIds: readonly string[] } {
  const existingNodeMap = new Map<string, Node>();
  for (const node of currentNodes) {
    existingNodeMap.set(node.id, node);
  }

  const nodes: Node[] = [];

  for (const [blockId, block] of adapter.blocks) {
    // Determine position: preserve dragged position; else stored; else origin.
    const existingNode = existingNodeMap.get(blockId);
    const position = existingNode?.position
      ?? getBlockPosition(blockId)
      ?? { x: 100, y: 100 };

    // Carry over the interactive selection flag: a data-only reconcile (an edit
    // elsewhere, a frontend recompile bumping dataVersion) must not silently clear
    // the user's multi-selection, which the clipboard/duplicate ops read from.
    // [LAW:one-source-of-truth] ReactFlow owns the selection set; reconcile preserves it.
    nodes.push({
      ...createNodeFromBlockLike(block, adapter.edges, adapter.blocks, position),
      selected: existingNode?.selected ?? false,
    });
  }

  // Create edges, filtering invalid endpoints.
  const edges: ReactFlowEdge[] = [];
  const droppedInvalidEdgeIds: string[] = [];
  for (const edge of adapter.edges) {
    const projected = createEdgeFromEdgeLike(edge, adapter.blocks, diagnosticsGetter);
    if (projected) {
      edges.push(projected);
    } else {
      droppedInvalidEdgeIds.push(edge.id);
    }
  }

  return { nodes, edges, droppedInvalidEdgeIds };
}
