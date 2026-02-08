/**
 * DraftGraph → NormalizedPatch Bridge
 *
 * Converts a StrictTypedGraph (from the fixpoint normalization engine) into
 * the NormalizedPatch + TypeResolvedPatch shape consumed by the existing
 * pass2TypeGraph, axis validation, and cycle analysis passes.
 *
 * This is a pure representation translation — no new logic, no mutation.
 *
 * // [LAW:one-source-of-truth] StrictTypedGraph.portTypes is the single type authority.
 * // [LAW:single-enforcer] Port key translation happens exactly once here.
 * // [LAW:dataflow-not-control-flow] All blocks/edges always processed; empty is data.
 */

import type { BlockId, PortId, BlockRole, EdgeRole, DefaultSource } from '../../types';
import type { Block, Edge, Patch, InputPort, OutputPort } from '../../graph/Patch';
import type { NormalizedPatch, NormalizedEdge, BlockIndex } from './normalize-indexing';
import { blockIndex } from './normalize-indexing';
import type { TypeResolvedPatch, PortKey, CollectEdgeKey } from '../ir/patches';
import type { CanonicalType } from '../../core/canonical-types';
import type { StrictTypedGraph, DraftPortKey, TypeFacts } from './type-facts';
import type { DraftBlock, DraftEdge, DraftEdgeRole, DraftGraph } from './draft-graph';
import type { BlockDef } from '../../blocks/registry';

// =============================================================================
// Public API
// =============================================================================

export interface BridgeResult {
  readonly normalizedPatch: NormalizedPatch;
  readonly typeResolved: TypeResolvedPatch;
}

/**
 * Convert a StrictTypedGraph into NormalizedPatch + TypeResolvedPatch.
 *
 * @param strict - Fully resolved graph from fixpoint engine
 * @param expandedPatch - The composite-expanded Patch (for port override preservation)
 * @param registry - Block definitions indexed by type
 */
export function bridgeToNormalizedPatch(
  strict: StrictTypedGraph,
  expandedPatch: Patch,
  registry: ReadonlyMap<string, BlockDef>,
): BridgeResult {
  const g = strict.graph;

  // Step 1: Build dense BlockIndex mapping (sorted by id for determinism)
  const sortedBlocks = [...g.blocks].sort((a, b) => a.id.localeCompare(b.id));
  const blockIndexMap = new Map<BlockId, BlockIndex>();
  for (let i = 0; i < sortedBlocks.length; i++) {
    blockIndexMap.set(sortedBlocks[i].id as BlockId, blockIndex(i));
  }

  // Step 2: Reconstruct Block objects from DraftBlocks
  const blocks: Block[] = sortedBlocks.map((db) =>
    reconstructBlock(db, expandedPatch, registry),
  );

  // Step 3: Convert DraftEdge → NormalizedEdge
  // Build a string→BlockIndex lookup for edge conversion (DraftEdge uses string blockId)
  const stringIndexMap = new Map<string, BlockIndex>();
  for (const [k, v] of blockIndexMap) { stringIndexMap.set(k, v); }

  const normalizedEdges = buildNormalizedEdges(g.edges, stringIndexMap);

  // Step 4: Build synthetic Patch for NormalizedPatch.patch
  const syntheticPatch = buildSyntheticPatch(blocks, g.edges, stringIndexMap);

  // Step 5: Translate DraftPortKey → PortKey for type map
  const portTypes = translatePortTypes(strict.portTypes, stringIndexMap);

  // Step 6: Translate collectEdgeTypes (DraftPortKey-flavored keys → CollectEdgeKey)
  const collectEdgeTypes = translateCollectEdgeTypes(strict.collectEdgeTypes, stringIndexMap);

  const normalizedPatch: NormalizedPatch = {
    patch: syntheticPatch,
    blockIndex: blockIndexMap,
    blocks,
    edges: normalizedEdges,
  };

  const typeResolved: TypeResolvedPatch = {
    ...normalizedPatch,
    portTypes,
    collectEdgeTypes: collectEdgeTypes.size > 0 ? collectEdgeTypes : undefined,
  };

  return { normalizedPatch, typeResolved };
}

/**
 * Convert a DraftGraph + TypeFacts into NormalizedPatch + TypeResolvedPatch
 * when strict finalization failed.
 *
 * Produces a partial TypeResolvedPatch: portTypes contains only ports where
 * facts.ports has status === 'ok'. This allows downstream passes (type graph,
 * axis validation, cycle analysis) to run on whatever we know, giving the UI
 * partial type information rather than nothing.
 *
 * // [LAW:dataflow-not-control-flow] Pipeline always produces output; partial is data, not an error.
 * // [LAW:one-type-per-behavior] Shares block reconstruction/edge conversion with bridgeToNormalizedPatch.
 */
