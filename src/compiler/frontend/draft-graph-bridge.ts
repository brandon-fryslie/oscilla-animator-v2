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

import type { BlockId, PortId } from '../../types';
import type { Patch } from '../../graph/Patch';
import type { NormalizedPatch, NormalizedEdge, BlockIndex } from './normalize-indexing';
import { blockIndex } from './normalize-indexing';
import type { TypeResolvedPatch, PortKey, CollectEdgeKey, InputPortPolicy } from '../ir/patches';
import type { CompilerGraphBlock, CompilerGraphEdge, CompilerGraphEdgeRole } from '../ir/CompilerGraph';
import type { CanonicalType } from '../../core/canonical-types';
import type { CardinalityAcceptance } from '../../core/canonical-types/cardinality';
import type { StrictTypedGraph, DraftPortKey, TypeFacts } from './type-facts';
import type { DraftBlock, DraftEdge, DraftGraph } from './draft-graph';
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
 * @param draftPortAcceptance - Per-port cardinality acceptance from TypeFacts
 */
export function bridgeToNormalizedPatch(
  strict: StrictTypedGraph,
  expandedPatch: Patch,
  registry: ReadonlyMap<string, BlockDef>,
  draftPortAcceptance?: ReadonlyMap<DraftPortKey, CardinalityAcceptance>,
): BridgeResult {
  const g = strict.graph;

  // Step 1: Build dense BlockIndex mapping (sorted by id for determinism)
  const sortedBlocks = [...g.blocks].sort((a, b) => a.id.localeCompare(b.id));
  const blockIndexMap = new Map<BlockId, BlockIndex>();
  for (let i = 0; i < sortedBlocks.length; i++) {
    blockIndexMap.set(sortedBlocks[i].id as BlockId, blockIndex(i));
  }

  // Step 2: Build compiler-owned block nodes (frontend patch fields stripped)
  const blocks: CompilerGraphBlock[] = buildCompilerBlocks(sortedBlocks);

  // Step 3: Convert DraftEdge → NormalizedEdge
  // Build a string→BlockIndex lookup for edge conversion (DraftEdge uses string blockId)
  const stringIndexMap = new Map<string, BlockIndex>();
  for (const [k, v] of blockIndexMap) { stringIndexMap.set(k, v); }

  const normalizedEdges = buildNormalizedEdges(g.edges, stringIndexMap);

  // Step 4: Build compiler-owned graph edges for provenance/diagnostics.
  const graphEdges = buildCompilerGraphEdges(g.edges);

  // Step 5: Translate DraftPortKey → PortKey for type map
  const portTypes = translatePortTypes(strict.portTypes, stringIndexMap);
  const inputPortPolicies = buildInputPortPolicies(sortedBlocks, expandedPatch, stringIndexMap, registry);

  // Step 6: Translate collectEdgeTypes (DraftPortKey-flavored keys → CollectEdgeKey)
  const collectEdgeTypes = translateCollectEdgeTypes(strict.collectEdgeTypes, stringIndexMap);

  const normalizedPatch: NormalizedPatch = {
    graph: {
      blocks,
      edges: graphEdges,
    },
    blockIndex: blockIndexMap,
    blocks,
    edges: normalizedEdges,
  };

  // Step 7: Translate portAcceptance (DraftPortKey → PortKey)
  const portAcceptance = draftPortAcceptance
    ? translatePortAcceptance(draftPortAcceptance, stringIndexMap)
    : undefined;

  const typeResolved: TypeResolvedPatch = {
    ...normalizedPatch,
    portTypes,
    inputPortPolicies,
    collectEdgeTypes: collectEdgeTypes.size > 0 ? collectEdgeTypes : undefined,
    portAcceptance: portAcceptance && portAcceptance.size > 0 ? portAcceptance : undefined,
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

  // Step 2: Build compiler-owned block nodes (frontend patch fields stripped)
  const blocks: CompilerGraphBlock[] = buildCompilerBlocks(sortedBlocks);

  // Step 3: Convert DraftEdge → NormalizedEdge
  const stringIndexMap = new Map<string, BlockIndex>();
  for (const [k, v] of blockIndexMap) { stringIndexMap.set(k, v); }

  const normalizedEdges = buildNormalizedEdges(graph.edges, stringIndexMap);

  // Step 4: Build compiler-owned graph edges for provenance/diagnostics.
  const graphEdges = buildCompilerGraphEdges(graph.edges);

  // Step 5: Build partial portTypes from TypeFacts (only status === 'ok' ports)
  const portTypes = new Map<PortKey, CanonicalType>();
  for (const [draftKey, hint] of facts.ports) {
    if (hint.status !== 'ok' || !hint.canonical) continue;
    const translated = translatePortKey(draftKey, stringIndexMap);
    if (translated !== null) {
      portTypes.set(translated, hint.canonical);
    }
  }

  const inputPortPolicies = buildInputPortPolicies(sortedBlocks, expandedPatch, stringIndexMap, registry);

  const normalizedPatch: NormalizedPatch = {
    graph: {
      blocks,
      edges: graphEdges,
    },
    blockIndex: blockIndexMap,
    blocks,
    edges: normalizedEdges,
  };

  // Step 6: Translate portAcceptance from TypeFacts
  const portAcceptance = translatePortAcceptance(facts.portAcceptance, stringIndexMap);

  const typeResolved: TypeResolvedPatch = {
    ...normalizedPatch,
    portTypes,
    inputPortPolicies,
    portAcceptance: portAcceptance.size > 0 ? portAcceptance : undefined,
  };

  return { normalizedPatch, typeResolved };
}

// =============================================================================
// Compiler Graph Conversion
// =============================================================================

/**
 * Convert DraftBlocks to compiler-owned block nodes.
 * // [LAW:one-way-deps] Compiler graph strips editor-only Patch fields.
 */
function buildCompilerBlocks(drafts: readonly DraftBlock[]): CompilerGraphBlock[] {
  return drafts.map((draft) => ({
    id: draft.id,
    type: draft.type,
    params: draft.params,
    displayName: draft.displayName,
  }));
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
// Graph Metadata Conversion
// =============================================================================

/**
 * Convert DraftEdges to compiler-owned ID-addressed edge metadata.
 */
function buildCompilerGraphEdges(draftEdges: readonly DraftEdge[]): CompilerGraphEdge[] {
  return draftEdges.map((edge) => ({
    id: edge.id,
    fromBlockId: edge.from.blockId,
    fromPort: edge.from.port as PortId,
    toBlockId: edge.to.blockId,
    toPort: edge.to.port as PortId,
    role: draftRoleToGraphRole(edge.role),
  }));
}

function draftRoleToGraphRole(role: DraftEdge['role']): CompilerGraphEdgeRole {
  switch (role) {
    case 'userWire': return 'userWire';
    case 'defaultWire': return 'defaultWire';
    case 'implicitCoerce': return 'implicitCoerce';
    case 'internalHelper': return 'internalHelper';
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
 * Build backend input policies from per-instance input port metadata.
 *
 * // [LAW:single-enforcer] Frontend bridge is the only boundary that translates
 * editor input-port metadata into compiler backend policy data.
 */
function buildInputPortPolicies(
  draftBlocks: readonly DraftBlock[],
  expandedPatch: Patch,
  blockIndexMap: ReadonlyMap<string, BlockIndex>,
  registry: ReadonlyMap<string, BlockDef>,
): ReadonlyMap<PortKey, InputPortPolicy> {
  const policies = new Map<PortKey, InputPortPolicy>();

  for (const block of draftBlocks) {
    const blockIdx = blockIndexMap.get(block.id);
    if (blockIdx === undefined) continue;
    const blockDef = registry.get(block.type);
    if (!blockDef) continue;
    const sourcePatchBlock = expandedPatch.blocks.get(block.id as BlockId);

    for (const [portId, inputDef] of Object.entries(blockDef.inputs)) {
      if (inputDef.exposedAsPort === false) continue;
      const combineMode = sourcePatchBlock?.inputPorts.get(portId)?.combineMode ?? 'last';
      const key = `${blockIdx}:${portId}:in` as PortKey;
      policies.set(key, { combineMode });
    }
  }

  return policies;
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

// =============================================================================
// Port Acceptance Translation
// =============================================================================

/**
 * Translate portAcceptance from DraftPortKey-space to PortKey-space.
 */
function translatePortAcceptance(
  draftAcceptance: ReadonlyMap<DraftPortKey, CardinalityAcceptance>,
  blockIndexMap: ReadonlyMap<string, BlockIndex>,
): ReadonlyMap<PortKey, CardinalityAcceptance> {
  const result = new Map<PortKey, CardinalityAcceptance>();
  for (const [draftKey, acceptance] of draftAcceptance) {
    const translated = translatePortKey(draftKey, blockIndexMap);
    if (translated !== null) {
      result.set(translated, acceptance);
    }
  }
  return result;
}
