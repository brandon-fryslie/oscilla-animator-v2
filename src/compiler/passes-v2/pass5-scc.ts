/**
 * Pass 5: Cycle Validation (SCC)
 *
 * Validates the dependency graph for cycles using Tarjan's strongly connected
 * component (SCC) algorithm. Legal cycles must have at least one state boundary
 * block (isStateful === true).
 *
 * This pass ensures feedback loops are well-formed under the memory semantics.
 *
 * References:
 * - HANDOFF.md Topic 6: Pass 5 - Cycle Validation
 * - design-docs/12-Compiler-Final/15-Canonical-Lowering-Pipeline.md § Pass 5
 * - https://en.wikipedia.org/wiki/Tarjan%27s_strongly_connected_components_algorithm
 */

import type {
  DepGraphWithTimeModel,
  DepGraph,
  DepNode,
  SCC,
  AcyclicOrLegalGraph,
  IllegalCycleError,
  BlockIndex,
} from "../ir/patches";
import type { Block } from "../../graph/Patch";
import { getBlockDefinition } from "../../blocks/registry";

/**
 * Tarjan's SCC algorithm state.
 */
interface TarjanState {
  index: number;
  stack: DepNode[];
  indices: Map<DepNode, number>;
  lowlinks: Map<DepNode, number>;
  onStack: Set<DepNode>;
  sccs: SCC[];
}

/**
 * Run Tarjan's strongly connected components algorithm.
 *
 * @param graph - The dependency graph
 * @param blocks - The blocks (for state boundary checking)
 * @returns Array of SCCs with state boundary information
 */
function tarjanSCC(graph: DepGraph, blocks: readonly Block[]): SCC[] {
  const state: TarjanState = {
    index: 0,
    stack: [],
    indices: new Map(),
    lowlinks: new Map(),
    onStack: new Set(),
    sccs: [],
  };

  // Visit each node
  for (const node of graph.nodes) {
    if (!state.indices.has(node)) {
      strongConnect(node, graph, blocks, state);
    }
  }

  return state.sccs;
}

/**
 * Tarjan's strongConnect procedure.
 */
function strongConnect(
  v: DepNode,
  graph: DepGraph,
  blocks: readonly Block[],
  state: TarjanState
): void {
  // Set the depth index for v to the smallest unused index
  state.indices.set(v, state.index);
  state.lowlinks.set(v, state.index);
  state.index++;
  state.stack.push(v);
  state.onStack.add(v);

  // Consider successors of v
  for (const edge of graph.edges) {
    if (edge.from !== v) continue;
    const w = edge.to;

    if (!state.indices.has(w)) {
      // Successor w has not yet been visited; recurse on it
      strongConnect(w, graph, blocks, state);
      state.lowlinks.set(v, Math.min(state.lowlinks.get(v)!, state.lowlinks.get(w)!));
    } else if (state.onStack.has(w)) {
      // Successor w is in stack S and hence in the current SCC
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

    // Check if any block in this SCC has a state boundary
    const hasStateBoundary = sccNodes.some((node) => {
      if (node.kind === "BlockEval") {
        const block = blocks[node.blockIndex];
        const blockDef = getBlockDefinition(block.type);
        if (!blockDef) return false;
        // Check if block breaks combinatorial cycles (has state)
        return blockDef.isStateful === true;
      }
      return false;
    });

    state.sccs.push({
      nodes: sccNodes,
      hasStateBoundary,
    });
  }
}

/**
 * Check if a node has a self-loop.
 */
function hasSelfLoop(graph: DepGraph, node: DepNode): boolean {
  return graph.edges.some((e) => e.from === node && e.to === node);
}

/**
 * Pass 5: Cycle Validation
 *
 * Detects cycles in the dependency graph and validates that all cycles have
 * at least one state boundary block.
 *
 * Legal cycles:
 * - Trivial cycles (single node with no self-loop)
 * - Cycles containing at least one block with isStateful=true
 *
 * Illegal cycles:
 * - Multi-node cycles with no state boundary
 * - Single-node cycles with self-loop and no state boundary
 *
 * Uses Tarjan's SCC algorithm for efficient cycle detection.
 *
 * References:
 * - design-docs/12-Compiler-Final/15-Canonical-Lowering-Pipeline.md § Pass 5
 * - design-docs/12-Compiler-Final/10-Memory-Semantics.md § Combinatorial Cycles
 *
 * @param depGraphWithTime - The dependency graph with time model from Pass 4
 * @returns A validated graph with SCC information
 */
export function pass5CycleValidation(
  depGraphWithTime: DepGraphWithTimeModel
): AcyclicOrLegalGraph {
  const errors: IllegalCycleError[] = [];

  // Get blocks from depGraphWithTime
  const blocks = depGraphWithTime.blocks;

  // Step 1: Run Tarjan's SCC algorithm
  const sccs = tarjanSCC(depGraphWithTime.graph, blocks);

  // Step 2: Validate non-trivial SCCs have state boundaries
  for (const scc of sccs) {
    // Skip trivial SCCs (size 1, no self-loop)
    if (scc.nodes.length === 1 && !hasSelfLoop(depGraphWithTime.graph, scc.nodes[0])) {
      continue;
    }

    // Check if SCC has a state boundary
    if (!scc.hasStateBoundary) {
      // Extract block indices from SCC for error reporting
      const blockIndices = scc.nodes
        .filter((n): n is { kind: "BlockEval"; blockIndex: BlockIndex } =>
          n.kind === "BlockEval"
        )
        .map((n: { kind: "BlockEval"; blockIndex: BlockIndex }) => n.blockIndex);

      errors.push({
        kind: "IllegalCycle",
        nodes: blockIndices,
      });
    }
  }

  // Throw if there are illegal cycles
  if (errors.length > 0) {
    const errorSummary = errors
      .map((e) => `  - IllegalCycle: blocks [${e.nodes.join(', ')}]`)
      .join("\n");
    throw new Error(
      `Pass 5 (Cycle Validation) failed with ${errors.length} error(s):\n${errorSummary}`
    );
  }

  // Return validated graph with SCC information and portTypes/blocks/edges threaded through
  return {
    graph: depGraphWithTime.graph,
    timeModel: depGraphWithTime.timeModel,
    portTypes: depGraphWithTime.portTypes,
    blocks: depGraphWithTime.blocks,
    edges: depGraphWithTime.edges,
    sccs,
    errors,
  };
}
