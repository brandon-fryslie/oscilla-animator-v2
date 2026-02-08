/**
 * CycleBreakPolicy — discharges needsCycleBreak obligations.
 *
 * Called by planDischarge when a needsCycleBreak obligation is open.
 * Inserts a UnitDelay block on the cycle edge:
 *   source → UnitDelay:in, UnitDelay:out → target
 *
 * Modeled after cardinalityAdapterPolicyV1.
 *
 * // [LAW:single-enforcer] This is the only place that decides HOW to insert cycle breaks.
 * // [LAW:one-source-of-truth] UnitDelay block is the single cycle-breaking mechanism.
 */

import type { DraftBlock, DraftEdge, ElaboratedRole } from '../draft-graph';
import type { Obligation } from '../obligations';
import type { ElaborationPlan } from '../elaboration';
import type { PolicyContext, PolicyResult, CycleBreakPolicy as CycleBreakPolicyInterface } from './policy-types';

// =============================================================================
// Policy Implementation
// =============================================================================

export const cycleBreakPolicyV1: CycleBreakPolicyInterface = {
  name: 'cycleBreak.v1',
  version: 1,

  plan(obligation: Obligation, ctx: PolicyContext): PolicyResult {
    const anchor = obligation.anchor;
    if (!anchor.edgeId) {
      return { kind: 'blocked', reason: 'Missing edgeId anchor on cycle break obligation', diagIds: [] };
    }

    // Find the edge in the graph
    const edge = ctx.graph.edges.find((e) => e.id === anchor.edgeId);
    if (!edge) {
      return { kind: 'blocked', reason: `Edge ${anchor.edgeId} not found in graph (may have been consumed by another elaboration)`, diagIds: [] };
    }

    // Build plan: insert UnitDelay on the edge
    const edgeKey = `${edge.from.blockId}:${edge.from.port}->${edge.to.blockId}:${edge.to.port}`;
    const blockId = `_cd_${edge.from.blockId}_${edge.from.port}__${edge.to.blockId}_${edge.to.port}`;
    const role: ElaboratedRole = 'internalHelper';
    const sourceBlock = ctx.graph.blocks.find((b) => b.id === edge.from.blockId);

    const addBlocks: DraftBlock[] = [
      {
        id: blockId,
        type: 'UnitDelay',
        params: {},
        origin: { kind: 'elaboration', obligationId: obligation.id, role },
        displayName: 'UnitDelay (cycle break)',
        domainId: sourceBlock?.domainId ?? null,
        role: {
          kind: 'derived',
          meta: {
            kind: 'cycleBreak',
            edgeId: edge.id,
          },
        },
      },
    ];

    const edgeInId = `_ce_${edge.id}_in`;
    const edgeOutId = `_ce_${edge.id}_out`;

    const addEdges: DraftEdge[] = [
      {
        id: edgeInId,
        from: edge.from,
        to: { blockId, port: 'in', dir: 'in' as const },
        role: 'internalHelper',
        origin: { kind: 'elaboration', obligationId: obligation.id, role },
      },
      {
        id: edgeOutId,
        from: { blockId, port: 'out', dir: 'out' as const },
        to: edge.to,
        role: 'internalHelper',
        origin: { kind: 'elaboration', obligationId: obligation.id, role },
      },
    ];

    return {
      kind: 'plan',
      plan: {
        obligationId: obligation.id,
        role,
        addBlocks,
        replaceEdges: [{ remove: edge.id, add: addEdges }],
        diagnostics: [
          {
            kind: 'CycleBreakInserted',
            obligationId: obligation.id,
            edgeKey,
            insertedBlockId: blockId,
            message: `UnitDelay inserted on ${edgeKey} to break algebraic cycle`,
          },
        ],
      },
    };
  },
};
