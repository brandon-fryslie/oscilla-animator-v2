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
import { defaultSourceConst } from '../../types';
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
  /** Config-only params (exposedAsPort: false). Exposed port values live in portDefaults. */
  readonly params: Readonly<Record<string, unknown>>;
  /** Per-instance default source overrides for exposed ports (from Patch params or InputPort.defaultSource). */
  // [LAW:single-enforcer] buildDraftGraph is the single boundary that partitions user params into config vs port defaults.
  readonly portDefaults: Readonly<Record<string, DefaultSource>>;
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
  readonly alias: string;
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
// Build Diagnostics
// =============================================================================

export type BuildDiagnostic =
  | { readonly kind: 'MissingRequiredInput'; readonly blockId: string; readonly portName: string }
  | { readonly kind: 'UnknownParam'; readonly blockId: string; readonly portName: string }
  | {
      readonly kind: 'DuplicateEdge';
      readonly edgeId: string;
      readonly fromBlockId: string;
      readonly fromPort: string;
      readonly toBlockId: string;
      readonly toPort: string;
      readonly existingEdgeId: string;
    };

export interface BuildDraftGraphResult {
  readonly graph: DraftGraph;
  readonly diagnostics: readonly BuildDiagnostic[];
}

// =============================================================================
// buildDraftGraph
// =============================================================================

/**
 * Convert a composite-expanded Patch into a DraftGraph.
 *
 * - Converts all blocks and edges to draft format
 * - Creates missingInputSource obligations for unconnected inputs
 * - Emits MissingRequiredInput diagnostics for inputs with defaulting: 'forbidden'
 * - Does NOT insert default sources or adapters (that's the fixpoint's job)
 * - All arrays are deterministically sorted by id
 */
