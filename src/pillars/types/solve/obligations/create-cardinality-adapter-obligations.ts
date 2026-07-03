/**
 * src/pillars/types/solve/obligations/create-cardinality-adapter-obligations.ts
 *
 * `needsCardinalityAdapter` obligation creator: concrete one → concrete many
 * mismatch. The cardinality solver silently promotes the merged group to
 * 'many' when a concrete-one output is equal-constrained to a concrete-many
 * input; it emits no ClampManyConflict because concrete-one is not clampOne.
 * We detect the mismatch here from TypeFacts directly.
 *
 * MONOTONE ONE-AT-A-TIME: only ONE obligation is emitted per iteration.
 * Inserting two adapters at once risks committing two groups to conflicting
 * cardinalities if they share a hidden variable. [LAW:no-ambient-temporal-coupling]
 *
 * Respects the "skip elaboration-derived edges" rule: we never try to adapt
 * an adapter that we ourselves inserted. [LAW:no-silent-failure]
 */

import type { Obligation, MutableGraph, TypeFacts } from '../typed-graph';
import { obligationId, draftPortKey } from '../typed-graph';
import type { DefinedBlock } from '../../../block-api';
import { getContract } from '../contract-lookup';

export function createCardinalityAdapterObligations(
  graph: MutableGraph,
  facts: TypeFacts,
  catalog: readonly DefinedBlock[],
): Obligation[] {
  const obligations: Obligation[] = [];

  for (const edge of graph.edges) {
    if (edge.origin.kind === 'elaboration') continue;

    const srcBlock = graph.blocks.find((b) => b.id === edge.source);
    const tgtBlock = graph.blocks.find((b) => b.id === edge.target);
    if (!srcBlock || !tgtBlock) continue;

    const srcContract = getContract(srcBlock, catalog);
    const tgtContract = getContract(tgtBlock, catalog);
    if (!srcContract || !tgtContract) continue;

    const srcSlot = srcContract.outputs[edge.outputSlot];
    const tgtSlot = tgtContract.inputs[edge.inputSlot];
    if (!srcSlot || !tgtSlot) continue;

    for (const fieldName of Object.keys(srcSlot.type)) {
      if (!(fieldName in tgtSlot.type)) continue;
      const srcKey = draftPortKey(edge.source, edge.outputSlot, fieldName, 'out');
      const tgtKey = draftPortKey(edge.target, edge.inputSlot, fieldName, 'in');

      const srcHint = facts.ports.get(srcKey);
      const tgtHint = facts.ports.get(tgtKey);
      if (!srcHint || !tgtHint) continue;
      if (srcHint.status !== 'ok' || tgtHint.status !== 'ok') continue;

      const srcCard = srcHint.canonical!.extent.cardinality;
      const tgtCard = tgtHint.canonical!.extent.cardinality;
      if (srcCard.kind === 'one' && tgtCard.kind === 'many') {
        // Skip if source acceptance is oneOrMany (a polymorphic block that can be promoted)
        if (facts.portAcceptance.get(srcKey) === 'oneOrMany') continue;

        const id = obligationId(`needsCardinalityAdapter:${edge.id}`);
        obligations.push({
          id,
          kind: 'needsCardinalityAdapter',
          anchor: { kind: 'edge', edgeId: edge.id },
          status: { kind: 'open' },
          deps: [
            { kind: 'portCanonicalizable', port: srcKey },
            { kind: 'portCanonicalizable', port: tgtKey },
          ],
          policy: { name: 'cardinalityAdapters.v1' },
          debug: { createdBy: 'createCardinalityAdapterObligations', note: `one→many on field ${fieldName} of edge ${edge.id}` },
        });
        // ONE per iteration — stop here
        return obligations;
      }
    }
  }

  return obligations;
}
