/**
 * src/pillars/types/solve/substitution.ts
 *
 * The substitution: the accumulated answer both sub-solvers contribute to —
 * one resolved value per bound variable, in the three (and only three) spaces
 * the schema mints variables for. `applySubstitution` is the pure walk that
 * pushes those answers into an inference type.
 *
 * The single inference→concrete bridge is NOT here: it is one
 * `ZCanonicalTypeSchema.safeParse` at the resolver's commit step (wzm3.5). This
 * file's contract with that bridge is exactly testable — apply a *total*
 * substitution and the result parses as concrete; apply a *partial* one and a
 * surviving variable makes the same parse fail. The parse, not a scattered
 * `kind === 'inst'` check, is the boundary. [LAW:single-enforcer]
 * [LAW:types-are-the-program]
 */

import type {
  CardinalityVarId,
  PayloadVarId,
  UnitVarId,
  ZCardinality,
  ZInferenceCanonicalType,
  ZInferenceCardinality,
  ZInferenceExtent,
  ZInferencePayloadType,
  ZInferenceUnitType,
  ZPayloadType,
  ZUnitType,
} from '../schemas';

/**
 * Per-variable, not per-port: ports that share a variable (a modifier tying its
 * output field to its input field) resolve through one binding, recorded once.
 * The three maps mirror the three variable spaces — payload, unit, cardinality.
 * No fourth space exists because the schema mints no other variables: binding,
 * perspective, branch, and temporality are default-only or derived.
 * [LAW:one-source-of-truth]
 */
export interface Substitution {
  readonly payloads: ReadonlyMap<PayloadVarId, ZPayloadType>;
  readonly units: ReadonlyMap<UnitVarId, ZUnitType>;
  readonly cardinalities: ReadonlyMap<CardinalityVarId, ZCardinality>;
}

export const EMPTY_SUBSTITUTION: Substitution = {
  payloads: new Map(),
  units: new Map(),
  cardinalities: new Map(),
};

/**
 * Replace every bound variable in `type` with its substitution value. Unbound
 * variables (absent from the substitution — a partial solve) pass through
 * unchanged, so the result is still an inference type and may still carry
 * variables. Totality is the resolver's concern, observed by parsing the output
 * as `ZCanonicalType`; this function makes no totality claim. [LAW:effects-at-boundaries]
 *
 * Variables live at exactly one place per axis: the top level of payload, of
 * unit, and of the cardinality axis. `angle.unit` is a closed enum in the
 * landed schema, not a variable slot, so there is no nested-variable recursion
 * to perform — a nested unit variable is unrepresentable, and code to substitute
 * one would be unreachable. (Should a later schema child make unit variants
 * carry variables, the substitution extends there, at the type that gains them.)
 */
export function applySubstitution(
  type: ZInferenceCanonicalType,
  subst: Substitution,
): ZInferenceCanonicalType {
  return {
    payload: substPayload(type.payload, subst),
    unit: substUnit(type.unit, subst),
    extent: substExtent(type.extent, subst),
  };
}

const substPayload = (
  payload: ZInferencePayloadType,
  subst: Substitution,
): ZInferencePayloadType =>
  payload.kind === 'var' ? subst.payloads.get(payload.var) ?? payload : payload;

const substUnit = (unit: ZInferenceUnitType, subst: Substitution): ZInferenceUnitType =>
  unit.kind === 'var' ? subst.units.get(unit.var) ?? unit : unit;

const substCardinality = (
  cardinality: ZInferenceCardinality,
  subst: Substitution,
): ZInferenceCardinality =>
  cardinality.kind === 'var'
    ? subst.cardinalities.get(cardinality.var) ?? cardinality
    : cardinality;

/**
 * Cardinality is the only extent axis with a variable form, so it is the only
 * one substitution touches; the other four pass through structurally. The
 * spread preserves them without enumerating, so adding a future axis needs no
 * edit here. [LAW:dataflow-not-control-flow]
 */
const substExtent = (extent: ZInferenceExtent, subst: Substitution): ZInferenceExtent => ({
  ...extent,
  cardinality: substCardinality(extent.cardinality, subst),
});
