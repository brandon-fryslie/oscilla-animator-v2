/**
 * src/pillars/types/solve/extract-constraints.ts
 *
 * Translates a `MutableGraph + catalog` into the flat constraint sets the two
 * pure sub-solvers consume. Two phases:
 *
 *   Phase A (per-block): for each block, instantiate type variables to
 *   block-scoped IDs to prevent cross-instance collisions in the substitution
 *   map. Emit concrete constraints from known-type fields; emit equality
 *   constraints for fields that share a var within the same block.
 *
 *   Phase B (per-edge): for each edge, look up the source output bundle and
 *   the target input bundle, match fields by name, and emit per-field
 *   payloadEq + unitEq + cardinality-equal constraints plus an EdgeVerification
 *   safety-net entry.
 *
 * Template-var instantiation is LOAD-BEARING: without alpha-renaming, two
 * instances of the same block type would collide in the substitution map, with
 * last-write-wins semantics silently corrupting one of them. [LAW:single-enforcer]
 * [LAW:effects-at-boundaries] (this file is pure — no graph mutation)
 */

import type { DefinedBlock } from '../../block-api';
import type { CardinalityVarId, PayloadVarId, UnitVarId, ZBlockContract, ZInferenceCanonicalType, ZInferenceCardinality, ZPayloadType, ZUnitType } from '../schemas';
import type { ConstraintOrigin, PortKey } from './shared';
import type { EdgeVerification, PayloadUnitSolveInput, PortVarInfo } from './payload-unit';
import type { CardinalitySolveInput, ZCardinalityConstraint } from './cardinality';
import type { ZPayloadUnitConstraint } from './payload-unit';
import type { DraftPortKey, MutableBlock, MutableEdge, MutableGraph } from './typed-graph';
import { draftPortKey } from './typed-graph';

// ---------------------------------------------------------------------------
// Output bundle
// ---------------------------------------------------------------------------

export interface ExtractedConstraints {
  /** The declared base type for each field-level port key (vars alpha-renamed). */
  readonly portBaseTypes: ReadonlyMap<DraftPortKey, ZInferenceCanonicalType>;
  /** Per-port variable info for the payload/unit solver. */
  readonly puPorts: ReadonlyMap<PortKey, PortVarInfo>;
  readonly payloadUnitConstraints: readonly ZPayloadUnitConstraint[];
  readonly edgeVerifications: readonly EdgeVerification[];
  readonly cardinalityPorts: ReadonlyMap<PortKey, ZInferenceCardinality>;
  readonly cardinalityConstraints: readonly ZCardinalityConstraint[];
  /** Cardinality variable IDs that accept an unbound instance (inherit policy). */
  readonly inheritInstanceVars: ReadonlySet<CardinalityVarId>;
}

// ---------------------------------------------------------------------------
// Alpha-renaming helpers
// ---------------------------------------------------------------------------

/**
 * Rewrite every type-variable ID in `type` to be scoped to `blockId`. This
 * prevents two instances of the same block type from sharing a variable in the
 * union-find substitution map. [LAW:single-enforcer]
 *
 * Format: payload var `v` → `p:${blockId}:${v}`, unit var `v` → `u:${blockId}:${v}`,
 * cardinality var `v` → `c:${blockId}:${v}`.
 */
function alphaRename(type: ZInferenceCanonicalType, blockId: string): ZInferenceCanonicalType {
  const payload = type.payload;
  const unit = type.unit;
  const card = type.extent.cardinality;

  return {
    payload: payload.kind === 'var' ? { kind: 'var', var: `p:${blockId}:${payload.var}` as PayloadVarId } : payload,
    unit: unit.kind === 'var' ? { kind: 'var', var: `u:${blockId}:${unit.var}` as UnitVarId } : unit,
    extent: {
      ...type.extent,
      cardinality: card.kind === 'var' ? { kind: 'var', var: `c:${blockId}:${card.var}` as CardinalityVarId } : card,
    },
  };
}

