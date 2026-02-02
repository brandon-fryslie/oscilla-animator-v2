/**
 * ReactFlow Node Types for Oscilla Blocks
 *
 * Maps Oscilla blocks to ReactFlow node format.
 * Each node corresponds to a block in PatchStore.
 */

import type { Node, Edge as ReactFlowEdge } from 'reactflow';
import type { Block, BlockId, Edge, DefaultSource, UIControlHint, CombineMode } from '../../types';
import type { Patch, LensAttachment } from '../../graph/Patch';
import type { AnyBlockDef, InputDef } from '../../blocks/registry';
import type { PayloadType } from '../../core/canonical-types';
import type { InferenceCanonicalType, InferencePayloadType } from '../../core/inference-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR,  CAMERA_PROJECTION, canonicalType } from '../../core/canonical-types';
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
  /** Edge role (e.g., 'accumulate') if present */
  role?: string;
}

/**
 * Data for a single port
 */
export interface PortData {
  /** Port slot ID */
  id: string;
  /** Display label */
  label: string;
  /** Port type info */
  type: InferenceCanonicalType | null;
  /** Color for visual coding */
  color: string;
  /** Default source config (for inputs) */
  defaultSource?: DefaultSource;
  /** Combine mode (for inputs) */
  combineMode?: CombineMode;
  /** Number of lenses attached */
  lensCount?: number;
  /** Full lens attachments (for popover details) */
  lenses?: readonly LensAttachment[];
  /** List of connected blocks (with metadata) */
  connections: PortConnectionInfo[];
}

/**
 * Data for ReactFlow node rendering
 */
export interface OscillaNodeData {
  /** Block type */
  blockType: string;
  /** Display label */
  label: string;
  /** Node color (from block category) */
  color: string;
  /** Input ports */
  inputs: PortData[];
  /** Output ports */
  outputs: PortData[];
}

/**
 * Create port data from a port map (inputs or outputs).
 * Maps Patch port data to UI-friendly format for ReactFlow nodes.
 */
function createPortData(
  portMap: ReadonlyMap<string, { label?: string; type: InferenceCanonicalType }> | undefined,
  portType: 'input' | 'output',
  blockDef: AnyBlockDef,
  block: Block,
  patch: Patch
): PortData[] {
  if (!portMap) return [];

  // Get input-specific data (defaultSource, combineMode, lenses)
  const inputPortMap = portType === 'input' ? block.inputPorts : undefined;

  return Array.from(portMap.entries()).map(([id, port]) => {
    const inputPort = inputPortMap?.get(id);
    const blockDefPort = portType === 'input' ? blockDef.inputs[id] : blockDef.outputs[id];

    // Build connections list
    const connections: PortConnectionInfo[] = [];
    const edges = Array.from(patch.edges.values());
    const relevantEdges =
      portType === 'input'
        ? edges.filter(e => e.to.blockId === block.id && e.to.slotId === id)
        : edges.filter(e => e.from.blockId === block.id && e.from.slotId === id);

    // Sort edges by sortKey for inputs (to match combineMode order)
    const sortedEdges = portType === 'input' ? sortEdgesBySortKey(relevantEdges) : relevantEdges;

    for (const edge of sortedEdges) {
      const connectedBlockId = portType === 'input' ? edge.from.blockId : edge.to.blockId;
      const connectedBlock = patch.blocks.get(connectedBlockId);
      if (connectedBlock) {
        connections.push({
          blockId: connectedBlockId,
          blockLabel: connectedBlock.name,
          portId: portType === 'input' ? edge.from.slotId : edge.to.slotId,
          edgeId: edge.id,
          role: edge.role,
        });
      }
    }

    return {
      id,
      label: port.label ?? id,
      type: port.type,
      color: port.type ? getTypeColor(port.type) : '#888',
      defaultSource: inputPort?.defaultSource,
      combineMode: inputPort?.combineMode,
      lensCount: inputPort?.lenses?.length ?? 0,
      lenses: inputPort?.lenses,
      connections,
    };
  });
}

/**
 * Create a ReactFlow node from a Patch block.
 */
export function createNodeFromBlock(
  block: Block,
  blockDef: AnyBlockDef,
  patch: Patch
): Node<OscillaNodeData> {
  // Compute node color from category
  const categoryColors: Record<string, string> = {
    math: '#3b82f6',
    signal: '#10b981',
    shape: '#f59e0b',
    control: '#8b5cf6',
    adapter: '#f59e0b',
    render: '#ef4444',
    io: '#06b6d4',
  };
  const color = categoryColors[blockDef.category] ?? '#6b7280';

  const inputs = createPortData(block.inputPorts, 'input', blockDef, block, patch);
  const outputs = createPortData(block.outputPorts, 'output', blockDef, block, patch);

  return {
    id: block.id,
    type: 'oscilla',
    position: block.position ?? { x: 0, y: 0 },
    data: {
      blockType: block.type,
      label: block.name,
      color,
      inputs,
      outputs,
    },
  };
}

/**
 * Payload type name for display
 */
function getPayloadLabel(payload: InferencePayloadType): string {
  switch (payload.kind) {
    case 'float':
      return 'Float';
    case 'int':
      return 'Int';
    case 'bool':
      return 'Bool';
    case 'vec2':
      return 'Vec2';
    case 'vec3':
      return 'Vec3';
    case 'color':
      return 'Color';
    case 'camera-projection':
      return 'Camera';
    default:
      return 'Unknown';
  }
}

/**
 * Port type display (payload + unit)
 */
export function formatPortType(type: InferenceCanonicalType): string {
  const payloadLabel = getPayloadLabel(type.payload);
  if (type.unit && type.unit.kind !== 'none') {
    return `${payloadLabel} (${formatUnitForDisplay(type.unit)})`;
  }
  return payloadLabel;
}

/**
 * Control hint display name
 */
export function getControlHintLabel(hint: UIControlHint | undefined): string {
  if (!hint) return 'No control';
  return hint.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * DefaultSource display name
 */
export function getDefaultSourceLabel(ds: DefaultSource | undefined): string {
  if (!ds) return 'None';
  switch (ds.kind) {
    case 'constant':
      return `Constant: ${JSON.stringify(ds.value)}`;
    case 'external':
      return `External: ${ds.channel}`;
    case 'intrinsic':
      return `Intrinsic: ${ds.property}`;
    default:
      return 'Unknown';
  }
}

/**
 * Convert a Patch edge to a ReactFlow edge with visual styling.
 * Includes auto-adapter detection and lens attachment visualization.
 */
export function createEdgeFromPatchEdge(
  edge: Edge,
  blocks?: ReadonlyMap<BlockId, Block>,
  nonContributingEdges?: Set<string>
): ReactFlowEdge {
  const isNonContributing = nonContributingEdges?.has(edge.id) ?? false;

  const rfEdge: ReactFlowEdge = {
    id: edge.id,
    source: edge.from.blockId,
    target: edge.to.blockId,
    sourceHandle: edge.from.slotId,
    targetHandle: edge.to.slotId,
    type: 'default',
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
      }
    }
  }

  return rfEdge;
}

/**
 * Get handle ID for ReactFlow.
 * ReactFlow uses handle IDs to match source/target connections.
 */
export function getHandleId(slotId: string): string {
  return slotId;
}
