/**
 * Apply Elaboration Plans to DraftGraph.
 *
 * Plans are structural mutations: add blocks, add edges, replace edges.
 * Application is idempotent (re-applying is a no-op if structure already present).
 * Monotone: only adds/rewires, never removes semantic content.
 *
 * // [LAW:one-source-of-truth] DraftGraph.meta.revision tracks mutation count.
 * // [LAW:dataflow-not-control-flow] Always run apply; idempotency handles no-ops via data, not branches.
 */

import type { DraftGraph, DraftBlock, DraftEdge } from './draft-graph';
import type { ElaborationPlan } from './elaboration';
import type { Obligation, ObligationId } from './obligations';
import { discharged } from './obligations';

// =============================================================================
// applyElaborationPlan
// =============================================================================

/**
 * Apply a single ElaborationPlan to a DraftGraph.
 *
 * Idempotency: if the graph already contains all block/edge IDs the plan
 * would add, return the graph unchanged. If partially present, throw (corruption).
 *
 * @returns New DraftGraph with plan applied, revision bumped.
 */
export function applyElaborationPlan(g: DraftGraph, plan: ElaborationPlan): DraftGraph {
  const existingBlockIds = new Set(g.blocks.map((b) => b.id));
  const existingEdgeIds = new Set(g.edges.map((e) => e.id));

  // Collect all IDs this plan would add
  const planBlockIds = (plan.addBlocks ?? []).map((b) => b.id);
  const planEdgeIds = [
    ...(plan.addEdges ?? []).map((e) => e.id),
    ...(plan.replaceEdges ?? []).flatMap((r) => r.add.map((e) => e.id)),
  ];

  // Check idempotency
  const blocksPresent = planBlockIds.filter((id) => existingBlockIds.has(id));
  const edgesPresent = planEdgeIds.filter((id) => existingEdgeIds.has(id));
  const allPresent = blocksPresent.length === planBlockIds.length && edgesPresent.length === planEdgeIds.length;
  const nonePresent = blocksPresent.length === 0 && edgesPresent.length === 0;

  if (allPresent && (planBlockIds.length > 0 || planEdgeIds.length > 0)) {
    // Already applied — no-op
    return g;
  }

  if (!nonePresent && !allPresent) {
    // Partial presence = corruption
    throw new Error(
      `Elaboration plan ${plan.obligationId} partially applied: ` +
      `blocks present=${blocksPresent.join(',')}, edges present=${edgesPresent.join(',')}`
    );
  }

  // Apply additions
  let blocks = [...g.blocks];
  let edges = [...g.edges];

  // Add blocks
  if (plan.addBlocks) {
    blocks = [...blocks, ...plan.addBlocks];
  }

  // Add edges
  if (plan.addEdges) {
    edges = [...edges, ...plan.addEdges];
  }

  // Replace edges
  if (plan.replaceEdges) {
    const removeIds = new Set(plan.replaceEdges.map((r) => r.remove));
    edges = edges.filter((e) => !removeIds.has(e.id));
    for (const replacement of plan.replaceEdges) {
      edges = [...edges, ...replacement.add];
    }
  }

  // Sort for determinism
  blocks.sort((a, b) => a.id.localeCompare(b.id));
  edges.sort((a, b) => a.id.localeCompare(b.id));

  // Update obligation status to discharged
  const obligations = g.obligations.map((o) => {
    if (o.id === plan.obligationId) {
      return {
        ...o,
        status: discharged(planBlockIds, planEdgeIds),
      };
    }
    return o;
  });

  return {
    blocks,
    edges,
    obligations,
    meta: {
      ...g.meta,
      revision: g.meta.revision + 1,
    },
  };
}

/**
 * Apply multiple elaboration plans to a DraftGraph.
 * Plans are applied in order. Each bumps revision.
 */
export function applyAllPlans(g: DraftGraph, plans: readonly ElaborationPlan[]): DraftGraph {
  let graph = g;
  for (const plan of plans) {
    graph = applyElaborationPlan(graph, plan);
  }
  return graph;
}
