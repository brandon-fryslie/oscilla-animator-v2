/**
 * src/pillars/types/solve/policies/payload-anchor-policy.ts
 *
 * Satisfies `needsPayloadAnchor` obligations by inserting a float-anchor block
 * on an edge connected to the still-unresolved port. The anchor's output is
 * concrete `float`, providing payload evidence that resolves the polymorphic
 * group in the next iteration.
 *
 * Always emits a `CheaterAdapterUsed` diagnostic — the anchor is a "best
 * guess" that defaults the group to float. [LAW:no-silent-failure]
 */

import type { ZBlockContract } from '../../schemas';
import { canonical } from '../../schemas';
import type { MutableBlock, MutableEdge } from '../typed-graph';
import type { FixpointDiagnostic } from '../typed-graph';
import { obligationId as obId } from '../typed-graph';
import type { PolicyContext, PolicyResult } from './policy-types';
import type { ZInferenceBundleType } from '../../schemas';

export function payloadAnchorPolicy(ctx: PolicyContext): PolicyResult {
  const { graph, facts, obligation } = ctx;

  // Verify the anchor port still has an unresolved payload (guard against stale)
  const dep = obligation.deps.find((d) => d.kind === 'portHasUnresolvedPayload');
  if (!dep || dep.kind !== 'portHasUnresolvedPayload') {
    return { kind: 'blocked', reason: 'no portHasUnresolvedPayload dep' };
  }

  const hint = facts.ports.get(dep.port);
  if (!hint || hint.status === 'ok') {
    return { kind: 'blocked', reason: 'port already resolved (stale obligation)' };
  }

  // Find an edge that involves this port so we can insert the anchor
  const portKey = dep.port;
  const parts = portKey.split(':');
  const blockId = parts[0];
  const slotName = parts[1];
  const fieldName = parts[2];
  const dir = parts[3] as 'in' | 'out';

  // Find an edge touching this port (as source or target)
  let targetEdge = graph.edges.find((e) => {
    if (dir === 'out') return e.source === blockId && e.outputSlot === slotName;
    return e.target === blockId && e.inputSlot === slotName;
  });

  if (!targetEdge) {
    return { kind: 'blocked', reason: `no edge found for port ${portKey}` };
  }

  const anchorId = `_sys/PayloadAnchorFloat:${obligation.id}`;

  const anchorBundle: ZInferenceBundleType = {
    [fieldName]: canonical({ kind: 'float' }),
  };

  const anchorContract: ZBlockContract = {
    inputs: {
      input: { id: 'input', dir: 'in', type: anchorBundle },
    },
    outputs: {
      output: { id: 'output', dir: 'out', type: anchorBundle },
    },
  };

  const anchorBlock: MutableBlock = {
    id: anchorId,
    type: '_sys/PayloadAnchorFloat',
    origin: { kind: 'elaboration', obligationId: obligation.id, role: 'payloadAnchor' },
    syntheticContract: anchorContract,
  };

  // Insert anchor between source and target of the edge
  const edge1: MutableEdge = {
    id: `${obligation.id}:e1`,
    source: targetEdge.source,
    outputSlot: targetEdge.outputSlot,
    target: anchorId,
    inputSlot: 'input',
    origin: { kind: 'elaboration', obligationId: obligation.id, role: 'implicitCoerce' },
  };
  const edge2: MutableEdge = {
    id: `${obligation.id}:e2`,
    source: anchorId,
    outputSlot: 'output',
    target: targetEdge.target,
    inputSlot: targetEdge.inputSlot,
    origin: { kind: 'elaboration', obligationId: obligation.id, role: 'implicitCoerce' },
  };

  const diagnostic: FixpointDiagnostic = {
    code: 'CheaterAdapterUsed',
    message: `Payload anchor defaulted polymorphic group to float on port ${portKey}`,
    stableKey: `CheaterAdapterUsed:${portKey}`,
    ports: [portKey],
  };

  return {
    kind: 'plan',
    plan: {
      obligationId: obligation.id,
      role: 'payloadAnchor',
      addBlocks: [anchorBlock],
      replaceEdges: [{ remove: targetEdge.id, add: [edge1, edge2] }],
      diagnostics: [diagnostic],
    },
  };
}
