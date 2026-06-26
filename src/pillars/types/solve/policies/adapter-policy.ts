/**
 * src/pillars/types/solve/policies/adapter-policy.ts
 *
 * Satisfies `needsAdapter` obligations by inserting an adapter block between
 * the mismatched edge endpoints. Uses `findAdapterCandidates` (from wzm3.4)
 * to locate a suitable adapter in the catalog. The edge is atomically
 * replaced with two new edges: source→adapter.in and adapter.out→target.
 *
 * Only handles single-field bundles for this initial implementation (where
 * `findAdapterCandidates` can match field-to-field). For multi-field bundles
 * with mismatches, the policy returns `blocked`.
 * [LAW:effects-at-boundaries] [LAW:composability]
 */

import { findAdapterCandidates } from '../adapters';
import type { MutableBlock, MutableEdge } from '../typed-graph';
import type { ZBlockContract, ZInferenceCanonicalType } from '../../schemas';
import type { PolicyContext, PolicyResult } from './policy-types';
import { applySubstitution } from '../substitution';
import type { Substitution } from '../substitution';

export function adapterPolicy(ctx: PolicyContext): PolicyResult {
  const { graph, facts, catalog, obligation } = ctx;
  if (obligation.anchor.kind !== 'edge') {
    return { kind: 'blocked', reason: 'anchor is not an edge' };
  }

  const edgeId = obligation.anchor.edgeId;
  const edge = graph.edges.find((e) => e.id === edgeId);
  if (!edge) return { kind: 'blocked', reason: `edge ${edgeId} not found (already removed?)` };

  const srcBlock = graph.blocks.find((b) => b.id === edge.source);
  const tgtBlock = graph.blocks.find((b) => b.id === edge.target);
  if (!srcBlock || !tgtBlock) return { kind: 'blocked', reason: 'source or target block not found' };

  const srcContract = srcBlock.syntheticContract ?? catalog.find((d) => d.type === srcBlock.type)?.contract;
  const tgtContract = tgtBlock.syntheticContract ?? catalog.find((d) => d.type === tgtBlock.type)?.contract;
  if (!srcContract || !tgtContract) return { kind: 'blocked', reason: 'missing contract' };

  const srcSlot = srcContract.outputs[edge.outputSlot];
  const tgtSlot = tgtContract.inputs[edge.inputSlot];
  if (!srcSlot || !tgtSlot) return { kind: 'blocked', reason: 'slot not found' };

  // Find the first mismatched field pair where both endpoints are 'ok'.
  let srcFieldType: ZInferenceCanonicalType | undefined;
  let tgtFieldType: ZInferenceCanonicalType | undefined;

  for (const fieldName of Object.keys(srcSlot.type)) {
    if (!(fieldName in tgtSlot.type)) continue;
    const srcKey = `${edge.source}:${edge.outputSlot}:${fieldName}:out` as import('../typed-graph').DraftPortKey;
    const tgtKey = `${edge.target}:${edge.inputSlot}:${fieldName}:in` as import('../typed-graph').DraftPortKey;
    const srcHint = facts.ports.get(srcKey);
    const tgtHint = facts.ports.get(tgtKey);
    if (srcHint?.status === 'ok' && tgtHint?.status === 'ok') {
      srcFieldType = srcHint.canonical!;
      tgtFieldType = tgtHint.canonical!;
      break;
    }
  }

  if (!srcFieldType || !tgtFieldType) {
    return { kind: 'blocked', reason: 'no resolved field pair found' };
  }

  const candidates = findAdapterCandidates(srcFieldType, tgtFieldType, catalog);
  if (candidates.length === 0) {
    return { kind: 'blocked', reason: `no adapter from ${srcFieldType.payload.kind} to ${tgtFieldType.payload.kind}` };
  }

  const best = candidates[0];

  // Build synthesized block with the adapter's contract instantiated with the substitution.
  const adapterBlockId = `_sys/adapter:${obligation.id}`;
  const adapterCatalogBlock = catalog.find((d) => d.type === best.blockType);
  let adapterContract: ZBlockContract | undefined = adapterCatalogBlock?.contract;

  // Instantiate the adapter's polymorphic contract with the found substitution.
  if (adapterContract && Object.keys(best.substitution.payloads).length + Object.keys(best.substitution.units).length > 0) {
    // Rewrite the adapter's port types using the substitution.
    adapterContract = instantiateContract(adapterContract, best.substitution);
  }

  const adapterBlock: MutableBlock = {
    id: adapterBlockId,
    type: best.blockType,
    origin: { kind: 'elaboration', obligationId: obligation.id, role: 'adapter' },
    ...(adapterContract ? { syntheticContract: adapterContract } : {}),
  };

  const edge1: MutableEdge = {
    id: `${obligation.id}:e1`,
    source: edge.source,
    outputSlot: edge.outputSlot,
    target: adapterBlockId,
    inputSlot: best.inputSlot,
    origin: { kind: 'elaboration', obligationId: obligation.id, role: 'implicitCoerce' },
  };

  const edge2: MutableEdge = {
    id: `${obligation.id}:e2`,
    source: adapterBlockId,
    outputSlot: best.outputSlot,
    target: edge.target,
    inputSlot: edge.inputSlot,
    origin: { kind: 'elaboration', obligationId: obligation.id, role: 'implicitCoerce' },
  };

  return {
    kind: 'plan',
    plan: {
      obligationId: obligation.id,
      role: 'adapter',
      addBlocks: [adapterBlock],
      replaceEdges: [{ remove: edge.id, add: [edge1, edge2] }],
    },
  };
}

/**
 * Rewrite the adapter contract's port types using the found substitution, so
 * the constraint extractor sees concrete types on the adapter's ports.
 */
function instantiateContract(contract: ZBlockContract, subst: Substitution): ZBlockContract {
  const applyBundle = (bundle: Record<string, ZInferenceCanonicalType>): Record<string, ZInferenceCanonicalType> => {
    const out: Record<string, ZInferenceCanonicalType> = {};
    for (const [f, t] of Object.entries(bundle)) {
      out[f] = applySubstitution(t, subst);
    }
    return out;
  };

  const inputs: ZBlockContract['inputs'] = {};
  for (const [slot, binding] of Object.entries(contract.inputs)) {
    inputs[slot] = { ...binding, type: applyBundle(binding.type) };
  }
  const outputs: ZBlockContract['outputs'] = {};
  for (const [slot, binding] of Object.entries(contract.outputs)) {
    outputs[slot] = { ...binding, type: applyBundle(binding.type) };
  }
  return { inputs, outputs };
}
