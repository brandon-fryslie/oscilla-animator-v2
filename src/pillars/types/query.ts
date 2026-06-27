/**
 * src/pillars/types/query.ts
 *
 * Catalog listing and context-side matching are separate entry points because
 * their data contracts differ: listing is a palette projection, matching is a
 * typed-graph query. [LAW:dataflow-not-control-flow] [LAW:one-type-per-behavior]
 *
 * The context-side matching vocabulary is the SAME as the adapter search:
 * a direct-check is a mini unification through the sub-solvers (zero adapter
 * intermediary); an adapter-match calls `findAdapterCandidates` directly. No
 * new matching dialect, no extra abstraction. [LAW:one-type-per-behavior]
 *
 * Performance contract: a ~100-block catalog queried 1000× completes in < 1 s
 * (each query is O(catalog × slots × adapters) with small constants). Enforced
 * by a co-located benchmark. [LAW:verifiable-goals]
 */

import type { DefinedBlock } from '../block-api';
import type { ZAdapterSpec, ZBlockContract, ZCanonicalType, ZInferenceCanonicalType } from './schemas';
import type { ZPayloadType, ZUnitType } from './schemas';
import type { ZInferenceCardinality } from './schemas';
import { portVarInfoOf, solvePayloadUnit } from './solve/payload-unit';
import type { PortVarInfo, ZPayloadUnitConstraint } from './solve/payload-unit';
import { solveCardinality } from './solve/cardinality';
import type { ZCardinalityConstraint } from './solve/cardinality';
import type { ConstraintOrigin, PortKey } from './solve/shared';
import { findAdapterCandidates } from './solve/adapters';
import type { AdapterCandidate } from './solve/adapters';
import type { DraftPortDirection, DraftPortKey, StrictTypedGraph } from './solve/typed-graph';
import { parseDraftPortKey } from './solve/typed-graph';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A field-level port identifier: `${blockId}:${slotName}:${fieldName}:${dir}`.
 * The caller obtains one by reading `StrictTypedGraph.portTypes` (its keys) or
 * building one from known block/slot/field names via `draftPortKey`.
 */
export type PortRef = DraftPortKey;

/** Catalog-side result: the block + its contract + adapter marker (if any). */
export interface CatalogEntry {
  readonly blockType: string;
  readonly contract: ZBlockContract | undefined;
  readonly adapterSpec: ZAdapterSpec | undefined;
}

/**
 * Context-side result: a block that could wire to the queried port, the slot
 * on that block that matches, whether an adapter is needed, and how confident
 * the match is.
 *
 * `direct`    — the port type and slot type are directly compatible (the
 *               sub-solvers produce no error; no adapter block needed).
 * `via-adapter` — a `findAdapterCandidates` candidate exists; the solver would
 *               insert one of those adapters automatically.
 */
