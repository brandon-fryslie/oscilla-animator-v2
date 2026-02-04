/**
 * nodeDataTransform - Transform adapter data to ReactFlow nodes/edges
 *
 * Adapter-agnostic version of nodes.ts transformation logic.
 * Works with BlockLike/EdgeLike instead of Block/Edge from PatchStore.
 *
 * ARCHITECTURAL: Single source of truth is the adapter.
 * This module only transforms data for presentation, never stores state.
 */

import type { Node, Edge as ReactFlowEdge } from 'reactflow';
import type { BlockLike, EdgeLike, GraphDataAdapter } from './types';
import type { DefaultSource, UIControlHint } from '../../types';
import type { LensAttachment } from '../../graph/Patch';
import { getAnyBlockDefinition, type AnyBlockDef, type InputDef } from '../../blocks/registry';
import { FLOAT, canonicalType } from '../../core/canonical-types';
import type { InferenceCanonicalType, InferencePayloadType } from '../../core/inference-types';
import { formatTypeForTooltip, getTypeColor } from '../reactFlowEditor/typeValidation';
import type { OscillaEdgeData } from '../reactFlowEditor/nodes';
import type { PortProvenance } from '../../stores/FrontendResultStore';

/**
 * Connection info for a port
 */
export interface PortConnectionInfo {
  blockId: string;
  blockLabel: string;
  portId: string;
  edgeId: string;
}

/**
 * Port data for ReactFlow rendering
 */
export interface PortData {
  id: string;
  label: string;
  defaultSource?: DefaultSource;
  payloadType: InferencePayloadType;
  typeTooltip: string;
  typeColor: string;
  isConnected: boolean;
  connection?: PortConnectionInfo;
  uiHint?: UIControlHint;
  lenses?: readonly LensAttachment[];
  resolvedType?: InferenceCanonicalType;
  provenance?: PortProvenance;
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
 * Adapter-agnostic version of OscillaNodeData.
 */
export interface UnifiedNodeData {
  blockId: string;
  blockType: string;
  label: string;
  displayName: string;
  inputs: PortData[];
  outputs: PortData[];
  params: ParamData[];
}

/**
 * ReactFlow node type for unified editor.
 */
export type UnifiedNode = Node<UnifiedNodeData>;

/**
 * Create port data with type information.
 */
function createPortData(
  id: string,
  label: string,
  type: InferenceCanonicalType | undefined,
  isConnected: boolean,
  defaultSource?: DefaultSource,
  connection?: PortConnectionInfo,
  uiHint?: UIControlHint,
  lenses?: readonly LensAttachment[],
  provenance?: PortProvenance
): PortData {
  // For inputs without a type (non-port inputs), use a default
  const effectiveType: InferenceCanonicalType = type || canonicalType(FLOAT);

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
    lenses,
    resolvedType: type,
    provenance,
  };
}

/**
 * Create ReactFlow node from adapter BlockLike.
 *
 * @param block - Block from adapter
 * @param blockDef - Block definition from registry
 * @param edges - All edges from adapter (for connection info)
 * @param blocks - All blocks from adapter (for looking up connected block labels)
 * @param position - Position for this node
 */