export function bridgePartialToNormalizedPatch(
  graph: DraftGraph,
  facts: TypeFacts,
  expandedPatch: Patch,
  registry: ReadonlyMap<string, BlockDef>,
): BridgeResult {
  // Step 1: Build dense BlockIndex mapping (sorted by id for determinism)
  const sortedBlocks = [...graph.blocks].sort((a, b) => a.id.localeCompare(b.id));
  const blockIndexMap = new Map<BlockId, BlockIndex>();
  for (let i = 0; i < sortedBlocks.length; i++) {
    blockIndexMap.set(sortedBlocks[i].id as BlockId, blockIndex(i));
  }

  // Step 2: Reconstruct Block objects from DraftBlocks
  const blocks: Block[] = sortedBlocks.map((db) =>
    reconstructBlock(db, expandedPatch, registry),
  );

  // Step 3: Convert DraftEdge → NormalizedEdge
  const stringIndexMap = new Map<string, BlockIndex>();
  for (const [k, v] of blockIndexMap) { stringIndexMap.set(k, v); }

  const normalizedEdges = buildNormalizedEdges(graph.edges, stringIndexMap);

  // Step 4: Build synthetic Patch
  const syntheticPatch = buildSyntheticPatch(blocks, graph.edges, stringIndexMap);

  // Step 5: Build partial portTypes from TypeFacts (only status === 'ok' ports)
  const portTypes = new Map<PortKey, CanonicalType>();
  for (const [draftKey, hint] of facts.ports) {
    if (hint.status !== 'ok' || !hint.canonical) continue;
    const translated = translatePortKey(draftKey, stringIndexMap);
    if (translated !== null) {
      portTypes.set(translated, hint.canonical);
    }
  }

  const normalizedPatch: NormalizedPatch = {
    patch: syntheticPatch,
    blockIndex: blockIndexMap,
    blocks,
    edges: normalizedEdges,
  };

  const typeResolved: TypeResolvedPatch = {
    ...normalizedPatch,
    portTypes,
  };

  return { normalizedPatch, typeResolved };
}

// =============================================================================
// Block Reconstruction
// =============================================================================

/**
 * Reconstruct a Block from a DraftBlock.
 *
 * For blocks that exist in the expandedPatch (user/composite blocks), we pull
 * inputPorts/outputPorts from there to preserve per-instance overrides (combineMode,
 * defaultSource, lenses).
 *
 * For elaborated blocks (inserted by the fixpoint engine, not in expandedPatch),
 * we build ports from the BlockDef with defaults.
 */
function reconstructBlock(
  draft: DraftBlock,
  expandedPatch: Patch,
  registry: ReadonlyMap<string, BlockDef>,
): Block {
  const existingBlock = expandedPatch.blocks.get(draft.id as BlockId);

  if (existingBlock) {
    // User/composite block: preserve port overrides from original Patch
    return {
      id: draft.id as BlockId,
      type: draft.type,
      params: draft.params as Record<string, unknown>,
      displayName: draft.displayName,
      domainId: draft.domainId,
      role: draft.role,
      inputPorts: existingBlock.inputPorts,
      outputPorts: existingBlock.outputPorts,
    };
  }

  // Elaborated block: build ports from BlockDef
  const blockDef = registry.get(draft.type);
  const inputPorts = new Map<string, InputPort>();
  const outputPorts = new Map<string, OutputPort>();

  if (blockDef) {
    for (const [portId, inputDef] of Object.entries(blockDef.inputs)) {
      if (inputDef.exposedAsPort === false) continue;
      inputPorts.set(portId, {
        id: portId,
        combineMode: 'last',
      });
    }
    for (const portId of Object.keys(blockDef.outputs)) {
      outputPorts.set(portId, { id: portId });
    }
  }

  return {
    id: draft.id as BlockId,
    type: draft.type,
    params: draft.params as Record<string, unknown>,
    displayName: draft.displayName,
    domainId: draft.domainId,
    role: draft.role,
    inputPorts,
    outputPorts,
  };
}

// =============================================================================
// Edge Conversion
// =============================================================================

/**
 * Convert DraftEdges to NormalizedEdges with dense BlockIndex values.
 * Sorted by (toBlock, toPort, fromBlock, fromPort) for determinism.
 */
function buildNormalizedEdges(
  edges: readonly DraftEdge[],
  blockIndexMap: ReadonlyMap<string, BlockIndex>,
): NormalizedEdge[] {
  const result: NormalizedEdge[] = [];

  for (const edge of edges) {
    const fromIdx = blockIndexMap.get(edge.from.blockId);
    const toIdx = blockIndexMap.get(edge.to.blockId);
    if (fromIdx === undefined || toIdx === undefined) continue;

    result.push({
      fromBlock: fromIdx,
      fromPort: edge.from.port as PortId,
      toBlock: toIdx,
      toPort: edge.to.port as PortId,
    });
  }

  // Sort by (toBlock, toPort, fromBlock, fromPort) — same as normalize-indexing.ts
  result.sort((a, b) => {
    if (a.toBlock !== b.toBlock) return a.toBlock - b.toBlock;
    if (a.toPort !== b.toPort) return String(a.toPort).localeCompare(String(b.toPort));
    if (a.fromBlock !== b.fromBlock) return a.fromBlock - b.fromBlock;
    return String(a.fromPort).localeCompare(String(b.fromPort));
  });

  return result;
}

