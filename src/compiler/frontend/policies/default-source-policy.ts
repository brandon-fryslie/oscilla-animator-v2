/**
 * DefaultSourcePolicy — discharges missingInputSource obligations.
 *
 * Strategy resolution order:
 * 1. InputDef.defaultSource (port-level override on block definition)
 * 2. Polymorphic DefaultSource block (fallback — defers to type-resolved lowering)
 *
 * TimeRoot special case: wire to existing TimeRoot block (edge only, no new block).
 *
 * Guards:
 * - UnexpectedConnectedInput: if the target port already has an incoming edge,
 *   returns blocked (another elaboration already satisfied this port).
 *
 * // [LAW:single-enforcer] This is the only place that decides how to satisfy a missing input source.
 * // [LAW:one-source-of-truth] DefaultSource metadata on InputDef is the single authority.
 */

import type { DraftBlock, DraftEdge, DraftGraph, ElaboratedRole } from '../draft-graph';
import type { Obligation, ObligationId } from '../obligations';
import type { ElaborationPlan } from '../elaboration';
import type { PolicyContext, PolicyResult, DefaultSourcePolicy as DefaultSourcePolicyInterface } from './policy-types';
import type { DefaultSource, BlockId, PortId, BlockRole } from '../../../types';
import type { InputDef } from '../../../blocks/registry';

// =============================================================================
// Strategy Resolution
// =============================================================================

/**
 * Resolve the effective default source strategy for an input port.
 *
 * Resolution order:
 * 1. InputDef.defaultSource (port-level spec on block definition)
 * 2. (Future: domain-wide registry lookup by type shape — not implemented yet)
 * 3. Polymorphic DefaultSource block fallback
 */
function resolveDefaultStrategy(inputDef: InputDef): DefaultSource {
  if (inputDef.defaultSource) return inputDef.defaultSource;
  return { blockType: 'DefaultSource', output: 'out', params: {} };
}

// =============================================================================
// Policy Implementation
// =============================================================================

/**
 * Default source policy v1.
 *
 * Called by planDischarge when a missingInputSource obligation has satisfied deps
 * (i.e., the target port type is fully resolved).
 */
export const defaultSourcePolicyV1: DefaultSourcePolicyInterface = {
  name: 'defaultSources.v1',
  version: 1,

  plan(obligation: Obligation, ctx: PolicyContext): PolicyResult {
    const anchor = obligation.anchor;
    if (!anchor.port || !anchor.blockId) {
      return { kind: 'blocked', reason: 'Missing port anchor on obligation', diagIds: [] };
    }

    const targetBlockId = anchor.blockId;
    const targetPortId = anchor.port.port;

    // Guard: if the target port already has an incoming edge, another elaboration
    // (or user wire) already connected it. This is not an error — the obligation
    // is simply stale.
    const hasEdge = ctx.graph.edges.some(
      (e) => e.to.blockId === targetBlockId && e.to.port === targetPortId,
    );
    if (hasEdge) {
      return { kind: 'blocked', reason: 'UnexpectedConnectedInput', diagIds: [] };
    }

    // Find the target block in the graph
    const targetBlock = ctx.graph.blocks.find((b) => b.id === targetBlockId);
    if (!targetBlock) {
      return { kind: 'blocked', reason: `Target block ${targetBlockId} not found`, diagIds: [] };
    }

    // Get the block definition
    const blockDef = ctx.registry.get(targetBlock.type);
    if (!blockDef) {
      return { kind: 'blocked', reason: `No definition for block type ${targetBlock.type}`, diagIds: [] };
    }

    // Get the input definition
    const inputDef = blockDef.inputs[targetPortId];
    if (!inputDef) {
      return { kind: 'blocked', reason: `No input definition for ${targetBlock.type}.${targetPortId}`, diagIds: [] };
    }

    // Resolve effective default source strategy
    const effectiveDefault = resolveDefaultStrategy(inputDef);

    // Build the elaboration plan
    return buildDefaultSourcePlan(
      obligation.id,
      effectiveDefault,
      targetBlockId,
      targetPortId,
      targetBlock,
      ctx.graph,
    );
  },
};

// =============================================================================
// Plan Builders
// =============================================================================

function buildDefaultSourcePlan(
  obligationId: ObligationId,
  ds: DefaultSource,
  targetBlockId: string,
  targetPortId: string,
  targetBlock: DraftBlock,
  graph: DraftGraph,
): PolicyResult {
  const role: ElaboratedRole = 'defaultSource';

  if (ds.blockType === 'TimeRoot' || ds.blockType === 'InfiniteTimeRoot') {
    // TimeRoot special case: wire to existing TimeRoot block (edge only, no new block)
    return buildTimeRootPlan(obligationId, ds, targetBlockId, targetPortId, graph, role);
  }

  // Standard case: create a new derived block + edge
  const derivedBlockId = `_ds_${targetBlockId}_${targetPortId}`;
  const edgeId = `${derivedBlockId}_to_${targetBlockId}_${targetPortId}`;

  const derivedRole: BlockRole = {
    kind: 'derived',
    meta: {
      kind: 'defaultSource',
      target: {
        kind: 'port',
        port: { blockId: targetBlockId as BlockId, portId: targetPortId as PortId },
      },
    },
  };

  const newBlock: DraftBlock = {
    id: derivedBlockId,
    type: ds.blockType,
    params: ds.params ?? {},
    origin: { kind: 'elaboration', obligationId, role },
    displayName: `${ds.blockType} (default)`,
    domainId: targetBlock.domainId,
    role: derivedRole,
  };

  const newEdge: DraftEdge = {
    id: edgeId,
    from: { blockId: derivedBlockId, port: ds.output, dir: 'out' },
    to: { blockId: targetBlockId, port: targetPortId, dir: 'in' },
    role: 'defaultWire',
    origin: { kind: 'elaboration', obligationId, role },
  };

  const plan: ElaborationPlan = {
    obligationId,
    role,
    addBlocks: [newBlock],
    addEdges: [newEdge],
  };

  return { kind: 'plan', plan };
}

function buildTimeRootPlan(
  obligationId: ObligationId,
  ds: DefaultSource,
  targetBlockId: string,
  targetPortId: string,
  graph: DraftGraph,
  role: ElaboratedRole,
): PolicyResult {
  // Find existing TimeRoot/InfiniteTimeRoot block
  const timeRoot = graph.blocks.find(
    (b) => b.type === 'TimeRoot' || b.type === 'InfiniteTimeRoot',
  );

  if (!timeRoot) {
    return {
      kind: 'blocked',
      reason: 'DefaultSource references TimeRoot but no TimeRoot exists in graph',
      diagIds: [],
    };
  }

  const edgeId = `${timeRoot.id}_${ds.output}_to_${targetBlockId}_${targetPortId}`;

  const newEdge: DraftEdge = {
    id: edgeId,
    from: { blockId: timeRoot.id, port: ds.output, dir: 'out' },
    to: { blockId: targetBlockId, port: targetPortId, dir: 'in' },
    role: 'defaultWire',
    origin: { kind: 'elaboration', obligationId, role },
  };

  const plan: ElaborationPlan = {
    obligationId,
    role,
    addBlocks: [],
    addEdges: [newEdge],
  };

  return { kind: 'plan', plan };
}
