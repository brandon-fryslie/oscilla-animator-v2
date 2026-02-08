/**
 * AdapterPolicy — discharges needsAdapter obligations.
 *
 * Called by planDischarge when a needsAdapter obligation has satisfied deps
 * (i.e., both edge endpoints are fully resolved).
 *
 * Uses findAdapter() from adapter-spec to find the appropriate adapter block,
 * then builds an ElaborationPlan that replaces the original edge with:
 * source → adapter → sink.
 *
 * No more isCardinalityPreserving hack — cardinality is already resolved.
 *
 * // [LAW:single-enforcer] This is the only place that decides HOW to insert adapters.
 * // [LAW:one-source-of-truth] AdapterBlockSpec on BlockDef is the single authority for adapter matching.
 */

import type { DraftBlock, DraftEdge, ElaboratedRole } from '../draft-graph';
import type { Obligation } from '../obligations';
import type { ElaborationPlan } from '../elaboration';
import type { PolicyContext, PolicyResult, AdapterPolicy as AdapterPolicyInterface } from './policy-types';
import type { BlockRole } from '../../../types';
import { isAssignable, findAdapterChain } from '../../../blocks/adapter-spec';

// =============================================================================
// Policy Implementation
// =============================================================================

/**
 * Adapter policy v1.
 *
 * Called by planDischarge when a needsAdapter obligation has satisfied deps
 * (i.e., both edge endpoints have status:'ok').
 */
export const adapterPolicyV1: AdapterPolicyInterface = {
  name: 'adapters.v1',
  version: 1,

  plan(obligation: Obligation, ctx: PolicyContext): PolicyResult {
    const anchor = obligation.anchor;
    if (!anchor.edgeId) {
      return { kind: 'blocked', reason: 'Missing edgeId anchor on adapter obligation', diagIds: [] };
    }

    // Find the edge in the graph
    const edge = ctx.graph.edges.find((e) => e.id === anchor.edgeId);
    if (!edge) {
      return { kind: 'blocked', reason: `Edge ${anchor.edgeId} not found in graph`, diagIds: [] };
    }

    // Get resolved types for both endpoints
    const fromHint = ctx.getHint(edge.from);
    const toHint = ctx.getHint(edge.to);

    if (fromHint.status !== 'ok' || !fromHint.canonical) {
      return { kind: 'blocked', reason: `Source port ${edge.from.blockId}:${edge.from.port} not resolved`, diagIds: [] };
    }
    if (toHint.status !== 'ok' || !toHint.canonical) {
      return { kind: 'blocked', reason: `Sink port ${edge.to.blockId}:${edge.to.port} not resolved`, diagIds: [] };
    }

    // Early return: types are already assignable
    if (isAssignable(fromHint.canonical, toHint.canonical)) {
      return {
        kind: 'blocked',
        reason: `Types are assignable, no adapter needed for ${edge.from.blockId}:${edge.from.port} → ${edge.to.blockId}:${edge.to.port}`,
        diagIds: [],
      };
    }

    // Find adapter chain using BFS — supports single-step and multi-step chains
    const chain = findAdapterChain(fromHint.canonical, toHint.canonical);
    if (!chain) {
      return {
        kind: 'blocked',
        reason: `No adapter chain found for ${edge.from.blockId}:${edge.from.port} → ${edge.to.blockId}:${edge.to.port}`,
        diagIds: [],
      };
    }

    // Build the elaboration plan: N adapter blocks, N+1 edges
    const role: ElaboratedRole = 'adapter';
    const sourceBlock = ctx.graph.blocks.find((b) => b.id === edge.from.blockId);
    const domainId = sourceBlock?.domainId ?? null;

    const addBlocks: DraftBlock[] = [];
    const addEdges: DraftEdge[] = [];

    for (let i = 0; i < chain.steps.length; i++) {
      const step = chain.steps[i];
      const blockId = `_adapter_${obligation.id}_${i}`;

      const adapterRole: BlockRole = {
        kind: 'derived',
        meta: {
          kind: 'adapter',
          edgeId: edge.id,
          adapterType: step.blockType,
        },
      };

      addBlocks.push({
        id: blockId,
        type: step.blockType,
        params: {},
        origin: { kind: 'elaboration', obligationId: obligation.id, role },
        displayName: `${step.blockType} (adapter)`,
        domainId,
        role: adapterRole,
      });
    }

    // N+1 edges: source → adapter0, adapter0 → adapter1, ..., adapterN-1 → sink
    const n = chain.steps.length;
    for (let i = 0; i <= n; i++) {
      const edgeId = `_e_${obligation.id}_${i}`;
      const from = i === 0
        ? edge.from
        : { blockId: `_adapter_${obligation.id}_${i - 1}`, port: chain.steps[i - 1].outputPortId, dir: 'out' as const };
      const to = i === n
        ? edge.to
        : { blockId: `_adapter_${obligation.id}_${i}`, port: chain.steps[i].inputPortId, dir: 'in' as const };

      addEdges.push({
        id: edgeId,
        from,
        to,
        role: 'implicitCoerce',
        origin: { kind: 'elaboration', obligationId: obligation.id, role },
      });
    }

    const plan: ElaborationPlan = {
      obligationId: obligation.id,
      role,
      addBlocks,
      replaceEdges: [
        {
          remove: edge.id,
          add: addEdges,
        },
      ],
    };

    return { kind: 'plan', plan };
  },
};