export function buildDraftGraph(patch: Patch): BuildDraftGraphResult {
  const blocks: DraftBlock[] = [];
  const edges: DraftEdge[] = [];
  const obligations: Obligation[] = [];
  const diagnostics: BuildDiagnostic[] = [];

  // Convert blocks — partition params into config vs portDefaults
  // [LAW:single-enforcer] This is the one place that separates user params from port defaults.
  for (const [_blockId, block] of patch.blocks) {
    const origin: BlockOrigin = classifyBlockOrigin(block);
    const blockDef = getBlockDefinition(block.type);

    const filteredParams: Record<string, unknown> = {};
    const portDefaults: Record<string, DefaultSource> = {};

    if (blockDef) {
      // Partition user-provided params into fallback writers while preserving
      // canonical params on the block.
      for (const [key, val] of Object.entries(block.params)) {
        const inputDef = blockDef.inputs[key];
        if (!inputDef) {
          // Unknown key — emit diagnostic, don't pass through silently
          diagnostics.push({ kind: 'UnknownParam', blockId: block.id, portName: key });
          continue;
        }
        // [LAW:one-source-of-truth] Keep all user params in DraftBlock.params;
        // fallback writer synthesis for exposed ports is derived from this map.
        filteredParams[key] = val;
        if (inputDef.exposedAsPort !== false) {
          // Exposed port — derive a Const fallback source from canonical params
          portDefaults[key] = defaultSourceConst(val);
        }
      }

      // Apply config defaults for config-only inputs not already in params.
      // HCL deserialization (patch-from-ast.ts) creates blocks without config defaults;
      // PatchBuilder.addBlock() applies them. This is the single enforcer that ensures
      // config defaults are always present regardless of Patch creation path.
      // [LAW:single-enforcer] Config defaults applied here, not scattered across HCL/PatchBuilder/etc.
      for (const [inputId, inputDef] of Object.entries(blockDef.inputs)) {
        if (inputDef.exposedAsPort === false && inputDef.defaultValue !== undefined) {
          if (!(inputId in filteredParams)) {
            filteredParams[inputId] = inputDef.defaultValue;
          }
        }
      }

      // Check InputPort.defaultSource overrides (from setPortDefault) — these take priority
      for (const [portId, inputPort] of block.inputPorts) {
        if (inputPort.defaultSource) {
          portDefaults[portId] = inputPort.defaultSource;
          if (inputPort.defaultSource.blockType === 'Const' && inputPort.defaultSource.output === 'out' && inputPort.defaultSource.params?.value !== undefined) {
            filteredParams[portId] = inputPort.defaultSource.params.value;
          }
        }
      }
    } else {
      // Unknown block type — pass params through as-is (error will be caught elsewhere)
      Object.assign(filteredParams, block.params);
    }

    blocks.push({
      id: block.id,
      type: block.type,
      params: filteredParams,
      portDefaults,
      origin,
      displayName: block.displayName,
      domainId: block.domainId,
      role: block.role,
    });
  }

  // Convert edges
  const seenEdgeKeys = new Map<string, string>();
  for (const edge of patch.edges) {
    if (edge.from.kind !== 'port' || edge.to.kind !== 'port') continue;
    const edgeKey = `${edge.from.blockId}:${edge.from.slotId}->${edge.to.blockId}:${edge.to.slotId}`;
    const existingEdgeId = seenEdgeKeys.get(edgeKey);
    if (existingEdgeId) {
      diagnostics.push({
        kind: 'DuplicateEdge',
        edgeId: edge.id,
        fromBlockId: edge.from.blockId,
        fromPort: edge.from.slotId,
        toBlockId: edge.to.blockId,
        toPort: edge.to.slotId,
        existingEdgeId,
      });
      continue;
    }
    // [LAW:single-enforcer] DraftGraph construction is the single frontend
    // boundary that enforces endpoint-level edge uniqueness.
    seenEdgeKeys.set(edgeKey, edge.id);

    const role = classifyEdgeRole(edge);
    const origin: EdgeOrigin = classifyEdgeOrigin(edge);

    edges.push({
      id: edge.id,
      from: { blockId: edge.from.blockId, port: edge.from.slotId, dir: 'out' },
      to: { blockId: edge.to.blockId, port: edge.to.slotId, dir: 'in' },
      alias: edge.alias,
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

      // If defaulting is forbidden, emit diagnostic instead of obligation
      if (inputDef.defaulting === 'forbidden') {
        diagnostics.push({ kind: 'MissingRequiredInput', blockId, portName: inputId });
        continue;
      }

      const oblId = missingInputObligationId(blockId, inputId);
      obligations.push({
        id: oblId,
        kind: 'missingInputSource',
        anchor: {
          port: { blockId, port: inputId, dir: 'in' },
          blockId,
        },
        status: { kind: 'open' },
        deps: [], // [LAW:dataflow-not-control-flow] policy idempotency guard handles wired ports; no need to gate on type resolution
        policy: { name: 'defaultSources.v1', version: 1 },
        debug: { createdBy: 'buildDraftGraph' },
      });
    }
  }

  return {
    graph: {
      blocks: sortById(blocks),
      edges: sortById(edges),
      obligations: sortById(obligations),
      meta: { revision: 0, provenance: 'buildDraftGraph' },
    },
    diagnostics,
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

// =============================================================================
// Reachability
// =============================================================================

/**
 * Compute the set of DraftBlock IDs reachable from render output sinks.
 *
 * BFS backward from render blocks (capability: 'render') and time roots
 * (capability: 'time') through DraftEdge connections.
 *
 * Blocks not in the returned set are disconnected from the render pipeline
 * and can be excluded from normalization to prevent fixpoint divergence.
 */
export function computeReachableDraftBlockIds(
  blocks: readonly DraftBlock[],
  edges: readonly DraftEdge[],
): Set<string> {
  // Seed: render sinks + time roots (both needed for fixpoint convergence)
  const reachable = new Set<string>();
  const queue: string[] = [];

  for (const block of blocks) {
    const def = getBlockDefinition(block.type);
    if (def?.capability === 'render' || def?.capability === 'time') {
      queue.push(block.id);
    }
  }

  // BFS backward through edges: to → from
  while (queue.length > 0) {
    const blockId = queue.shift()!;
    if (reachable.has(blockId)) continue;
    reachable.add(blockId);

    for (const edge of edges) {
      if (edge.to.blockId === blockId && !reachable.has(edge.from.blockId)) {
        queue.push(edge.from.blockId);
      }
    }
  }

  return reachable;
}
