/**
 * CardinalityAdapterPolicy — discharges needsCardinalityAdapter obligations.
 *
 * Called by planDischarge when a needsCardinalityAdapter obligation is open.
 *
 * Two strategies:
 * 1. If the source block is a DefaultSource → replace it with DefaultSourceField
 *    (produces per-element many defaults instead of broadcasting a uniform one value)
 * 2. Otherwise → insert Broadcast on the boundary edge (one→many)
 *
 * // [LAW:single-enforcer] This is the only place that decides HOW to insert cardinality adapters.
 * // [LAW:one-type-per-behavior] DefaultSource = one defaults, DefaultSourceField = many defaults.
 */

import type { DraftBlock, DraftEdge, ElaboratedRole } from '../draft-graph';
import type { Obligation } from '../obligations';
import type { ElaborationPlan } from '../elaboration';
import type { PolicyContext, PolicyResult, CardinalityAdapterPolicy as CardinalityAdapterPolicyInterface } from './policy-types';
import { isOneOnlyDefaultSource } from '../structural-predicates';

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

    // Check if the source block is a one-only default source — if so, replace with many default source
    // [LAW:one-source-of-truth] Block identity from CT/ICT port policy, not name string.
    const sourceBlock = ctx.graph.blocks.find((b) => b.id === edge.from.blockId);
    if (sourceBlock && isOneOnlyDefaultSource(sourceBlock.type)) {
      return buildDefaultSourceFieldReplacementPlan(obligation, edge, sourceBlock, ctx);
    }

    // Standard case: insert Broadcast on the boundary edge
    return buildBroadcastPlan(obligation, edge, ctx);
  },
};

// =============================================================================
// Plan Builders
// =============================================================================

/**
 * Replace a DefaultSource block with a DefaultSourceField block.
 *
 * The DefaultSource (acceptance:'oneOnly') was inserted by the default-source policy for an
 * unconnected many port. Since the port needs many cardinality, we replace the
 * DefaultSource with DefaultSourceField (acceptance:'manyOnly') which produces per-element
 * field defaults (rainbow colors, circular positions).
 *
 * Plan:
 * - removeBlockIds: [old DefaultSource block] (also removes all its edges)
 * - addBlocks: [new DefaultSourceField block]
 * - addEdges: [DefaultSourceField.out → target port]
 */
function buildDefaultSourceFieldReplacementPlan(
  obligation: Obligation,
  edge: { id: string; from: { blockId: string; port: string; dir: 'in' | 'out' }; to: { blockId: string; port: string; dir: 'in' | 'out' } },
  sourceBlock: DraftBlock,
  ctx: PolicyContext,
): PolicyResult {
  const role: ElaboratedRole = 'adapter';
  const newBlockId = `_dsf_${edge.to.blockId}_${edge.to.port}`;

  const addBlocks: DraftBlock[] = [
    {
      id: newBlockId,
      type: 'DefaultSourceField',
      params: {},
      portDefaults: {},
      origin: { kind: 'elaboration', obligationId: obligation.id, role },
      displayName: 'DefaultSourceField (many default)',
      domainId: sourceBlock.domainId,
      role: sourceBlock.role, // Preserve the derived/defaultSource role from the original
    },
  ];

  const addEdges: DraftEdge[] = [
    {
      id: `_e_${obligation.id}_dsf`,
      from: { blockId: newBlockId, port: 'out', dir: 'out' as const },
      to: edge.to,
      role: 'defaultWire',
      origin: { kind: 'elaboration', obligationId: obligation.id, role },
    },
  ];

  const edgeKey = `${edge.from.blockId}:${edge.from.port}:out->${edge.to.blockId}:${edge.to.port}:in`;

  return {
    kind: 'plan',
    plan: {
      obligationId: obligation.id,
      role,
      removeBlockIds: [sourceBlock.id],
      addBlocks,
      addEdges,
      diagnostics: [
        {
          diagnosticFlagCode: 'CardinalityAdapterInserted',
          message: `DefaultSourceField replacement on ${edgeKey}: one→many default source upgrade`,
          stableKey: `CardinalityAdapterInserted:${edgeKey}`,
        },
      ],
    },
  };
}

/**
 * Insert a Broadcast block on the boundary edge (one→many).
 *   source → Broadcast:'signal', Broadcast:'field' → target
 */
function buildBroadcastPlan(
  obligation: Obligation,
  edge: { id: string; from: { blockId: string; port: string; dir: 'in' | 'out' }; to: { blockId: string; port: string; dir: 'in' | 'out' } },
  ctx: PolicyContext,
): PolicyResult {
  const blockId = `_broadcast_${obligation.id}`;
  const role: ElaboratedRole = 'adapter';
  const sourceBlock = ctx.graph.blocks.find((b) => b.id === edge.from.blockId);

  const addBlocks: DraftBlock[] = [
    {
      id: blockId,
      type: 'Broadcast',
      params: {},
      portDefaults: {},
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
          diagnosticFlagCode: 'CardinalityAdapterInserted',
          message: `Broadcast adapter inserted on ${edgeKey}: one→many cardinality boundary`,
          stableKey: `CardinalityAdapterInserted:${edgeKey}`,
        },
      ],
    },
  };
}
