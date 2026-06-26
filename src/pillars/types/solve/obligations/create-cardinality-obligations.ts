/**
 * src/pillars/types/solve/obligations/create-cardinality-obligations.ts
 *
 * Creates `needsCardinalityAdapter` obligations from cardinality solver
 * conflicts. Only structural conflicts (`ClampManyConflict`) become obligations;
 * terminal errors become diagnostics directly.
 *
 * MONOTONE ONE-AT-A-TIME: emits at most ONE obligation per iteration. Inserting
 * a `Broadcast` on one edge changes which groups are still in conflict; inserting
 * multiple simultaneously risks over-broadcasting. [LAW:no-ambient-temporal-coupling]
 */

import type { CardinalitySolveError } from '../cardinality';
import { isStructuralCardinalityConflict } from '../cardinality';
import type { MutableGraph, Obligation } from '../typed-graph';
import { obligationId } from '../typed-graph';

export function createCardinalityObligations(
  graph: MutableGraph,
  cardErrors: readonly CardinalitySolveError[],
): Obligation[] {
  const structural = cardErrors.filter(isStructuralCardinalityConflict);
  if (structural.length === 0) return [];

  // ONE per iteration — take the first structural conflict only.
  const conflict = structural[0];

  // Derive a stable semantic key from the conflict ports (sorted for determinism).
  const portList = [...conflict.ports].sort().join(',');
  const id = obligationId(`needsCardinalityAdapter:${portList}`);

  // Find an edge whose endpoints match the conflict ports.
  // The anchor is the first edge we can find that involves these ports.
  let anchorEdgeId: string | undefined;
  for (const edge of graph.edges) {
    // Check if this edge's source or target fields are in the conflict
    const srcPattern = `${edge.source}:${edge.outputSlot}:`;
    const tgtPattern = `${edge.target}:${edge.inputSlot}:`;
    const involves = conflict.ports.some(
      (p) => p.startsWith(srcPattern) || p.startsWith(tgtPattern),
    );
    if (involves && edge.origin.kind !== 'elaboration') {
      anchorEdgeId = edge.id;
      break;
    }
  }

  if (anchorEdgeId === undefined) {
    // Can't find a user edge for this conflict; skip.
    return [];
  }

  return [
    {
      id,
      kind: 'needsCardinalityAdapter',
      anchor: { kind: 'edge', edgeId: anchorEdgeId },
      status: { kind: 'open' },
      deps: [], // cardinality adapter doesn't wait for type resolution
      policy: { name: 'cardinalityAdapters.v1' },
      debug: { createdBy: 'createCardinalityObligations', note: `ports: ${portList}` },
    },
  ];
}
