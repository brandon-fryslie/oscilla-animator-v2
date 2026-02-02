/**
 * ReactFlow Node Types for Oscilla Blocks
 *
 * Maps Oscilla blocks to ReactFlow node format.
 * Each node corresponds to a block in PatchStore.
 */

import type { Node, Edge as ReactFlowEdge } from 'reactflow';
import type { Block, BlockId, Edge, DefaultSource, UIControlHint, CombineMode } from '../../types';
import type { Patch, LensAttachment } from '../../graph/Patch';
import type { InputDef, AnyBlockDef } from '../../blocks/registry';
import type { InferenceCanonicalType, InferencePayloadType } from '../../core/inference-types';
import { formatTypeForTooltip, getTypeColor, getPortTypeFromBlockType, formatUnitForDisplay } from './typeValidation';
import { findAdapter } from '../../blocks/adapter-spec';
import { sortEdgesBySortKey } from '../../compiler/passes-v2/combine-utils';
import { getLensLabel } from './lensUtils';

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
  payloadType: InferencePayloadType;
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
  /** Number of lenses attached to this port (input ports only) */
  lensCount?: number;
  /** Lenses attached to this port (input ports only) */
  lenses?: readonly LensAttachment[];
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
  displayName: string; // User-editable display name (always has value)
  inputs: PortData[];
  outputs: PortData[];
  params: ParamData[];
}

/**
 * Custom data stored in each ReactFlow edge.
 * Used for lens visualization and other edge metadata.
 */
export interface OscillaEdgeData {
  /** Lenses attached to the target port for this connection */
  lenses?: readonly LensAttachment[];
  /** Whether this edge has an auto-inserted adapter */
  hasAdapter?: boolean;
  /** Whether this edge contributes to the final value (for multiedge ports) */
  isNonContributing?: boolean;
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
  return input.defaultSource;
}

/**
 * Create port data for ReactFlow rendering.
 */
function createPortData(
  id: string,
  label: string,
  type: InferenceCanonicalType,
  isConnected: boolean,
  defaultSource?: DefaultSource,
  connection?: PortConnectionInfo,
  uiHint?: UIControlHint,
  lenses?: readonly LensAttachment[]
): PortData {
  const payloadType = type.payload;
  return {
    id,
    label,
    defaultSource,
    payloadType,
    typeTooltip: formatTypeForTooltip(type),
    typeColor: getTypeColor(payloadType),
    isConnected,
    connection,
    uiHint,
    lensCount: lenses?.length,
    lenses,
  };
}

/**
 * Create a ReactFlow node from a Block and its definition.
 * Called during patch-to-reactflow sync.
 *
 * @param block - The block instance from PatchStore
 * @param blockDef - Block definition from registry (primitive or composite)
 * @param edges - Optional edge list for connection info
 * @param blocks - Optional block map for connected block labels
 * @param blockDefs - Optional blockDefs map for looking up connected blocks
 * @returns ReactFlow node with OscillaNodeData
 */
