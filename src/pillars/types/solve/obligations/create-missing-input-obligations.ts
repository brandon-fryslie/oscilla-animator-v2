/**
 * src/pillars/types/solve/obligations/create-missing-input-obligations.ts
 *
 * Idempotent obligation creator: for every input port on every block that has
 * no incoming edge, emit a `missingInputSource` obligation. "Idempotent" means
 * this runs every iteration — the dedup in `addObligationsIfMissing` prevents
 * double-insertion (deterministic IDs → Set lookup). Newly-elaborated blocks
 * are also covered here, which is intentional: a default-source policy may add
 * a block whose own inputs need wiring in the next iteration.
 * [LAW:dataflow-not-control-flow] (same steps every iteration; variability in values)
 */

import type { DefinedBlock } from '../../../block-api';
import type { Obligation } from '../typed-graph';
import { obligationId } from '../typed-graph';
import type { MutableGraph } from '../typed-graph';
import { getContract } from '../contract-lookup';

export function createMissingInputObligations(
  graph: MutableGraph,
  catalog: readonly DefinedBlock[],
): Obligation[] {
  const obligations: Obligation[] = [];

  // Build a set of (target block id, input slot) pairs that already have an incoming edge.
  const connectedInputs = new Set<string>();
  for (const edge of graph.edges) {
    connectedInputs.add(`${edge.target}:${edge.inputSlot}`);
  }

  for (const block of graph.blocks) {
    const contract = getContract(block, catalog);
    if (contract === undefined) continue;

    for (const slotName of Object.keys(contract.inputs)) {
      if (connectedInputs.has(`${block.id}:${slotName}`)) continue;

      const id = obligationId(`missingInput:${block.id}:${slotName}`);
      obligations.push({
        id,
        kind: 'missingInputSource',
        anchor: { kind: 'port', blockId: block.id, slotName },
        status: { kind: 'open' },
        deps: [],
        policy: { name: 'defaultSources.v1' },
        debug: { createdBy: 'createMissingInputObligations' },
      });
    }
  }

  return obligations;
}
