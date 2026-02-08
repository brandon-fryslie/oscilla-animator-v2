/**
 * Create Cycle Break Obligations from Algebraic Cycles
 *
 * Detects directed cycles in the same-frame dependency graph using Tarjan's SCC algorithm.
 * When a cycle is detected without a delay block, creates a needsCycleBreak obligation
 * to insert a UnitDelay block.
 *
 * Monotone strategy: one obligation per iteration keeps the fixpoint predictable.
 *
 * // [LAW:dataflow-not-control-flow] Always computes candidates; selection is by sorting data, not branching control.
 * // [LAW:single-enforcer] This is the only place that creates cycle break obligations.
 */

import type { DraftGraph, DraftEdge } from './draft-graph';
import type { Obligation, ObligationId } from './obligations';
import type { BlockDef } from '../../blocks/registry';
import { hasLowerOutputsOnly } from '../../blocks/registry';

// =============================================================================
// SCC Detection (Tarjan's Algorithm)
// =============================================================================

interface TarjanState {
  index: number;
  stack: string[];
  indices: Map<string, number>;
  lowLinks: Map<string, number>;
  onStack: Set<string>;
  sccs: string[][];
}

/**
 * Tarjan's algorithm for strongly connected components.
 * Returns array of SCCs (each SCC is an array of block IDs).
 */
function tarjanSCC(graph: Map<string, Set<string>>): string[][] {
  const state: TarjanState = {
    index: 0,
    stack: [],
    indices: new Map(),
    lowLinks: new Map(),
    onStack: new Set(),
    sccs: [],
  };

  for (const node of graph.keys()) {
    if (!state.indices.has(node)) {
      strongConnect(node, graph, state);
    }
  }

  return state.sccs;
}

function strongConnect(v: string, graph: Map<string, Set<string>>, state: TarjanState): void {
  state.indices.set(v, state.index);
  state.lowLinks.set(v, state.index);
  state.index++;
  state.stack.push(v);
  state.onStack.add(v);

  const successors = graph.get(v) ?? new Set();
  for (const w of successors) {
    if (!state.indices.has(w)) {
      strongConnect(w, graph, state);
      state.lowLinks.set(v, Math.min(state.lowLinks.get(v)!, state.lowLinks.get(w)!));
    } else if (state.onStack.has(w)) {
      state.lowLinks.set(v, Math.min(state.lowLinks.get(v)!, state.indices.get(w)!));
    }
  }

  if (state.lowLinks.get(v) === state.indices.get(v)) {
    const scc: string[] = [];
    let w: string;
    do {
      w = state.stack.pop()!;
      state.onStack.delete(w);
      scc.push(w);
    } while (w !== v);
    state.sccs.push(scc);
  }
}

// =============================================================================
// Same-Frame Dependency Graph
// =============================================================================

interface EdgeInfo {
  id: string;
  fromBlockId: string;
  fromPort: string;
  toBlockId: string;
  toPort: string;
  origin: DraftEdge['origin'];
}

/**
 * Build same-frame dependency graph.
 *
 * The adjacency list represents the FORWARD data flow graph:
 * adjList[A] = set of blocks that A flows to (A → B means adjList[A] contains B).
 *
 * An edge A → B is included if:
 * - A does NOT have lowerOutputsOnly (A's outputs are available in the same frame)
 *
 * This creates the graph we need for cycle detection: if A→B→C→A forms a cycle,
 * then adjList[A] contains B, adjList[B] contains C, adjList[C] contains A.
 *
 * // [LAW:single-enforcer] hasLowerOutputsOnly is the single predicate for delay semantics.
 */
function buildSameFrameDepGraph(
  g: DraftGraph,
  registry: ReadonlyMap<string, BlockDef>,
): { adjList: Map<string, Set<string>>; edgeInfo: Map<string, EdgeInfo> } {
  const adjList = new Map<string, Set<string>>();
  const edgeInfo = new Map<string, EdgeInfo>();

  // Initialize adjacency list for all blocks
  for (const block of g.blocks) {
    if (!adjList.has(block.id)) {
      adjList.set(block.id, new Set());
    }
  }

  for (const edge of g.edges) {
    const fromBlock = g.blocks.find((b) => b.id === edge.from.blockId);
    const fromBlockDef = fromBlock ? registry.get(fromBlock.type) : undefined;
    if (!fromBlockDef) continue;

    // Skip edges from blocks with lowerOutputsOnly (they break same-frame deps)
    if (hasLowerOutputsOnly(fromBlockDef)) continue;

    // Add forward edge: fromBlock flows to toBlock
    const successors = adjList.get(edge.from.blockId) ?? new Set();
    successors.add(edge.to.blockId);
    adjList.set(edge.from.blockId, successors);

    // Store edge info for later
    const edgeKey = `${edge.from.blockId}:${edge.from.port}->${edge.to.blockId}:${edge.to.port}`;
    edgeInfo.set(edgeKey, {
      id: edge.id,
      fromBlockId: edge.from.blockId,
      fromPort: edge.from.port,
      toBlockId: edge.to.blockId,
      toPort: edge.to.port,
      origin: edge.origin,
    });
  }

  return { adjList, edgeInfo };
}

// =============================================================================
// Non-Trivial SCC Detection
// =============================================================================

/**
 * Check if an SCC is non-trivial (size > 1 or has a self-loop).
 */
