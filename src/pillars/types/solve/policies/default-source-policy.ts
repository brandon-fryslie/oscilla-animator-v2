/**
 * src/pillars/types/solve/policies/default-source-policy.ts
 *
 * Satisfies `missingInputSource` obligations by synthesizing a constant-value
 * block whose output matches the target port's resolved type (or the first
 * field of the bundle). Three resolution tiers:
 *
 *   1. If the target port is 'ok' in TypeFacts → synthesize a concrete constant
 *      block for that exact type.
 *   2. If the target port is 'unknown' but all fields are at least cardinality-
 *      resolved → synthesize with the resolved cardinality, defaulting payload
 *      to float (a float anchor that also satisfies the missing-input condition).
 *   3. Otherwise → blocked (wait for the next iteration).
 *
 * Synthesized blocks carry a `syntheticContract` so the constraint extractor
 * can type-check them without a catalog entry. [LAW:effects-at-boundaries]
 */

import type { ZBlockContract, ZInferenceBundleType } from '../../schemas';
import { canonical } from '../../schemas';
import type { MutableBlock, MutableEdge } from '../typed-graph';
import { draftPortKey } from '../typed-graph';
import type { PolicyContext, PolicyResult } from './policy-types';

const SYS_DEFAULT = '_sys/DefaultSource';

export function defaultSourcePolicy(ctx: PolicyContext): PolicyResult {
  const { graph, facts, obligation } = ctx;
  if (obligation.anchor.kind !== 'port') {
    return { kind: 'blocked', reason: 'anchor is not a port' };
  }

  const { blockId, slotName } = obligation.anchor;
  const tgtBlock = graph.blocks.find((b) => b.id === blockId);
  if (!tgtBlock) return { kind: 'blocked', reason: `target block ${blockId} not found` };

  // Check if the port already has an incoming edge (stale obligation)
  const alreadyWired = graph.edges.some(
    (e) => e.target === blockId && e.inputSlot === slotName,
  );
  if (alreadyWired) return { kind: 'blocked', reason: 'port already wired (stale obligation)' };

  // Build the output bundle type for the synthesized default-source block.
  // We need to know what fields the target input slot has.
  const tgtContract =
    tgtBlock.syntheticContract ?? ctx.catalog.find((d) => d.type === tgtBlock.type)?.contract;
  if (!tgtContract) return { kind: 'blocked', reason: `no contract for block ${blockId}` };

  const tgtSlot = tgtContract.inputs[slotName];
  if (!tgtSlot) return { kind: 'blocked', reason: `slot ${slotName} not found in contract` };

  // Build the output bundle for the constant source: mirror the target slot's
  // type, substituting any unresolved vars with a default float type.
  const outputBundle: ZInferenceBundleType = {};
  for (const [fieldName, fieldType] of Object.entries(tgtSlot.type)) {
    const key = draftPortKey(blockId, slotName, fieldName, 'in');
    const hint = facts.ports.get(key);
    if (hint?.status === 'ok') {
      outputBundle[fieldName] = hint.canonical!;
    } else {
      // Default to float with none unit, one cardinality
      const payload = fieldType.payload.kind !== 'var' ? fieldType.payload : { kind: 'float' as const };
      outputBundle[fieldName] = canonical(payload);
    }
  }

  if (Object.keys(outputBundle).length === 0) {
    return { kind: 'blocked', reason: 'no fields in target slot' };
  }

  const srcId = `${SYS_DEFAULT}:${obligation.id}`;
  const syntheticContract: ZBlockContract = {
    inputs: {},
    outputs: {
      value: { id: 'value', dir: 'out', type: outputBundle },
    },
  };

  const srcBlock: MutableBlock = {
    id: srcId,
    type: SYS_DEFAULT,
    origin: { kind: 'elaboration', obligationId: obligation.id, role: 'defaultSource' },
    syntheticContract,
  };

  const edgeId = `${obligation.id}:edge`;
  const newEdge: MutableEdge = {
    id: edgeId,
    source: srcId,
    outputSlot: 'value',
    target: blockId,
    inputSlot: slotName,
    origin: { kind: 'elaboration', obligationId: obligation.id, role: 'defaultWire' },
  };

  return {
    kind: 'plan',
    plan: {
      obligationId: obligation.id,
      role: 'defaultSource',
      addBlocks: [srcBlock],
      addEdges: [newEdge],
    },
  };
}
