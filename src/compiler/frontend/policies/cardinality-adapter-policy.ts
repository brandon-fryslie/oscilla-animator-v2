/**
 * CardinalityAdapterPolicy — discharges needsCardinalityAdapter obligations.
 *
 * Called by planDischarge when a needsCardinalityAdapter obligation is open.
 * Inserts a Broadcast block on the boundary edge (signal→field):
 *   source → Broadcast:signal, Broadcast:field → target
 *
 * Modeled after adapterPolicyV1 and payloadAnchorPolicyV1.
 *
 * // [LAW:single-enforcer] This is the only place that decides HOW to insert cardinality adapters.
 * // [LAW:one-source-of-truth] Broadcast block is the single adapter for signal→field cardinality.
 */

import type { DraftBlock, DraftEdge, ElaboratedRole } from '../draft-graph';
import type { Obligation } from '../obligations';
import type { ElaborationPlan } from '../elaboration';
import type { PolicyContext, PolicyResult, CardinalityAdapterPolicy as CardinalityAdapterPolicyInterface } from './policy-types';

// =============================================================================
// Policy Implementation
// =============================================================================

export const cardinalityAdapterPolicyV1: CardinalityAdapterPolicyInterface = {
  name: 'cardinalityAdapters.v1',
  version: 1,

  plan(obligation: Obligation, ctx: PolicyContext): PolicyResult {
    const anchor = obligation.anchor;
    if (!anchor.edgeId) {
      return { kind: 'blocked', reason: 'Missing edgeId anchor on cardinality adapter obligation', diagIds: [] };
    }

    // Find the edge in the graph
    const edge = ctx.graph.edges.find((e) => e.id === anchor.edgeId);
    if (!edge) {
      return { kind: 'blocked', reason: `Edge ${anchor.edgeId} not found in graph`, diagIds: [] };
    }

    // Build plan: insert Broadcast on the edge
    const blockId = `_broadcast_${obligation.id}`;
    const role: ElaboratedRole = 'adapter';
    const sourceBlock = ctx.graph.blocks.find((b) => b.id === edge.from.blockId);

    const addBlocks: DraftBlock[] = [
      {
        id: blockId,
        type: 'Broadcast',
        params: {},
        origin: { kind: 'elaboration', obligationId: obligation.id, role },
        displayName: 'Broadcast (cardinality adapter)',
        domainId: sourceBlock?.domainId ?? null,
        role: {
          kind: 'derived',
          meta: {
            kind: 'adapter',
            edgeId: edge.id,
            adapterType: 'Broadcast',
          },
        },
      },
    ];

    const addEdges: DraftEdge[] = [
      {
        id: `_e_${obligation.id}_0`,
        from: edge.from,
        to: { blockId, port: 'signal', dir: 'in' as const },
        role: 'implicitCoerce',
        origin: { kind: 'elaboration', obligationId: obligation.id, role },
      },
      {
        id: `_e_${obligation.id}_1`,
        from: { blockId, port: 'field', dir: 'out' as const },
        to: edge.to,
        role: 'implicitCoerce',
        origin: { kind: 'elaboration', obligationId: obligation.id, role },
      },
    ];

    const edgeKey = `${edge.from.blockId}:${edge.from.port}:out->${edge.to.blockId}:${edge.to.port}:in`;

    return {
      kind: 'plan',
      plan: {
        obligationId: obligation.id,
        role,
        addBlocks,
        replaceEdges: [{ remove: edge.id, add: addEdges }],
        diagnostics: [
          {
            kind: 'CardinalityAdapterInserted',
            subKind: 'Broadcast',
            obligationId: obligation.id,
            edgeKey,
            insertedBlockIds: [blockId],
            message: `Broadcast adapter inserted on ${edgeKey}: signal→field cardinality boundary`,
          },
        ],
      },
    };
  },
};