function isNonTrivialSCC(
  scc: string[],
  adjList: Map<string, Set<string>>,
): boolean {
  if (scc.length > 1) return true;
  if (scc.length === 1) {
    const node = scc[0];
    const successors = adjList.get(node) ?? new Set();
    return successors.has(node); // Self-loop
  }
  return false;
}

/**
 * Check if an SCC already has a delay block (lowerOutputsOnly).
 */
function sccAlreadyBroken(
  scc: string[],
  g: DraftGraph,
  registry: ReadonlyMap<string, BlockDef>,
): boolean {
  for (const blockId of scc) {
    const block = g.blocks.find((b) => b.id === blockId);
    if (!block) continue;
    const blockDef = registry.get(block.type);
    if (blockDef && hasLowerOutputsOnly(blockDef)) {
      return true;
    }
  }
  return false;
}

// =============================================================================
// Cut Edge Selection
// =============================================================================

interface CutEdgeCandidate {
  edgeId: string;
  semanticKey: string;
  fromBlockId: string;
  fromPort: string;
  toBlockId: string;
  toPort: string;
  isElaboration: boolean;
}

/**
 * Select one cut edge from an SCC.
 * Prefers non-elaboration edges, then lexicographic order.
 */
function selectCutEdge(
  scc: string[],
  g: DraftGraph,
  edgeInfo: Map<string, EdgeInfo>,
): CutEdgeCandidate | null {
  const sccSet = new Set(scc);
  const candidates: CutEdgeCandidate[] = [];

  // Collect internal edges
  for (const edge of g.edges) {
    if (!sccSet.has(edge.from.blockId) || !sccSet.has(edge.to.blockId)) continue;

    const semanticKey = `${edge.from.blockId}:${edge.from.port}->${edge.to.blockId}:${edge.to.port}`;
    const isElaboration = typeof edge.origin === 'object' && edge.origin.kind === 'elaboration';

    candidates.push({
      edgeId: edge.id,
      semanticKey,
      fromBlockId: edge.from.blockId,
      fromPort: edge.from.port,
      toBlockId: edge.to.blockId,
      toPort: edge.to.port,
      isElaboration,
    });
  }

  if (candidates.length === 0) return null;

  // Sort: non-elaboration first, then lexicographic
  candidates.sort((a, b) => {
    if (a.isElaboration !== b.isElaboration) {
      return a.isElaboration ? 1 : -1; // Non-elaboration first
    }
    return a.semanticKey.localeCompare(b.semanticKey);
  });

  return candidates[0];
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Create cycle break obligations from algebraic cycles.
 *
 * Algorithm:
 * 1. Build same-frame dependency graph (exclude edges from lowerOutputsOnly blocks)
 * 2. Run Tarjan's SCC to find cycles
 * 3. Filter to non-trivial SCCs
 * 4. Skip SCCs with existing delay blocks
 * 5. Select one cut edge per SCC (prefer non-elaboration)
 * 6. Return at most ONE obligation (monotone)
 *
 * Returns 0 or 1 obligations.
 */
export function createCycleBreakObligations(
  g: DraftGraph,
  registry: ReadonlyMap<string, BlockDef>,
): readonly Obligation[] {
  // Step 1: Build same-frame dependency graph
  const { adjList, edgeInfo } = buildSameFrameDepGraph(g, registry);

  // Step 2: Run Tarjan's SCC
  const sccs = tarjanSCC(adjList);

  // Step 3 + 4: Filter to non-trivial SCCs without existing delay blocks
  const problematicSCCs = sccs.filter((scc) => {
    if (!isNonTrivialSCC(scc, adjList)) return false;
    if (sccAlreadyBroken(scc, g, registry)) return false;
    return true;
  });

  if (problematicSCCs.length === 0) return [];

  // Step 5: Select cut edges for each SCC
  const cutEdges: Array<{ scc: string[]; edge: CutEdgeCandidate }> = [];
  for (const scc of problematicSCCs) {
    const cutEdge = selectCutEdge(scc, g, edgeInfo);
    if (cutEdge) {
      cutEdges.push({ scc, edge: cutEdge });
    }
  }

  if (cutEdges.length === 0) return [];

  // Step 6: Pick exactly ONE — monotone, one per iteration
  // Sort by SCC ID (sorted member IDs joined), then by cut edge semantic key
  cutEdges.sort((a, b) => {
    const sccIdA = [...a.scc].sort().join('|');
    const sccIdB = [...b.scc].sort().join('|');
    const cmp = sccIdA.localeCompare(sccIdB);
    if (cmp !== 0) return cmp;
    return a.edge.semanticKey.localeCompare(b.edge.semanticKey);
  });

  const pick = cutEdges[0];
  const sccId = [...pick.scc].sort().join('|');
  const edgeKey = `${pick.edge.fromBlockId}:${pick.edge.fromPort}->${pick.edge.toBlockId}:${pick.edge.toPort}`;
  const oblId = `needsCycleBreak:${edgeKey}` as ObligationId;

  return [{
    id: oblId,
    kind: 'needsCycleBreak',
    anchor: {
      edgeId: pick.edge.edgeId,
      blockId: pick.edge.fromBlockId,
    },
    status: { kind: 'open' },
    deps: [],  // No type deps — cycle detection is structural
    policy: { name: 'cycleBreak.v1', version: 1 },
    debug: {
      createdBy: 'createCycleBreakObligations',
      note: `scc: ${sccId}; cut: ${edgeKey}`,
    },
  }];
}
