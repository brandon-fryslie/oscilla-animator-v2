/**
 * src/pillars/types/solve/apply-elaboration.ts
 *
 * Applies an `ElaborationPlan` to a `MutableGraph`, producing a new graph with
 * bumped revision. The operation is idempotent: if every block/edge the plan
 * would add already exists in the graph, it's a no-op. If only SOME exist →
 * corruption, surfaced as a throw rather than a silent partial update.
 * [LAW:no-silent-failure] [LAW:effects-at-boundaries]
 *
 * Sorted-by-id invariant is maintained: every array modification re-sorts
 * before returning. [LAW:no-ambient-temporal-coupling]
 */

import type { ElaborationPlan, MutableBlock, MutableEdge, MutableGraph, Obligation } from './typed-graph';
import { discharged, isOpen } from './typed-graph';

const sortById = <T extends { readonly id: string }>(arr: readonly T[]): T[] =>
  [...arr].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

const sortByObId = (arr: readonly Obligation[]): Obligation[] =>
  [...arr].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

export function applyElaborationPlan(graph: MutableGraph, plan: ElaborationPlan): MutableGraph {
  const addBlocks = plan.addBlocks ?? [];
  const addEdges = plan.addEdges ?? [];
  const removeBlockIds = new Set(plan.removeBlockIds ?? []);
  const replaceEdges = plan.replaceEdges ?? [];

  // Idempotency: all-present is a no-op; partial-present is corruption.
  const existingBlockIds = new Set(graph.blocks.map((b) => b.id));
  const existingEdgeIds = new Set(graph.edges.map((e) => e.id));
  const presentBlocks = addBlocks.filter((b) => existingBlockIds.has(b.id)).length;
  const presentEdges = addEdges.filter((e) => existingEdgeIds.has(e.id)).length;

  if (presentBlocks === addBlocks.length && presentEdges === addEdges.length && replaceEdges.length === 0 && removeBlockIds.size === 0) {
    // Structurally a no-op — but the obligation lifecycle stays monotone: the
    // plan's artifacts all exist, so the obligation is discharged either way.
    // [LAW:no-silent-failure]
    const target = graph.obligations.find((o) => o.id === plan.obligationId);
    if (!target || !isOpen(target)) return graph;
    const obligations = sortByObId(
      graph.obligations.map((o) =>
        o.id === plan.obligationId && isOpen(o)
          ? discharged(o, addBlocks.map((b) => b.id), addEdges.map((e) => e.id))
          : o,
      ),
    );
    return { ...graph, obligations, revision: graph.revision + 1 };
  }
  if (presentBlocks > 0 || presentEdges > 0) {
    // Partial presence → corruption; surface loudly. [LAW:no-silent-failure]
    throw new Error(
      `[applyElaborationPlan] Partial overlap for obligation ${plan.obligationId}: ` +
      `${presentBlocks}/${addBlocks.length} blocks and ${presentEdges}/${addEdges.length} edges already present.`,
    );
  }

  // Remove blocks (and their connected edges)
  const removedEdgeIds = new Set<string>();
  let blocks: readonly MutableBlock[] = graph.blocks.filter((b) => {
    if (!removeBlockIds.has(b.id)) return true;
    // Mark edges connected to removed blocks for removal
    return false;
  });
  for (const edge of graph.edges) {
    if (removeBlockIds.has(edge.source) || removeBlockIds.has(edge.target)) {
      removedEdgeIds.add(edge.id);
    }
  }

  // Process replaceEdges: collect edge ids to remove and new edges to add.
  // A remove id absent from the graph means two plans raced for the same edge
  // (or a stale replan) — silently skipping the removal would leave parallel
  // adapter chains, so it fails loudly instead. [LAW:no-silent-failure]
  const replaceRemoveIds = new Set<string>();
  const replaceAddEdges: MutableEdge[] = [];
  for (const rep of replaceEdges) {
    if (!existingEdgeIds.has(rep.remove)) {
      throw new Error(
        `[applyElaborationPlan] Plan for obligation ${plan.obligationId} replaces ` +
        `edge '${rep.remove}' which is not in the graph.`,
      );
    }
    replaceRemoveIds.add(rep.remove);
    replaceAddEdges.push(...rep.add);
  }

  let edges: readonly MutableEdge[] = graph.edges.filter(
    (e) => !removedEdgeIds.has(e.id) && !replaceRemoveIds.has(e.id),
  );

  blocks = sortById([...blocks, ...addBlocks]);
  edges = sortById([...edges, ...addEdges, ...replaceAddEdges]);

  // Discharge the obligation
  const obligations = sortByObId(
    graph.obligations.map((o) =>
      o.id === plan.obligationId && isOpen(o)
        ? discharged(o, [...addBlocks.map((b) => b.id)], [...addEdges.map((e) => e.id), ...replaceAddEdges.map((e) => e.id)])
        : o,
    ),
  );

  return { blocks, edges, obligations, revision: graph.revision + 1 };
}

/**
 * Apply all plans in order. Each plan is applied to the running graph.
 * Earlier plans' mutations are visible to later plans (important for idempotency
 * checks on replaceEdges that may share ids with addEdges from an earlier plan).
 */
export function applyAllPlans(graph: MutableGraph, plans: readonly ElaborationPlan[]): MutableGraph {
  let g = graph;
  for (const plan of plans) {
    g = applyElaborationPlan(g, plan);
  }
  return g;
}

// ---------------------------------------------------------------------------
// addObligationsIfMissing — dedup by obligation ID
// ---------------------------------------------------------------------------

export function addObligationsIfMissing(
  graph: MutableGraph,
  newObs: readonly import('./typed-graph').Obligation[],
): { graph: MutableGraph; added: number } {
  const existingIds = new Set(graph.obligations.map((o) => o.id));
  const toAdd = newObs.filter((o) => !existingIds.has(o.id));
  if (toAdd.length === 0) return { graph, added: 0 };

  const obligations = sortByObId([...graph.obligations, ...toAdd]);
  return { graph: { ...graph, obligations }, added: toAdd.length };
}
