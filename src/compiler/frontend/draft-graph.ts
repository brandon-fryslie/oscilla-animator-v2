/**
 * DraftGraph — The mutable graph operated on during normalization fixpoint.
 *
 * Contains blocks, edges, and obligations. All arrays are maintained in
 * deterministic sorted order (by id) to ensure bit-identical output.
 *
 * buildDraftGraph() converts a composite-expanded Patch into a DraftGraph,
 * creating missingInputSource obligations for unconnected inputs.
 *
 * // [LAW:one-source-of-truth] DraftGraph is the single structure during normalization.
 * // [LAW:dataflow-not-control-flow] All blocks/edges always present; obligations encode deferred work.
 */

import type { BlockId, PortId, DefaultSource, BlockRole } from '../../types';
import type { Block, Edge, Patch } from '../../graph/Patch';
import { getBlockDefinition, type InputDef } from '../../blocks/registry';
import type { Obligation, ObligationId } from './obligations';

// =============================================================================
// Core Types
// =============================================================================

export type PortDir = 'in' | 'out';

export interface DraftPortRef {
  readonly blockId: string;
  readonly port: string;
  readonly dir: PortDir;
}

export type ElaboratedRole =
  | 'defaultSource'
  | 'adapter'
  | 'laneAlignHelper'
  | 'internalHelper';

export type BlockOrigin =
  | 'user'
  | 'compositeInternal'
  | { readonly kind: 'elaboration'; readonly obligationId: ObligationId; readonly role: ElaboratedRole };

export type EdgeOrigin =
  | 'user'
  | 'compositeInternal'
  | { readonly kind: 'elaboration'; readonly obligationId: ObligationId; readonly role: ElaboratedRole };

export type DraftEdgeRole =
  | 'userWire'
  | 'defaultWire'
  | 'implicitCoerce'
  | 'internalHelper';

export interface DraftBlock {
  readonly id: string;
  readonly type: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly origin: BlockOrigin;
  /** Display name (for diagnostics and UI bridge) */
  readonly displayName: string;
  /** Domain ID (inherited from source block) */
  readonly domainId: string | null;
  /** Semantic role (bridged from Patch) */
  readonly role: BlockRole;
}

export interface DraftEdge {
  readonly id: string;
  readonly from: DraftPortRef;
  readonly to: DraftPortRef;
  readonly role: DraftEdgeRole;
  readonly origin: EdgeOrigin;
}

export interface DraftGraphMeta {
  readonly revision: number;
  readonly provenance: string;
}

export interface DraftGraph {
  readonly blocks: readonly DraftBlock[];
  readonly edges: readonly DraftEdge[];
  readonly obligations: readonly Obligation[];
  readonly meta: DraftGraphMeta;
}

// =============================================================================
// Helpers
// =============================================================================

/** Sort by id for deterministic output. */
function sortById<T extends { id: string }>(arr: readonly T[]): T[] {
  return [...arr].sort((a, b) => a.id.localeCompare(b.id));
}

/** Check if an input has an incoming enabled edge. */
function hasIncomingEdge(
  blockId: string,
  portId: string,
  edges: readonly Edge[],
): boolean {
  return edges.some(
    (e) =>
      e.enabled !== false &&
      e.to.blockId === blockId &&
      e.to.slotId === portId,
  );
}

/** Generate deterministic obligation ID for a missing input source. */
function missingInputObligationId(blockId: string, portName: string): ObligationId {
  return `missingInput:${blockId}:${portName}` as ObligationId;
}

// =============================================================================
// buildDraftGraph
// =============================================================================

/**
 * Convert a composite-expanded Patch into a DraftGraph.
 *
 * - Converts all blocks and edges to draft format
 * - Creates missingInputSource obligations for unconnected inputs
 * - Does NOT insert default sources or adapters (that's the fixpoint's job)
 * - All arrays are deterministically sorted by id
 */
export function buildDraftGraph(patch: Patch): DraftGraph {
  const blocks: DraftBlock[] = [];
  const edges: DraftEdge[] = [];
  const obligations: Obligation[] = [];

  // Convert blocks
  for (const [_blockId, block] of patch.blocks) {
    const origin: BlockOrigin = classifyBlockOrigin(block);
    blocks.push({
      id: block.id,
      type: block.type,
      params: block.params,
      origin,
      displayName: block.displayName,
      domainId: block.domainId,
      role: block.role,
    });
  }

  // Convert edges
  for (const edge of patch.edges) {
    if (edge.from.kind !== 'port' || edge.to.kind !== 'port') continue;

    const role = classifyEdgeRole(edge);
    const origin: EdgeOrigin = classifyEdgeOrigin(edge);

    edges.push({
      id: edge.id,
      from: { blockId: edge.from.blockId, port: edge.from.slotId, dir: 'out' },
      to: { blockId: edge.to.blockId, port: edge.to.slotId, dir: 'in' },
      role,
      origin,
    });
  }

  // Create missingInputSource obligations for unconnected inputs
  for (const [blockId, block] of patch.blocks) {
    const blockDef = getBlockDefinition(block.type);
    if (!blockDef) continue;

    for (const [inputId, inputDef] of Object.entries(blockDef.inputs)) {
      // Skip config-only inputs
      if (inputDef.exposedAsPort === false) continue;
      // Skip collect ports (they don't get default sources — explicit connections only)
      if (inputDef.collectAccepts) continue;
      // Skip if already connected
      if (hasIncomingEdge(blockId, inputId, patch.edges)) continue;

      const oblId = missingInputObligationId(blockId, inputId);
      obligations.push({
        id: oblId,
        kind: 'missingInputSource',
        anchor: {
          port: { blockId, port: inputId, dir: 'in' },
          blockId,
        },
        status: { kind: 'open' },
        deps: [{ kind: 'portCanonicalizable', port: { blockId, port: inputId, dir: 'in' } }],
        policy: { name: 'defaultSources.v1', version: 1 },
        debug: { createdBy: 'buildDraftGraph' },
      });
    }
  }

  return {
    blocks: sortById(blocks),
    edges: sortById(edges),
    obligations: sortById(obligations),
    meta: { revision: 0, provenance: 'buildDraftGraph' },
  };
}

// =============================================================================
// Classification Helpers
// =============================================================================

function classifyBlockOrigin(block: Block): BlockOrigin {
  if (block.role.kind === 'derived') {
    // Blocks inserted by composite expansion
    const meta = block.role.meta as Record<string, unknown>;
    if (meta.kind === 'compositeExpansion') {
      return 'compositeInternal';
    }
  }
  return 'user';
}

function classifyEdgeRole(edge: Edge): DraftEdgeRole {
  switch (edge.role.kind) {
    case 'user': return 'userWire';
    case 'default': return 'defaultWire';
    case 'adapter': return 'implicitCoerce';
    default: return 'userWire';
  }
}

function classifyEdgeOrigin(edge: Edge): EdgeOrigin {
  switch (edge.role.kind) {
    case 'user': return 'user';
    case 'default': return 'compositeInternal';
    case 'adapter': return 'compositeInternal';
    default: return 'user';
  }
}
