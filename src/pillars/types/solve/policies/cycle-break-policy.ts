/**
 * src/pillars/types/solve/policies/cycle-break-policy.ts
 *
 * Satisfies `needsCycleBreak` obligations by inserting a `UnitDelay` block on
 * the back-edge identified by the DFS cycle detector. The UnitDelay has a
 * passthrough contract (same type in and out) and breaks the algebraic cycle
 * by introducing a one-iteration delay. [LAW:no-ambient-temporal-coupling]
 */

import type { ZBlockContract } from '../../schemas';
import { payloadVar, unitVar } from '../../schemas';
import { canonical } from '../../schemas';
import type { MutableBlock, MutableEdge } from '../typed-graph';
import type { PolicyContext, PolicyResult } from './policy-types';
import type { ZInferenceBundleType } from '../../schemas';

export function cycleBreakPolicy(ctx: PolicyContext): PolicyResult {
  const { graph, obligation } = ctx;
  const anchor = obligation.anchor;
  if (anchor.kind !== 'edge') {
    return { kind: 'blocked', reason: 'anchor is not an edge' };
  }

  const edge = graph.edges.find((e) => e.id === anchor.edgeId);
  if (!edge) return { kind: 'blocked', reason: `back-edge ${anchor.edgeId} not found` };

  const delayId = `_sys/UnitDelay:${obligation.id}`;

  // Passthrough contract: same field with payload+unit vars, so type flows through.
  const passthroughBundle: ZInferenceBundleType = {
    value: canonical(payloadVar('P'), { unit: unitVar('U') }),
  };

  const delayContract: ZBlockContract = {
    inputs: { input: { id: 'input', dir: 'in', type: passthroughBundle } },
    outputs: { output: { id: 'output', dir: 'out', type: passthroughBundle } },
  };

  const delayBlock: MutableBlock = {
    id: delayId,
    type: '_sys/UnitDelay',
    origin: { kind: 'elaboration', obligationId: obligation.id, role: 'cycleBreak' },
    syntheticContract: delayContract,
  };

  const edge1: MutableEdge = {
    id: `${obligation.id}:e1`,
    source: edge.source,
    outputSlot: edge.outputSlot,
    target: delayId,
    inputSlot: 'input',
    origin: { kind: 'elaboration', obligationId: obligation.id, role: 'internalHelper' },
  };
  const edge2: MutableEdge = {
    id: `${obligation.id}:e2`,
    source: delayId,
    outputSlot: 'output',
    target: edge.target,
    inputSlot: edge.inputSlot,
    origin: { kind: 'elaboration', obligationId: obligation.id, role: 'internalHelper' },
  };

  return {
    kind: 'plan',
    plan: {
      obligationId: obligation.id,
      role: 'cycleBreak',
      addBlocks: [delayBlock],
      replaceEdges: [{ remove: edge.id, add: [edge1, edge2] }],
    },
  };
}
