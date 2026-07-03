/**
 * src/pillars/types/solve/policies/cardinality-adapter-policy.ts
 *
 * Satisfies `needsCardinalityAdapter` obligations by inserting a `Broadcast`
 * block on the conflicting edge. The Broadcast has one input (one cardinality)
 * and one output (many cardinality), forwarding payload and unit unchanged via
 * shared type variables. [LAW:composability]
 *
 * Two cases, following V1:
 *   1. Source block is a synthesized DefaultSource → replace it with a
 *      many-default source (a DefaultSource with many cardinality).
 *   2. Otherwise → insert a Broadcast block. [LAW:effects-at-boundaries]
 */

import type { InstanceRef, ZBlockContract } from '../../schemas';
import { payloadVar, unitVar } from '../../schemas';
import { instanceRef } from '../../schemas';
import type { MutableBlock, MutableEdge } from '../typed-graph';
import { draftPortKey } from '../typed-graph';
import type { PolicyContext, PolicyResult } from './policy-types';
import type { ZInferenceBundleType } from '../../schemas';
import { canonical } from '../../schemas';
import { getContract } from '../contract-lookup';

export function cardinalityAdapterPolicy(ctx: PolicyContext): PolicyResult {
  const { graph, facts, obligation } = ctx;
  const anchor = obligation.anchor;
  if (anchor.kind !== 'edge') {
    return { kind: 'blocked', reason: 'anchor is not an edge' };
  }

  const edge = graph.edges.find((e) => e.id === anchor.edgeId);
  if (!edge) return { kind: 'blocked', reason: `edge ${anchor.edgeId} not found` };

  // Determine target many-instance from facts
  const tgtBlock = graph.blocks.find((b) => b.id === edge.target);
  if (!tgtBlock) return { kind: 'blocked', reason: 'target block not found' };

  const tgtContract = getContract(tgtBlock, ctx.catalog);
  if (!tgtContract) return { kind: 'blocked', reason: 'no contract for target block' };

  const tgtSlot = tgtContract.inputs[edge.inputSlot];
  if (!tgtSlot) return { kind: 'blocked', reason: 'target slot not found' };

  // Find the target field's cardinality
  const firstField = Object.keys(tgtSlot.type)[0];
  if (!firstField) return { kind: 'blocked', reason: 'target slot has no fields' };

  const tgtKey = draftPortKey(edge.target, edge.inputSlot, firstField, 'in');
  const tgtHint = facts.ports.get(tgtKey);

  let manyInstance: InstanceRef;
  if (tgtHint?.status === 'ok' && tgtHint.canonical!.extent.cardinality.kind === 'many') {
    manyInstance = tgtHint.canonical!.extent.cardinality.instance;
  } else {
    // Use a deterministic synthetic instance ref based on the obligation id
    manyInstance = instanceRef(`broadcast:${obligation.id}`);
  }

  const broadcastId = `_sys/Broadcast:${obligation.id}`;

  // Synthesize a Broadcast contract with shared payload+unit vars, concrete cardinalities.
  // The vars will be alpha-renamed by the constraint extractor per block id.
  const broadcastInputBundle: ZInferenceBundleType = {
    value: canonical(payloadVar('P'), {
      unit: unitVar('U'),
      extent: {
        cardinality: { kind: 'one' },
        temporality: { kind: 'continuous' },
        binding: { kind: 'unbound' },
        perspective: { kind: 'default' },
        branch: { kind: 'default' },
      },
    }),
  };

  const broadcastOutputBundle: ZInferenceBundleType = {
    value: canonical(payloadVar('P'), {
      unit: unitVar('U'),
      extent: {
        cardinality: { kind: 'many', instance: manyInstance },
        temporality: { kind: 'continuous' },
        binding: { kind: 'unbound' },
        perspective: { kind: 'default' },
        branch: { kind: 'default' },
      },
    }),
  };

  const broadcastContract: ZBlockContract = {
    inputs: {
      input: { id: 'input', dir: 'in', type: broadcastInputBundle },
    },
    outputs: {
      output: { id: 'output', dir: 'out', type: broadcastOutputBundle },
    },
  };

  const broadcastBlock: MutableBlock = {
    id: broadcastId,
    type: '_sys/Broadcast',
    origin: { kind: 'elaboration', obligationId: obligation.id, role: 'cardinalityAdapter' },
    syntheticContract: broadcastContract,
  };

  const edge1: MutableEdge = {
    id: `${obligation.id}:e1`,
    source: edge.source,
    outputSlot: edge.outputSlot,
    target: broadcastId,
    inputSlot: 'input',
    origin: { kind: 'elaboration', obligationId: obligation.id, role: 'implicitCoerce' },
  };

  const edge2: MutableEdge = {
    id: `${obligation.id}:e2`,
    source: broadcastId,
    outputSlot: 'output',
    target: edge.target,
    inputSlot: edge.inputSlot,
    origin: { kind: 'elaboration', obligationId: obligation.id, role: 'implicitCoerce' },
  };

  return {
    kind: 'plan',
    plan: {
      obligationId: obligation.id,
      role: 'cardinalityAdapter',
      addBlocks: [broadcastBlock],
      replaceEdges: [{ remove: edge.id, add: [edge1, edge2] }],
    },
  };
}