export function createNodeFromBlockLike(
  block: BlockLike,
  blockDef: AnyBlockDef,
  edges: readonly EdgeLike[],
  blocks: ReadonlyMap<string, BlockLike>,
  position: { x: number; y: number }
): UnifiedNode {
  // Build connection info maps for this block's ports
  const inputConnections = new Map<string, PortConnectionInfo>();
  const outputConnections = new Map<string, PortConnectionInfo>();

  for (const edge of edges) {
    // Input connection: edge goes TO this block
    if (edge.targetBlockId === block.id) {
      // An input can legally have multiple incoming edges (combine). For UI summary,
      // keep the first one we encounter to avoid nondeterministic overwrites.
      if (!inputConnections.has(edge.targetPortId)) {
        const sourceBlock = blocks.get(edge.sourceBlockId);
        inputConnections.set(edge.targetPortId, {
          blockId: edge.sourceBlockId,
          blockLabel: sourceBlock?.displayName || edge.sourceBlockId,
          portId: edge.sourcePortId,
          edgeId: edge.id,
        });
      }
    }

    // Output connection: edge goes FROM this block
    if (edge.sourceBlockId === block.id) {
      // An output can have many outgoing edges. For UI summary, keep the first.
      if (!outputConnections.has(edge.sourcePortId)) {
        const targetBlock = blocks.get(edge.targetBlockId);
        outputConnections.set(edge.sourcePortId, {
          blockId: edge.targetBlockId,
          blockLabel: targetBlock?.displayName || edge.targetBlockId,
          portId: edge.targetPortId,
          edgeId: edge.id,
        });
      }
    }
  }

  // Build input ports
  const inputs: PortData[] = [];
  for (const [inputId, inputDef] of Object.entries(blockDef.inputs)) {
    // Skip non-port inputs (internal only)
    if (inputDef.exposedAsPort === false) continue;

    const portState = block.inputPorts.get(inputId);
    const defaultSource = portState?.defaultSource || (inputDef as InputDef & { defaultSource?: DefaultSource }).defaultSource;
    const connection = inputConnections.get(inputId);
    const isConnected = connection !== undefined;

    inputs.push(
      createPortData(
        inputId,
        inputDef.label || inputId, // Fallback to inputId if label undefined
        portState?.resolvedType ?? inputDef.type,
        isConnected,
        defaultSource,
        connection,
        (inputDef as InputDef & { uiHint?: UIControlHint }).uiHint,
        portState?.lenses,
        portState?.provenance
      )
    );
  }

  // Build output ports
  const outputs: PortData[] = [];
  for (const [outputId, outputDef] of Object.entries(blockDef.outputs)) {
    const outputPortState = block.outputPorts.get(outputId);
    const connection = outputConnections.get(outputId);
    const isConnected = connection !== undefined;

    outputs.push(
      createPortData(
        outputId,
        outputDef.label || outputId, // Fallback to outputId if label undefined
        outputPortState?.resolvedType ?? outputDef.type,
        isConnected,
        undefined,
        connection
      )
    );
  }

  // Build params (blocks don't expose params in BlockDef directly - they're in the block instance)
  // For now, we'll skip params rendering unless explicitly needed
  const params: ParamData[] = [];
  // TODO: If param editing is needed, extract param metadata from block.params

  return {
    id: block.id,
    type: 'unified', // All nodes use unified node component
    position,
    data: {
      blockId: block.id,
      blockType: block.type,
      label: blockDef.label,
      displayName: block.displayName,
      inputs,
      outputs,
      params,
    },
  };
}

/**
 * Create ReactFlow edge from adapter EdgeLike.
 * Populates lens data from target port when blocks are available.
 */
export function createEdgeFromEdgeLike(
  edge: EdgeLike,
  blocks?: ReadonlyMap<string, BlockLike>
): ReactFlowEdge<OscillaEdgeData> {
  // Look up lenses from target port
  const targetBlock = blocks?.get(edge.targetBlockId);
  const targetPort = targetBlock?.inputPorts.get(edge.targetPortId);
  const lenses = targetPort?.lenses;
  const hasLenses = lenses != null && lenses.length > 0;

  return {
    id: edge.id,
    source: edge.sourceBlockId,
    sourceHandle: edge.sourcePortId,
    target: edge.targetBlockId,
    targetHandle: edge.targetPortId,
    type: 'oscilla',
    animated: false,
    data: {
      lenses: hasLenses ? lenses : undefined,
    },
  };
}

/**
 * Reconcile nodes from adapter data.
 * Updates existing nodes in-place to preserve position, creates new nodes.
 *
 * @param adapter - Data adapter
 * @param currentNodes - Current ReactFlow nodes
 * @param getBlockPosition - Function to get stored position for a block
 */
export function reconcileNodesFromAdapter(
  adapter: GraphDataAdapter,
  currentNodes: Node[],
  getBlockPosition: (blockId: string) => { x: number; y: number } | undefined
): { nodes: Node[]; edges: ReactFlowEdge[] } {
  // Build map of existing nodes by ID for fast lookup
  const existingNodeMap = new Map<string, Node>();
  for (const node of currentNodes) {
    existingNodeMap.set(node.id, node);
  }

  const nodes: Node[] = [];
  const patchBlockIds = new Set<string>();

  for (const [blockId, block] of adapter.blocks) {
    patchBlockIds.add(blockId);

    const blockDef = getAnyBlockDefinition(block.type);
    if (!blockDef) {
      console.warn(`Block definition not found: ${block.type}`);
      continue;
    }

    // Determine position
    let position: { x: number; y: number };
    const existingNode = existingNodeMap.get(blockId);
    if (existingNode) {
      // Preserve existing position (user may have dragged)
      position = existingNode.position;
    } else {
      // New block - check adapter for stored position
      const storedPosition = getBlockPosition(blockId);
      if (storedPosition) {
        position = storedPosition;
      } else {
        // Fallback: place at origin (should be rare)
        position = { x: 100, y: 100 };
      }
    }

    const node = createNodeFromBlockLike(block, blockDef, adapter.edges, adapter.blocks, position);
    nodes.push(node);
  }

  // Create edges (pass blocks for lens data population)
  const edges = adapter.edges.map(e => createEdgeFromEdgeLike(e, adapter.blocks));

  return { nodes, edges };
}
