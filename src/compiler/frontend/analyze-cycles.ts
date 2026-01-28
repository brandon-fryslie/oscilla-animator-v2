/**
 * Frontend Cycle Analysis
 *
 * Analyzes the graph for cycles and produces a CycleSummary for UI consumption.
 * This is Frontend-only - it classifies cycles for diagnostics and suggested fixes,
 * NOT for execution scheduling.
 *
 * Rule: Frontend answers "what is the user looking at and how to fix it"
 *
 * References:
 * - .agent_planning/compiler-design-frontend-backend/ALIGNMENT.md §5 Gap 3
 * - .agent_planning/compiler-design-frontend-backend/Cycle-detection-frontend.md
 */

import type { TypedPatch, BlockIndex, NormalizedEdge } from '../ir/patches';
import type { Block } from '../../graph/Patch';
import { getBlockDefinition } from '../../blocks/registry';

// =============================================================================
// CycleSummary Types (exposed to UI)
// =============================================================================

/**
 * Classification of an SCC.
 */
export type SCCClassification = 'acyclic' | 'trivial-self-loop' | 'cyclic';

/**
 * Legality of a cycle.
 */
export type CycleLegality = 'legal-feedback' | 'instantaneous-illegal';

/**
 * Suggested fix for an illegal cycle.
 */
export interface CycleFix {
  /** Edge that needs a delay boundary */
  edgeId: string;
  /** Type of fix to suggest */
  suggestion: 'insert-delay' | 'insert-history' | 'insert-state-block';
}

/**
 * A strongly connected component with classification.
 */
export interface ClassifiedSCC {
  /** Unique identifier for this SCC */
  id: string;
  /** Block indices in this SCC */
  blocks: BlockIndex[];
  /** Classification: is this a real cycle? */
  classification: SCCClassification;
  /** Is this cycle legal (has state boundary) or illegal (instantaneous)? */
  legality: CycleLegality;
  /** If illegal, suggested fixes */
  suggestedFixes?: CycleFix[];
}

/**
 * Summary of all cycles in the graph, for UI consumption.
 */
export interface CycleSummary {
  /** All strongly connected components */
  sccs: ClassifiedSCC[];
  /** Whether any illegal cycles exist (blocks backend compilation) */
  hasIllegalCycles: boolean;
  /** Total count of each classification */
  counts: {
    acyclic: number;
    trivialSelfLoop: number;
    cyclic: number;
    legalFeedback: number;
    instantaneousIllegal: number;
  };
}

// =============================================================================
// Internal Types
// =============================================================================

interface DepNode {
  kind: 'BlockEval' | 'PortRead' | 'PortWrite';
  blockIndex: BlockIndex;
}

interface DepEdge {
  from: DepNode;
  to: DepNode;
  edgeId?: string;
}

interface TarjanState {
  index: number;
  stack: DepNode[];
  indices: Map<DepNode, number>;
  lowlinks: Map<DepNode, number>;
  onStack: Set<DepNode>;
  sccs: DepNode[][];
}

// =============================================================================
// Tarjan's Algorithm (for Frontend cycle classification)
// =============================================================================

/**
 * Build a simple dependency graph from blocks and edges.
 * This graph is used only for cycle detection, not execution ordering.
 */
function buildDependencyGraph(
  blocks: readonly Block[],
  edges: readonly NormalizedEdge[]
): { nodes: DepNode[]; edges: DepEdge[] } {
  const nodes: DepNode[] = blocks.map((_, i) => ({
    kind: 'BlockEval' as const,
    blockIndex: i as BlockIndex,
  }));

  const depEdges: DepEdge[] = [];
  for (const edge of edges) {
    // NormalizedEdge uses fromBlock/toBlock (dense indices)
    const fromIdx = edge.fromBlock as number;
    const toIdx = edge.toBlock as number;
    if (fromIdx < blocks.length && toIdx < blocks.length) {
      depEdges.push({
        from: nodes[fromIdx],
        to: nodes[toIdx],
        // NormalizedEdge doesn't have id, generate one for UI purposes
        edgeId: `${fromIdx}:${edge.fromPort}->${toIdx}:${edge.toPort}`,
      });
    }
  }

  return { nodes, edges: depEdges };
}

/**
 * Run Tarjan's SCC algorithm.
 */