export interface InsertableBlock {
  readonly blockType: string;
  readonly matchingSlotId: string;
  readonly adapter: AdapterCandidate | null;
  readonly confidence: 'direct' | 'via-adapter';
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/**
 * Catalog-side listing: every block in the catalog, no filtering.
 * Callers use this for the insertion palette. O(catalog).
 */
export function listCatalogEntries(catalog: readonly DefinedBlock[]): readonly CatalogEntry[] {
  return catalog.map((b): CatalogEntry => ({
    blockType: b.type,
    contract: b.contract,
    adapterSpec: b.adapterSpec,
  }));
}

export function findInsertableBlocks(
  portRef: PortRef,
  typedGraph: StrictTypedGraph,
  catalog: readonly DefinedBlock[],
): readonly InsertableBlock[] {
  const resolvedType = typedGraph.portTypes.get(portRef);
  if (!resolvedType) return [];
  const { dir } = parseDraftPortKey(portRef);

  const results: InsertableBlock[] = [];

  for (const block of catalog) {
    if (!block.contract) continue;

    const candidateSlots = block.contract[candidateSlotsByQueriedPort[dir]];

    for (const [slotName, binding] of Object.entries(candidateSlots)) {
      const fieldEntries = Object.entries(binding.type);
      if (fieldEntries.length === 0) continue;

      // Use the first field for matching (single-field bundles are the common case).
      const [, slotFieldType] = fieldEntries[0];

      if (typesDirectlyCompatible(resolvedType, slotFieldType)) {
        results.push({ blockType: block.type, matchingSlotId: slotName, adapter: null, confidence: 'direct' });
        break; // first matching slot per block is enough
      }

      const endpoints = adapterEndpointsByQueriedPort[dir](resolvedType, slotFieldType);
      const adapters = findAdapterCandidates(endpoints.source, endpoints.target, catalog);
      if (adapters.length > 0) {
        results.push({ blockType: block.type, matchingSlotId: slotName, adapter: adapters[0], confidence: 'via-adapter' });
        break;
      }
    }
  }

  return results.sort(rankInsertable);
}

const candidateSlotsByQueriedPort: Record<DraftPortDirection, 'inputs' | 'outputs'> = {
  out: 'inputs',
  in: 'outputs',
};

const adapterEndpointsByQueriedPort: Record<
  DraftPortDirection,
  (resolvedType: ZCanonicalType, slotFieldType: ZInferenceCanonicalType) => {
    readonly source: ZInferenceCanonicalType;
    readonly target: ZInferenceCanonicalType;
  }
> = {
  out: (resolvedType, slotFieldType) => ({ source: resolvedType, target: slotFieldType }),
  in: (resolvedType, slotFieldType) => ({ source: slotFieldType, target: resolvedType }),
};

// ---------------------------------------------------------------------------
// Direct compatibility check — the matching primitive for zero-adapter cases
// ---------------------------------------------------------------------------

/**
 * Run a mini unification: does `candidate` (a slot's declared
 * `ZInferenceCanonicalType`, possibly with variables) accept a value of the
 * concrete `resolved` type without an adapter? Uses the same sub-solvers as
 * `findAdapterCandidates` — not a parallel matching vocabulary.
 * [LAW:one-type-per-behavior] [LAW:single-enforcer]
 */
function typesDirectlyCompatible(
  resolved: ZCanonicalType,
  candidate: ZInferenceCanonicalType,
): boolean {
  const origin: ConstraintOrigin = { kind: 'blockRule', blockId: '__query__', rule: 'direct-check' };

  // Payload / unit — two-port equality check
  const puPorts = new Map<PortKey, PortVarInfo>([
    ['r', portVarInfoOf(resolved)],
    ['c', portVarInfoOf(candidate)],
  ]);
  const puConstraints: ZPayloadUnitConstraint[] = [
    { kind: 'payloadEq', a: 'r', b: 'c', origin },
    { kind: 'unitEq', a: 'r', b: 'c', origin },
  ];
  // resolved is ZCanonicalType — always concrete, no vars
  puConstraints.push({ kind: 'concretePayload', port: 'r', value: resolved.payload, origin });
  puConstraints.push({ kind: 'concreteUnit', port: 'r', value: resolved.unit, origin });
  if (candidate.payload.kind !== 'var') {
    const value = candidate.payload as ZPayloadType;
    puConstraints.push({ kind: 'concretePayload', port: 'c', value, origin });
  }
  if (candidate.unit.kind !== 'var') {
    const value = candidate.unit as ZUnitType;
    puConstraints.push({ kind: 'concreteUnit', port: 'c', value, origin });
  }

  const pu = solvePayloadUnit({ ports: puPorts, constraints: puConstraints });
  if (pu.errors.length > 0) return false;

  // Cardinality — equal group check
  const cardPorts = new Map<PortKey, ZInferenceCardinality>([
    ['r', resolved.extent.cardinality],
    ['c', candidate.extent.cardinality],
  ]);
  const cardConstraints: ZCardinalityConstraint[] = [{ kind: 'equal', a: 'r', b: 'c', origin }];
  const card = solveCardinality({ ports: cardPorts, constraints: cardConstraints });
  return card.errors.length === 0;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

const confidenceRank: Record<InsertableBlock['confidence'], number> = {
  'direct': 0,
  'via-adapter': 1,
};

const rankInsertable = (a: InsertableBlock, b: InsertableBlock): number => {
  const byConf = confidenceRank[a.confidence] - confidenceRank[b.confidence];
  if (byConf !== 0) return byConf;
  return a.blockType < b.blockType ? -1 : a.blockType > b.blockType ? 1 : 0;
};
