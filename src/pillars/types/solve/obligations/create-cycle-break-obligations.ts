/**
 * src/pillars/types/solve/obligations/create-cycle-break-obligations.ts
 *
 * Detects algebraic cycles in the user-authored edge graph (DFS) and emits
 * one `needsCycleBreak` obligation per detected cycle. The obligation anchors
 * to the back-edge identified by DFS. The cycle-break policy will insert a
 * `UnitDelay` on that edge.
 *
 * Only user-authored edges are considered (elaboration edges already break
 * cycles by design — a UnitDelay IS an elaboration edge). [LAW:decomposition]
 */

import type { MutableGraph, Obligation } from '../typed-graph';
import { obligationId } from '../typed-graph';

export function createCycleBreakObligations(graph: MutableGraph): Obligation[] {
  const obligations: Obligation[] = [];

  // Build adjacency list (user edges only, one back-edge detection per edge)
  const adj = new Map<string, { edgeId: string; target: string }[]>();
  for (const block of graph.blocks) {
    adj.set(block.id, []);
  }
  for (const edge of graph.edges) {
    if (edge.origin.kind === 'elaboration') continue;
    adj.get(edge.source)?.push({ edgeId: edge.id, target: edge.target });
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const emittedEdges = new Set<string>();

  const dfs = (node: string): void => {
    color.set(node, GRAY);
    for (const { edgeId, target } of adj.get(node) ?? []) {
      if (emittedEdges.has(edgeId)) continue;
      const c = color.get(target) ?? WHITE;
      if (c === GRAY) {
        // Back edge → cycle
        emittedEdges.add(edgeId);
        const id = obligationId(`needsCycleBreak:${edgeId}`);
        obligations.push({
          id,
          kind: 'needsCycleBreak',
          anchor: { kind: 'edge', edgeId },
          status: { kind: 'open' },
          deps: [],
          policy: { name: 'cycleBreak.v1' },
          debug: { createdBy: 'createCycleBreakObligations', note: `back edge to ${target}` },
        });
      } else if (c === WHITE) {
        dfs(target);
      }
    }
    color.set(node, BLACK);
  };

  for (const block of graph.blocks) {
    if ((color.get(block.id) ?? WHITE) === WHITE) {
      dfs(block.id);
    }
  }

  return obligations;
}
