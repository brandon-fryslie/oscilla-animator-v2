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
import { findAdapter } from '../../../blocks/adapter-spec';

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

    // Find adapter using RESOLVED types — no more isCardinalityPreserving hack
    const adapterSpec = findAdapter(fromHint.canonical, toHint.canonical);
    if (!adapterSpec) {
      // Types are either compatible (no adapter needed) or no adapter exists for this conversion
      return {
        kind: 'blocked',
        reason: `No adapter found for ${edge.from.blockId}:${edge.from.port} → ${edge.to.blockId}:${edge.to.port}`,
        diagIds: [],
      };
    }

    // Build the elaboration plan: replace the original edge with source → adapter → sink
    const role: ElaboratedRole = 'adapter';
    const adapterBlockId = `_adapter_${obligation.id}`;

    const adapterRole: BlockRole = {
      kind: 'derived',
      meta: {
        kind: 'adapter',
        edgeId: edge.id,
        adapterType: adapterSpec.blockType,
      },
    };

    // Find the source block's domainId for the adapter
    const sourceBlock = ctx.graph.blocks.find((b) => b.id === edge.from.blockId);
    const domainId = sourceBlock?.domainId ?? null;

    const adapterBlock: DraftBlock = {
      id: adapterBlockId,
      type: adapterSpec.blockType,
      params: {},
      origin: { kind: 'elaboration', obligationId: obligation.id, role },
      displayName: `${adapterSpec.blockType} (adapter)`,
      domainId,
      role: adapterRole,
    };

    // Edge from source → adapter input
    const edgeToAdapter: DraftEdge = {
      id: `_e_${obligation.id}_a`,
      from: edge.from,
      to: { blockId: adapterBlockId, port: adapterSpec.inputPortId, dir: 'in' },
      role: 'implicitCoerce',
      origin: { kind: 'elaboration', obligationId: obligation.id, role },
    };

    // Edge from adapter output → sink
    const edgeFromAdapter: DraftEdge = {
      id: `_e_${obligation.id}_b`,
      from: { blockId: adapterBlockId, port: adapterSpec.outputPortId, dir: 'out' },
      to: edge.to,
      role: 'implicitCoerce',
      origin: { kind: 'elaboration', obligationId: obligation.id, role },
    };

    const plan: ElaborationPlan = {
      obligationId: obligation.id,
      role,
      addBlocks: [adapterBlock],
      replaceEdges: [
        {
          remove: edge.id,
          add: [edgeToAdapter, edgeFromAdapter],
        },
      ],
    };

    return { kind: 'plan', plan };
  },
};
