/**
 * Graph Algorithms - SCC Detection, Topological Sort
 *
 * Tarjan's algorithm for strongly connected components.
 * Clean, deterministic, no external dependencies.
 */

// =============================================================================
// Types
// =============================================================================

export type NodeId = string;

export interface AdjacencyGraph<T extends NodeId = NodeId> {
  /** Adjacency list: nodeId -> nodes it connects to */
  readonly edges: Map<T, T[]>;
  /** All node IDs */
  readonly nodes: Set<T>;
}

export interface SCC<T extends NodeId = NodeId> {
  id: string;
  nodes: T[];
  leader: T;
}

interface TarjanState<T extends NodeId> {
  index: number;
  stack: T[];
  indices: Map<T, number>;
  lowlinks: Map<T, number>;
  onStack: Set<T>;
  sccs: T[][];
}

// =============================================================================
// Tarjan's SCC Algorithm
// =============================================================================

/**
 * Find strongly connected components using Tarjan's algorithm.
 * Returns SCCs in reverse topological order (leaves first).
 */
export function tarjanSCC<T extends NodeId>(graph: AdjacencyGraph<T>): T[][] {
  const state: TarjanState<T> = {
    index: 0,
    stack: [],
    indices: new Map(),
    lowlinks: new Map(),
    onStack: new Set(),
    sccs: [],
  };

  // Sort nodes for determinism
  const sortedNodes = Array.from(graph.nodes).sort();

  for (const node of sortedNodes) {
    if (!state.indices.has(node)) {
      strongconnect(node, graph, state);
    }
  }

  return state.sccs;
}

function strongconnect<T extends NodeId>(
  v: T,
  graph: AdjacencyGraph<T>,
  state: TarjanState<T>
): void {
  state.indices.set(v, state.index);
  state.lowlinks.set(v, state.index);
  state.index++;
  state.stack.push(v);
  state.onStack.add(v);

  const successors = graph.edges.get(v) ?? [];
  const sortedSuccessors = [...successors].sort();

  for (const w of sortedSuccessors) {
    if (!state.indices.has(w)) {
      strongconnect(w, graph, state);
      state.lowlinks.set(v, Math.min(state.lowlinks.get(v)!, state.lowlinks.get(w)!));
    } else if (state.onStack.has(w)) {
      state.lowlinks.set(v, Math.min(state.lowlinks.get(v)!, state.indices.get(w)!));
    }
  }

  if (state.lowlinks.get(v) === state.indices.get(v)) {
    const scc: T[] = [];
    let w: T;
    do {
      w = state.stack.pop()!;
      state.onStack.delete(w);
      scc.push(w);
    } while (w !== v);

    scc.sort();
    state.sccs.push(scc);
  }
}

/**
 * Convert raw SCC arrays to SCC objects with IDs and leaders.
 */
export function processSccs<T extends NodeId>(sccArrays: T[][]): SCC<T>[] {
  return sccArrays.map((nodes) => {
    const leader = nodes[0];
    const id = `scc-${nodes.join('-')}`;
    return { id, nodes, leader };
  });
}

/**
 * Build SCC membership map.
 */
export function buildSccMap<T extends NodeId>(sccs: SCC<T>[]): Map<T, SCC<T>> {
  const map = new Map<T, SCC<T>>();
  for (const scc of sccs) {
    for (const node of scc.nodes) {
      map.set(node, scc);
    }
  }
  return map;
}

// =============================================================================
// Topological Sort
// =============================================================================

/**
 * Topological sort using Kahn's algorithm.
 * Returns undefined if cycle detected.
 */
export function topologicalSort<T extends NodeId>(graph: AdjacencyGraph<T>): T[] | undefined {
  const inDegree = new Map<T, number>();
  const result: T[] = [];

  // Initialize in-degrees
  for (const node of graph.nodes) {
    inDegree.set(node, 0);
  }

  for (const [, successors] of graph.edges) {
    for (const succ of successors) {
      inDegree.set(succ, (inDegree.get(succ) ?? 0) + 1);
    }
  }

  // Find all sources (in-degree 0)
  const queue: T[] = [];
  for (const [node, degree] of inDegree) {
    if (degree === 0) queue.push(node);
  }
  queue.sort(); // Determinism

  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);

    const successors = graph.edges.get(node) ?? [];
    for (const succ of successors) {
      const newDegree = inDegree.get(succ)! - 1;
      inDegree.set(succ, newDegree);
      if (newDegree === 0) {
        // Insert sorted for determinism
        const insertIdx = queue.findIndex(n => n > succ);
        if (insertIdx === -1) queue.push(succ);
        else queue.splice(insertIdx, 0, succ);
      }
    }
  }

  // Check for cycles
  if (result.length !== graph.nodes.size) {
    return undefined; // Cycle detected
  }

  return result;
}

/**
 * Detect if graph has any cycles.
 */
export function hasCycles<T extends NodeId>(graph: AdjacencyGraph<T>): boolean {
  return topologicalSort(graph) === undefined;
}

/**
 * Find all cycles (as SCCs with more than one node, or self-loops).
 */
export function findCycles<T extends NodeId>(graph: AdjacencyGraph<T>): T[][] {
  const sccs = tarjanSCC(graph);
  return sccs.filter(scc => {
    if (scc.length > 1) return true;
    // Check for self-loop
    const node = scc[0];
    const edges = graph.edges.get(node) ?? [];
    return edges.includes(node);
  });
}