export function createNodeFromBlock(
  block: Block,
  blockDef: AnyBlockDef,
  edges?: readonly Edge[],
  blocks?: ReadonlyMap<BlockId, Block>,
  blockDefs?: ReadonlyMap<string, AnyBlockDef>
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
      label: blockDef.label,
      displayName: block.displayName,
      inputs: Object.entries(blockDef.inputs).map(([inputId, input]) => {
        const lenses = block.inputPorts.get(inputId)?.lenses;
        return createPortData(
          inputId,
          input.label || inputId,
          input.type,
          inputConnections.has(inputId),
          getEffectiveDefaultSource(block, inputId, input),
          inputConnections.get(inputId),
          input.uiHint,
          lenses
        );
      }),
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
 * Get IDs of edges that don't contribute to a port's final value.
 * For 'last' mode, all but the highest-sortKey edge are non-contributing.
 * For 'first' mode, all but the lowest-sortKey edge are non-contributing.
 * For commutative modes (sum, etc.), all edges contribute.
 */
export function getNonContributingEdges(
  patch: Patch,
  targetBlockId: string,
  targetPortId: string,
  combineMode: CombineMode
): Set<string> {
  const edgesToPort = Array.from(patch.edges.values()).filter(
    (e) => e.to.blockId === targetBlockId && e.to.slotId === targetPortId
  );

  if (edgesToPort.length <= 1) {
    return new Set(); // Single or no edge - all contribute
  }

  if (combineMode === 'last' || combineMode === 'first') {
    // Sort by sortKey
    const sorted = sortEdgesBySortKey(edgesToPort);

    // Determine which one contributes
    const contributingEdge = combineMode === 'last' ? sorted[sorted.length - 1] : sorted[0];
    const contributingEdgeId = contributingEdge.id;

    // All others are non-contributing
    return new Set(edgesToPort.map((e) => e.id).filter((id) => id !== contributingEdgeId));
  }

  // Commutative modes (sum, mult, etc.) - all edges contribute
  return new Set();
}

/**
 * Compute all non-contributing edges in the entire patch.
 * Returns a Set of edge IDs that don't contribute due to combine mode.
 */
export function computeAllNonContributingEdges(patch: Patch): Set<string> {
  const allNonContributing = new Set<string>();

  // Group edges by target (blockId, portId)
  const edgesByTarget = new Map<string, Edge[]>();
  for (const edge of patch.edges.values()) {
    const key = `${edge.to.blockId}::${edge.to.slotId}`;
    const existing = edgesByTarget.get(key);
    if (existing) {
      existing.push(edge);
    } else {
      edgesByTarget.set(key, [edge]);
    }
  }

  // For each target port, compute non-contributing edges
  for (const [, edgesToPort] of edgesByTarget.entries()) {
    if (edgesToPort.length <= 1) {
      continue; // No multiedge
    }

    // Get combine mode for this port
    const firstEdge = edgesToPort[0];
    const targetBlock = patch.blocks.get(firstEdge.to.blockId as BlockId);
    if (!targetBlock) continue;

    const portConfig = targetBlock.inputPorts.get(firstEdge.to.slotId);
    const combineMode = portConfig?.combineMode || 'last';

    // Compute non-contributing edges for this port
    const nonContributing = getNonContributingEdges(
      patch,
      firstEdge.to.blockId,
      firstEdge.to.slotId,
      combineMode
    );

    for (const edgeId of nonContributing) {
      allNonContributing.add(edgeId);
    }
  }

  return allNonContributing;
}

/**
 * Create ReactFlow edge from Oscilla edge.
 * Optionally computes adapter label from source/target block types.
 * Populates edge.data with lens information for custom edge rendering.
 *
 * @param edge - The edge to convert
 * @param blocks - All blocks in the patch (for adapter detection)
 * @param nonContributingEdges - Set of edge IDs that don't contribute to final value
 */
export function createEdgeFromPatchEdge(
  edge: Edge,
  blocks?: ReadonlyMap<BlockId, Block>,
  nonContributingEdges?: Set<string>
): ReactFlowEdge<OscillaEdgeData> {
  const isNonContributing = nonContributingEdges?.has(edge.id) ?? false;

  const rfEdge: ReactFlowEdge<OscillaEdgeData> = {
    id: edge.id,
    source: edge.from.blockId,
    target: edge.to.blockId,
    sourceHandle: edge.from.slotId,
    targetHandle: edge.to.slotId,
    type: 'oscilla', // Use custom edge component
    data: {
      isNonContributing,
    },
  };

  // Apply dimming style for non-contributing edges
  if (isNonContributing) {
    rfEdge.style = { opacity: 0.3, strokeDasharray: '5,5' };
    rfEdge.label = 'Not contributing';
    rfEdge.labelStyle = { fontSize: 10, fill: '#666' };
  }

  // Compute adapter label if block context is available (only for contributing edges)
  if (blocks && !isNonContributing) {
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
          rfEdge.data!.hasAdapter = true;
        }
      }
    }

    // Check for user-attached lenses on the target port (in addition to auto-adapters)
    if (targetBlock) {
      const targetPort = targetBlock.inputPorts.get(edge.to.slotId);
      if (targetPort?.lenses && targetPort.lenses.length > 0) {
        const lensLabels = targetPort.lenses
          .map(l => getLensLabel(l.lensType))
          .join(', ');
        rfEdge.label = lensLabels;
        rfEdge.labelStyle = { fontSize: 10, fill: '#d97706' }; // Darker amber for text
        rfEdge.style = { ...(rfEdge.style || {}), stroke: '#f59e0b' };
        rfEdge.data!.lenses = targetPort.lenses;
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