// ---------------------------------------------------------------------------
// Contract lookup
// ---------------------------------------------------------------------------

function getContract(block: MutableBlock, catalog: readonly DefinedBlock[]): ZBlockContract | undefined {
  if (block.syntheticContract !== undefined) return block.syntheticContract;
  return catalog.find((d) => d.type === block.type)?.contract;
}

// ---------------------------------------------------------------------------
// Main extraction
// ---------------------------------------------------------------------------

export function extractConstraints(
  graph: MutableGraph,
  catalog: readonly DefinedBlock[],
): ExtractedConstraints {
  const portBaseTypes = new Map<DraftPortKey, ZInferenceCanonicalType>();
  const puPorts = new Map<PortKey, PortVarInfo>();
  const payloadUnitConstraints: ZPayloadUnitConstraint[] = [];
  const edgeVerifications: EdgeVerification[] = [];
  const cardinalityPorts = new Map<PortKey, ZInferenceCardinality>();
  const cardinalityConstraints: ZCardinalityConstraint[] = [];
  const inheritInstanceVars = new Set<CardinalityVarId>();

  // --- Phase A: per-block --------------------------------------------------
  for (const block of graph.blocks) {
    const contract = getContract(block, catalog);
    if (contract === undefined) continue;

    const allSlots = [
      ...Object.entries(contract.inputs).map(([slot, binding]) => ({ slot, binding, dir: 'in' as const })),
      ...Object.entries(contract.outputs).map(([slot, binding]) => ({ slot, binding, dir: 'out' as const })),
    ];

    for (const { slot, binding, dir } of allSlots) {
      const origin: ConstraintOrigin = { kind: 'portDef', blockId: block.id, port: slot, dir };

      // Track vars seen per-field within this block to emit intra-block equality constraints.
      // vars are ALREADY alpha-renamed; we group by the renamed var id.
      const renamedPayloadVarToFirstKey = new Map<PayloadVarId, DraftPortKey>();
      const renamedUnitVarToFirstKey = new Map<UnitVarId, DraftPortKey>();
      const renamedCardVarToFirstKey = new Map<CardinalityVarId, DraftPortKey>();

      for (const [fieldName, rawType] of Object.entries(binding.type)) {
        const type = alphaRename(rawType, block.id);
        const key = draftPortKey(block.id, slot, fieldName, dir);

        portBaseTypes.set(key, type);

        // --- Payload/unit ---
        const varInfo: PortVarInfo = {
          ...(type.payload.kind === 'var' ? { payloadVar: type.payload.var } : {}),
          ...(type.unit.kind === 'var' ? { unitVar: type.unit.var } : {}),
        };
        puPorts.set(key, varInfo);

        if (type.payload.kind !== 'var') {
          const value: ZPayloadType = type.payload;
          payloadUnitConstraints.push({ kind: 'concretePayload', port: key, value, origin });
        }
        if (type.unit.kind !== 'var') {
          const value: ZUnitType = type.unit;
          payloadUnitConstraints.push({ kind: 'concreteUnit', port: key, value, origin });
        }

        // Intra-block equality: if another field in this block shares the same renamed payload var → payloadEq
        if (type.payload.kind === 'var') {
          const first = renamedPayloadVarToFirstKey.get(type.payload.var);
          if (first !== undefined) {
            payloadUnitConstraints.push({ kind: 'payloadEq', a: first, b: key, origin });
          } else {
            renamedPayloadVarToFirstKey.set(type.payload.var, key);
          }
        }
        if (type.unit.kind === 'var') {
          const first = renamedUnitVarToFirstKey.get(type.unit.var);
          if (first !== undefined) {
            payloadUnitConstraints.push({ kind: 'unitEq', a: first, b: key, origin });
          } else {
            renamedUnitVarToFirstKey.set(type.unit.var, key);
          }
        }

        // --- Cardinality ---
        cardinalityPorts.set(key, type.extent.cardinality);
        const card = type.extent.cardinality;

        if (card.kind !== 'var') {
          if (card.kind === 'many') {
            cardinalityConstraints.push({ kind: 'forceMany', port: key, instance: { kind: 'inst', ref: card.instance }, origin });
          } else if (card.kind === 'one') {
            // Concrete 'one' does NOT emit clampOne (only explicit constraints do, per walkthrough §4.2 Phase 2).
            // It's just the base cardinality; the group defaults to 'one' anyway.
          }
        } else {
          // Intra-block cardinality equality for shared vars
          const first = renamedCardVarToFirstKey.get(card.var);
          if (first !== undefined) {
            cardinalityConstraints.push({ kind: 'equal', a: first, b: key, origin });
            // A cardinality variable shared between an input and output of the same block
            // is an inherit-binding pattern (modifier polymorphism): if one is many, the other follows.
            // Mark this var for the inherit-instance set so the cardinality solver defers
            // rather than emitting UnresolvedInstanceVar.
            inheritInstanceVars.add(card.var);
          } else {
            renamedCardVarToFirstKey.set(card.var, key);
          }
        }
      }
    }
  }

  // --- Phase B: per-edge --------------------------------------------------
  for (const edge of graph.edges) {
    const srcBlock = graph.blocks.find((b) => b.id === edge.source);
    const tgtBlock = graph.blocks.find((b) => b.id === edge.target);
    if (!srcBlock || !tgtBlock) continue;

    const srcContract = getContract(srcBlock, catalog);
    const tgtContract = getContract(tgtBlock, catalog);
    if (!srcContract || !tgtContract) continue;

    const srcSlot = srcContract.outputs[edge.outputSlot];
    const tgtSlot = tgtContract.inputs[edge.inputSlot];
    if (!srcSlot || !tgtSlot) continue;

    const edgeOrigin: ConstraintOrigin = { kind: 'edge', edgeId: edge.id };

    // Match fields by name. Fields in both source and target get eq constraints.
    for (const fieldName of Object.keys(srcSlot.type)) {
      if (!(fieldName in tgtSlot.type)) continue; // unmatched field — skip

      const srcKey = draftPortKey(edge.source, edge.outputSlot, fieldName, 'out');
      const tgtKey = draftPortKey(edge.target, edge.inputSlot, fieldName, 'in');

      // Ensure both keys are registered in puPorts (they should be from Phase A, but guard)
      if (!puPorts.has(srcKey) || !puPorts.has(tgtKey)) continue;

      payloadUnitConstraints.push({ kind: 'payloadEq', a: srcKey, b: tgtKey, origin: edgeOrigin });
      payloadUnitConstraints.push({ kind: 'unitEq', a: srcKey, b: tgtKey, origin: edgeOrigin });
      cardinalityConstraints.push({ kind: 'equal', a: srcKey, b: tgtKey, origin: edgeOrigin });
      edgeVerifications.push({ edgeId: `${edge.id}:${fieldName}`, from: srcKey, to: tgtKey });
    }
  }

  return {
    portBaseTypes,
    puPorts,
    payloadUnitConstraints,
    edgeVerifications,
    cardinalityPorts,
    cardinalityConstraints,
    inheritInstanceVars,
  };
}

// ---------------------------------------------------------------------------
// Build the PayloadUnitSolveInput and CardinalitySolveInput wrappers
// ---------------------------------------------------------------------------

export function buildPUSolveInput(extracted: ExtractedConstraints): PayloadUnitSolveInput {
  return {
    ports: extracted.puPorts,
    constraints: extracted.payloadUnitConstraints,
    edgeVerifications: extracted.edgeVerifications,
  };
}

export function buildCardSolveInput(extracted: ExtractedConstraints): CardinalitySolveInput {
  return {
    ports: extracted.cardinalityPorts,
    constraints: extracted.cardinalityConstraints,
    inheritInstanceVars: extracted.inheritInstanceVars,
  };
}
