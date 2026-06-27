/**
 * src/pillars/types/solve/obligations/create-derived-obligations.ts
 *
 * Two obligation creators that run after each solver pass:
 *
 * 1. `needsAdapter` — for each non-elaborated edge whose matched fields are
 *    both 'ok' in TypeFacts but have incompatible canonical types.
 *
 * 2. `needsPayloadAnchor` — for each polymorphic group with no concrete
 *    payload evidence. MONOTONE ONE-AT-A-TIME: only ONE payload anchor
 *    obligation is emitted per iteration. Inserting two anchors at once risks
 *    committing two groups to conflicting types if they share a hidden variable.
 *    [LAW:no-ambient-temporal-coupling]
 *
 * Both respect the "skip elaboration-derived edges" rule: we never try to
 * adapt an adapter that we ourselves inserted — that would create an infinite
 * loop. [LAW:no-silent-failure]
 */

import type { Obligation, MutableGraph, TypeFacts, FactDependency } from '../typed-graph';
import { obligationId, draftPortKey, parseDraftPortKey } from '../typed-graph';
import type { DefinedBlock } from '../../../block-api';
import type { ZCanonicalType } from '../../schemas';

// ---------------------------------------------------------------------------
// Type compatibility check
// ---------------------------------------------------------------------------

function typesCompatible(a: ZCanonicalType, b: ZCanonicalType): boolean {
  if (a.payload.kind !== b.payload.kind) return false;
  // Unit compatibility: none is bottom (compatible with anything); otherwise must match
  const ua = a.unit;
  const ub = b.unit;
  if (ua.kind !== ub.kind) {
    if (ua.kind !== 'none' && ub.kind !== 'none') return false;
  } else {
    // Same kind — check sub-properties
    if (ua.kind === 'angle') {
      const va = ua as Extract<typeof ua, { kind: 'angle' }>;
      const vb = ub as Extract<typeof ub, { kind: 'angle' }>;
      if (va.unit !== vb.unit) return false;
    } else if (ua.kind === 'time') {
      const va = ua as Extract<typeof ua, { kind: 'time' }>;
      const vb = ub as Extract<typeof ub, { kind: 'time' }>;
      if (va.unit !== vb.unit) return false;
    } else if (ua.kind === 'color') {
      const va = ua as Extract<typeof ua, { kind: 'color' }>;
      const vb = ub as Extract<typeof ub, { kind: 'color' }>;
      if (va.unit !== vb.unit) return false;
    } else if (ua.kind === 'space') {
      const va = ua as Extract<typeof ua, { kind: 'space' }>;
      const vb = ub as Extract<typeof ub, { kind: 'space' }>;
      if (va.space !== vb.space || va.dims !== vb.dims) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// needsAdapter obligations
// ---------------------------------------------------------------------------

function getContract(block: { id: string; type: string; syntheticContract?: import('../../schemas').ZBlockContract }, catalog: readonly DefinedBlock[]) {
  if (block.syntheticContract !== undefined) return block.syntheticContract;
  return catalog.find((d) => d.type === block.type)?.contract;
}

export function createDerivedObligations(
  graph: MutableGraph,
  facts: TypeFacts,
  catalog: readonly DefinedBlock[],
): Obligation[] {
  const obligations: Obligation[] = [];

  // --- needsAdapter -------------------------------------------------------
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
      debug: { createdBy: 'createDerivedObligations' },
    });
  }

  // --- needsCardinalityAdapter: concrete one → concrete many mismatch ----
  // The cardinality solver silently promotes the merged group to 'many' when a
  // concrete-one output is equal-constrained to a concrete-many input; it emits
  // no ClampManyConflict because concrete-one is not clampOne.  We detect the
  // mismatch here from TypeFacts directly. ONE per iteration — monotone.
  // [LAW:no-ambient-temporal-coupling]
  let emittedCardOb = false;
  for (const edge of graph.edges) {
    if (emittedCardOb) break;
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
          debug: { createdBy: 'createDerivedObligations', note: `one→many on field ${fieldName} of edge ${edge.id}` },
        });
        emittedCardOb = true;
        break;
      }
    }
  }

  // --- needsPayloadAnchor (ONE per iteration) ----------------------------
  // Find the first field port that still has an unresolved payload variable.
  // Only emit one obligation — monotone to prevent oscillation.
  for (const [key, hint] of facts.ports) {
    if (hint.status !== 'unknown') continue;
    if (!hint.inference || hint.inference.payload.kind !== 'var') continue;

    const id = obligationId(`needsPayloadAnchor:${key}`);
    const deps: FactDependency[] = [{ kind: 'portHasUnresolvedPayload', port: key }];
    const { blockId, slotName } = parseDraftPortKey(key);

    obligations.push({
      id,
      kind: 'needsPayloadAnchor',
      anchor: { kind: 'port', blockId, slotName },
      status: { kind: 'open' },
      deps,
      policy: { name: 'payloadAnchor.v1' },
      debug: { createdBy: 'createDerivedObligations', note: `first unanchored field: ${key}` },
    });

    // ONE per iteration — stop here
    break;
  }

  return obligations;
}
