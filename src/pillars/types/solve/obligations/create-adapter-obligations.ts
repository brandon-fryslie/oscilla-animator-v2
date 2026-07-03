/**
 * src/pillars/types/solve/obligations/create-adapter-obligations.ts
 *
 * `needsAdapter` obligation creator: for each non-elaborated edge whose
 * matched fields are both 'ok' in TypeFacts but have incompatible canonical
 * types, emit a needsAdapter obligation for the adapter policy.
 *
 * Respects the "skip elaboration-derived edges" rule: we never try to adapt
 * an adapter that we ourselves inserted — that would create an infinite loop.
 * [LAW:no-silent-failure]
 */

import type { Obligation, MutableGraph, TypeFacts, FactDependency } from '../typed-graph';
import { obligationId, draftPortKey } from '../typed-graph';
import type { DefinedBlock } from '../../../block-api';
import { getContract } from '../contract-lookup';
// Cardinality is deliberately absent from the compatibility check —
// createCardinalityAdapterObligations owns that axis. [LAW:single-enforcer]
import { typesCompatible } from '../payload-unit';

// ---------------------------------------------------------------------------
// needsAdapter obligations
// ---------------------------------------------------------------------------

export function createAdapterObligations(
  graph: MutableGraph,
  facts: TypeFacts,
  catalog: readonly DefinedBlock[],
): Obligation[] {
  const obligations: Obligation[] = [];

  for (const edge of graph.edges) {
    // Skip elaboration-derived edges — never adapt an adapter we inserted
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

    // Collect deps and check type compatibility for matched fields
    const deps: FactDependency[] = [];
    let anyMismatch = false;

    for (const fieldName of Object.keys(srcSlot.type)) {
      if (!(fieldName in tgtSlot.type)) continue;

      const srcKey = draftPortKey(edge.source, edge.outputSlot, fieldName, 'out');
      const tgtKey = draftPortKey(edge.target, edge.inputSlot, fieldName, 'in');

      const srcHint = facts.ports.get(srcKey);
      const tgtHint = facts.ports.get(tgtKey);

      if (!srcHint || !tgtHint) continue;
      if (srcHint.status !== 'ok' || tgtHint.status !== 'ok') continue; // not yet resolved

      deps.push({ kind: 'portCanonicalizable', port: srcKey });
      deps.push({ kind: 'portCanonicalizable', port: tgtKey });

      if (!typesCompatible(srcHint.canonical!, tgtHint.canonical!)) {
        anyMismatch = true;
      }
    }

    if (!anyMismatch || deps.length === 0) continue;

    const id = obligationId(`needsAdapter:${edge.id}`);
    obligations.push({
      id,
      kind: 'needsAdapter',
      anchor: { kind: 'edge', edgeId: edge.id },
      status: { kind: 'open' },
      deps,
      policy: { name: 'adapters.v1' },
      debug: { createdBy: 'createAdapterObligations' },
    });
  }

  return obligations;
}
