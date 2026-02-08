/**
 * PayloadAnchorPolicy — discharges needsPayloadAnchor obligations.
 *
 * Called by planDischarge when a needsPayloadAnchor obligation has satisfied deps
 * (i.e., both edge endpoints are canonicalizable except payload).
 *
 * Inserts an Adapter_PayloadAnchorFloat block on the edge, which provides
 * concrete FLOAT evidence to break the polymorphic chain.
 *
 * Always emits a CheaterAdapterUsed diagnostic warning.
 *
 * // [LAW:single-enforcer] This is the only place that decides HOW to insert payload anchors.
 */

import type { DraftBlock, DraftEdge, ElaboratedRole } from '../draft-graph';
import type { Obligation } from '../obligations';
import type { ElaborationPlan } from '../elaboration';
import type { PolicyContext, PolicyResult, PayloadAnchorPolicy as PayloadAnchorPolicyInterface } from './policy-types';

// =============================================================================
// Policy Implementation
// =============================================================================

/**
 * Payload anchor policy v1.
 *
 * Called by planDischarge when a needsPayloadAnchor obligation has satisfied deps
 * (i.e., both edge endpoints are canonicalizable except payload).
 */
export const payloadAnchorPolicyV1: PayloadAnchorPolicyInterface = {
  name: 'payloadAnchor.v1',
  version: 1,

  plan(obligation: Obligation, ctx: PolicyContext): PolicyResult {
    const anchor = obligation.anchor;
    if (!anchor.edgeId) {
      return { kind: 'blocked', reason: 'Missing edgeId anchor on payload anchor obligation', diagIds: [] };
    }

    // Find the edge in the graph
    const edge = ctx.graph.edges.find((e) => e.id === anchor.edgeId);
    if (!edge) {
      return { kind: 'blocked', reason: `Edge ${anchor.edgeId} not found in graph`, diagIds: [] };
    }

    // Get resolved types for both endpoints (should be unknown with payload var)
    const fromHint = ctx.getHint(edge.from);
    const toHint = ctx.getHint(edge.to);

    // Verify at least one endpoint still has unresolved payload
    if (fromHint.status === 'ok' && toHint.status === 'ok') {
      return { kind: 'blocked', reason: 'Already resolved', diagIds: [] };
    }

    // Build plan: insert Adapter_PayloadAnchorFloat on the edge
    const blockId = `_anchor_${obligation.id}`;
    const role: ElaboratedRole = 'adapter';
    const sourceBlock = ctx.graph.blocks.find((b) => b.id === edge.from.blockId);

    const addBlocks: DraftBlock[] = [
      {
        id: blockId,
        type: 'Adapter_PayloadAnchorFloat',
        params: {},
        origin: { kind: 'elaboration', obligationId: obligation.id, role },
        displayName: 'Float Anchor (cheater)',
        domainId: sourceBlock?.domainId ?? null,
        role: {
          kind: 'derived',
          meta: {
            kind: 'adapter',
            edgeId: edge.id,
            adapterType: 'Adapter_PayloadAnchorFloat',
          },
        },
      },
    ];

    const addEdges: DraftEdge[] = [
      {
        id: `_e_${obligation.id}_0`,
        from: edge.from,
        to: { blockId, port: 'in', dir: 'in' as const },
        role: 'implicitCoerce',
        origin: { kind: 'elaboration', obligationId: obligation.id, role },
      },
      {
        id: `_e_${obligation.id}_1`,
        from: { blockId, port: 'out', dir: 'out' as const },
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
            kind: 'CheaterAdapterUsed',
            subKind: 'PayloadAnchorFloat',
            obligationId: obligation.id,
            edgeKey,
            insertedBlockIds: [blockId],
            message: `Payload anchor inserted on ${edgeKey}: polymorphic chain anchored to float`,
          },
        ],
      },
    };
  },
};