function tarjanSCC(nodes: DepNode[], edges: DepEdge[]): DepNode[][] {
  const state: TarjanState = {
    index: 0,
    stack: [],
    indices: new Map(),
    lowlinks: new Map(),
    onStack: new Set(),
    sccs: [],
  };

  function strongConnect(v: DepNode): void {
    state.indices.set(v, state.index);
    state.lowlinks.set(v, state.index);
    state.index++;
    state.stack.push(v);
    state.onStack.add(v);

    // Consider successors of v
    for (const edge of edges) {
      if (edge.from !== v) continue;
      const w = edge.to;

      if (!state.indices.has(w)) {
        strongConnect(w);
        state.lowlinks.set(v, Math.min(state.lowlinks.get(v)!, state.lowlinks.get(w)!));
      } else if (state.onStack.has(w)) {
        state.lowlinks.set(v, Math.min(state.lowlinks.get(v)!, state.indices.get(w)!));
      }
    }

    // If v is a root node, pop the stack and generate an SCC
    if (state.lowlinks.get(v) === state.indices.get(v)) {
      const sccNodes: DepNode[] = [];
      let w: DepNode;
      do {
        w = state.stack.pop()!;
        state.onStack.delete(w);
        sccNodes.push(w);
      } while (w !== v);

      state.sccs.push(sccNodes);
    }
  }

  for (const node of nodes) {
    if (!state.indices.has(node)) {
      strongConnect(node);
    }
  }

  return state.sccs;
}

/**
 * Check if a node has a self-loop.
 */
function hasSelfLoop(edges: DepEdge[], node: DepNode): boolean {
  return edges.some((e) => e.from === node && e.to === node);
}

/**
 * Check if an SCC has a state boundary (breaks instantaneous dependency).
 */
function hasStateBoundary(sccNodes: DepNode[], blocks: readonly Block[]): boolean {
  return sccNodes.some((node) => {
    if (node.kind === 'BlockEval') {
      const block = blocks[node.blockIndex];
      const blockDef = getBlockDefinition(block.type);
      if (!blockDef) return false;
      return blockDef.isStateful === true;
    }
    return false;
  });
}

/**
 * Find edges involved in a cycle for suggesting fixes.
 */
function findCycleEdges(sccNodes: DepNode[], edges: DepEdge[]): string[] {
  const nodeSet = new Set(sccNodes);
  return edges
    .filter((e) => nodeSet.has(e.from) && nodeSet.has(e.to) && e.edgeId)
    .map((e) => e.edgeId!);
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Analyze cycles in the typed patch and produce a CycleSummary for UI.
 *
 * This is a Frontend pass - it classifies cycles for diagnostics,
 * NOT for execution scheduling (that's Backend).
 *
 * @param typedPatch - The typed patch from analyze-type-graph
 * @returns CycleSummary for UI consumption
 */
export function analyzeCycles(typedPatch: TypedPatch): CycleSummary {
  const { blocks, edges } = typedPatch;
  const graph = buildDependencyGraph(blocks, edges);
  const rawSccs = tarjanSCC(graph.nodes, graph.edges);

  const classifiedSccs: ClassifiedSCC[] = [];
  const counts = {
    acyclic: 0,
    trivialSelfLoop: 0,
    cyclic: 0,
    legalFeedback: 0,
    instantaneousIllegal: 0,
  };

  let sccIndex = 0;
  for (const sccNodes of rawSccs) {
    const blockIndices = sccNodes
      .filter((n) => n.kind === 'BlockEval')
      .map((n) => n.blockIndex);

    // Determine classification
    let classification: SCCClassification;
    if (sccNodes.length === 1 && !hasSelfLoop(graph.edges, sccNodes[0])) {
      classification = 'acyclic';
      counts.acyclic++;
    } else if (sccNodes.length === 1 && hasSelfLoop(graph.edges, sccNodes[0])) {
      classification = 'trivial-self-loop';
      counts.trivialSelfLoop++;
    } else {
      classification = 'cyclic';
      counts.cyclic++;
    }

    // Determine legality (only matters for non-acyclic)
    let legality: CycleLegality = 'legal-feedback';
    let suggestedFixes: CycleFix[] | undefined;

    if (classification !== 'acyclic') {
      if (hasStateBoundary(sccNodes, blocks)) {
        legality = 'legal-feedback';
        counts.legalFeedback++;
      } else {
        legality = 'instantaneous-illegal';
        counts.instantaneousIllegal++;

        // Suggest fixes for illegal cycles
        const cycleEdgeIds = findCycleEdges(sccNodes, graph.edges);
        suggestedFixes = cycleEdgeIds.slice(0, 3).map((edgeId) => ({
          edgeId,
          suggestion: 'insert-delay' as const,
        }));
      }
    }

    classifiedSccs.push({
      id: `scc-${sccIndex++}`,
      blocks: blockIndices,
      classification,
      legality,
      suggestedFixes,
    });
  }

  return {
    sccs: classifiedSccs,
    hasIllegalCycles: counts.instantaneousIllegal > 0,
    counts,
  };
}