// =============================================================================
// Synthetic Patch
// =============================================================================

/**
 * Build a synthetic Patch for NormalizedPatch.patch.
 *
 * The NormalizedPatch interface requires a `patch: Patch` field.
 * We construct one from the reconstructed blocks and draft edges.
 */
function buildSyntheticPatch(
  blocks: readonly Block[],
  draftEdges: readonly DraftEdge[],
  blockIndexMap: ReadonlyMap<string, BlockIndex>,
): Patch {
  const blockMap = new Map<BlockId, Block>();
  for (const block of blocks) {
    blockMap.set(block.id, block);
  }

  const edges: Edge[] = draftEdges.map((de, i) => ({
    id: de.id,
    from: { kind: 'port' as const, blockId: de.from.blockId, slotId: de.from.port },
    to: { kind: 'port' as const, blockId: de.to.blockId, slotId: de.to.port },
    enabled: true,
    sortKey: i,
    role: draftEdgeRoleToEdgeRole(de.role),
  }));

  return { blocks: blockMap, edges };
}

/**
 * Map DraftEdgeRole → EdgeRole.
 */
function draftEdgeRoleToEdgeRole(role: DraftEdgeRole): EdgeRole {
  switch (role) {
    case 'userWire':
      return { kind: 'user', meta: {} as Record<string, never> };
    case 'defaultWire':
      return { kind: 'default', meta: { defaultSourceBlockId: '' as BlockId } };
    case 'implicitCoerce':
      return { kind: 'adapter', meta: { adapterId: '' as BlockId, originalEdgeId: '' } };
    case 'internalHelper':
      return { kind: 'user', meta: {} as Record<string, never> };
  }
}

// =============================================================================
// Port Key Translation
// =============================================================================

/**
 * Translate DraftPortKey (blockId-based) → PortKey (blockIndex-based).
 *
 * DraftPortKey = `${blockId}:${portName}:${'in'|'out'}`
 * PortKey = `${blockIndex}:${portName}:${'in'|'out'}`
 */
function translatePortTypes(
  draftPortTypes: ReadonlyMap<DraftPortKey, CanonicalType>,
  blockIndexMap: ReadonlyMap<string, BlockIndex>,
): ReadonlyMap<PortKey, CanonicalType> {
  const result = new Map<PortKey, CanonicalType>();

  for (const [draftKey, type] of draftPortTypes) {
    const translated = translatePortKey(draftKey, blockIndexMap);
    if (translated !== null) {
      result.set(translated, type);
    }
  }

  return result;
}

/**
 * Translate a single DraftPortKey to PortKey.
 * Returns null if the blockId can't be resolved to an index.
 */
function translatePortKey(
  draftKey: DraftPortKey,
  blockIndexMap: ReadonlyMap<string, BlockIndex>,
): PortKey | null {
  // DraftPortKey format: `${blockId}:${portName}:${'in'|'out'}`
  // We need to find the last two segments (portName and dir), rest is blockId.
  // BlockId itself can contain colons, but portName and dir are the last two segments.
  const parts = draftKey.split(':');
  if (parts.length < 3) return null;

  const dir = parts[parts.length - 1]; // 'in' or 'out'
  const portName = parts[parts.length - 2];
  const blockId = parts.slice(0, -2).join(':');

  const idx = blockIndexMap.get(blockId);
  if (idx === undefined) return null;

  return `${idx}:${portName}:${dir}` as PortKey;
}

// =============================================================================
// Collect Edge Type Translation
// =============================================================================

/**
 * Translate collect edge types from DraftPortKey-flavored keys to CollectEdgeKey.
 *
 * Input key format: `${blockId}:${portName}:${edgeIndex}` (from tryFinalizeStrict)
 * Output key format: `${blockIndex}:${portName}:${edgeIndex}` (CollectEdgeKey)
 */
function translateCollectEdgeTypes(
  draftCollectTypes: ReadonlyMap<string, CanonicalType> | undefined,
  blockIndexMap: ReadonlyMap<string, BlockIndex>,
): ReadonlyMap<CollectEdgeKey, CanonicalType> {
  const result = new Map<CollectEdgeKey, CanonicalType>();
  if (!draftCollectTypes) return result;

  for (const [draftKey, type] of draftCollectTypes) {
    // Format: `${blockId}:${portName}:${edgeIndex}`
    // edgeIndex is always a number (the last segment)
    const parts = draftKey.split(':');
    if (parts.length < 3) continue;

    const edgeIndex = parts[parts.length - 1];
    const portName = parts[parts.length - 2];
    const blockId = parts.slice(0, -2).join(':');

    const idx = blockIndexMap.get(blockId);
    if (idx === undefined) continue;

    const collectKey = `${idx}:${portName}:${edgeIndex}` as CollectEdgeKey;
    result.set(collectKey, type);
  }

  return result;
}
