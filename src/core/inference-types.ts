/**
 * Inference Type System — frontend-only types that allow unresolved variables.
 *
 * This module provides the "unknown/variable" overlay on top of the canonical
 * type system. Block definitions and the type inference solver use these types.
 * After solving, all vars must be eliminated via finalizeInferenceType().
 *
 * Architecture:
 * - Shared value domains (PayloadType, UnitType, axis values) are in canonical-types.ts
 * - This file adds: InferencePayloadType, InferenceUnitType, InferenceCanonicalType
 * - One function (finalizeInferenceType) converts inference → canonical, or fails
 */

import type { PayloadType, UnitType, Extent, CanonicalType, InstanceRef, ValueContract, CardinalityValue, TemporalityValue, BindingValue, PerspectiveValue, BranchValue } from './canonical-types';
import { axisInst, isAxisVar, isAxisInst, type Axis, DEFAULT_BINDING, DEFAULT_PERSPECTIVE, DEFAULT_BRANCH } from './canonical-types';
import type { CardinalityVarId, TemporalityVarId, BindingVarId, PerspectiveVarId, BranchVarId } from './ids';

// =============================================================================
// Inference Payload Type
// =============================================================================

export type InferencePayloadType =
  | PayloadType
  | { readonly kind: 'var'; readonly id: string };

let payloadVarCounter = 0;
export function inferPayloadVar(id?: string): InferencePayloadType {
  return { kind: 'var', id: id ?? `_pv${payloadVarCounter++}` };
}

// Keep ergonomic alias for block authors
export const payloadVar = inferPayloadVar;

export function isPayloadVar(p: InferencePayloadType): p is { kind: 'var'; id: string } {
  return p.kind === 'var';
}

export function isConcretePayload(p: InferencePayloadType): p is PayloadType {
  return p.kind !== 'var';
}

// =============================================================================
// Inference Unit Type
// =============================================================================

export type InferenceUnitType =
  | UnitType
  | { readonly kind: 'var'; readonly id: string };

let unitVarCounter = 0;
export function inferUnitVar(id?: string): InferenceUnitType {
  return { kind: 'var', id: id ?? `_uv${unitVarCounter++}` };
}

// Keep ergonomic alias for block authors
export const unitVar = inferUnitVar;

export function isUnitVar(u: InferenceUnitType): u is { kind: 'var'; id: string } {
  return u.kind === 'var';
}

export function isConcreteUnit(u: InferenceUnitType): u is UnitType {
  return u.kind !== 'var';
}

// =============================================================================
// InferenceCanonicalType
// =============================================================================

/**
 * Like CanonicalType but allows payload and unit variables.
 * Used in BlockDef port types and during type inference.
 *
 * CanonicalType is assignable to InferenceCanonicalType (every final type
 * is also a valid inference type), but not vice versa.
 *
 * Note: contract is NOT inferred. It's an explicit declaration that can be
 * specified on block definitions, but there are no contract variables.
 */
export interface InferenceCanonicalType {
  readonly payload: InferencePayloadType;
  readonly unit: InferenceUnitType;
  readonly extent: Extent;
  readonly contract?: ValueContract;
}

// =============================================================================
// Inference Constructors
// =============================================================================

/**
 * Create an InferenceCanonicalType. Accepts vars in payload and unit.
 * Use this in block definitions where types are constraints, not final types.
 */
export function inferType(
  payload: InferencePayloadType,
  unit: InferenceUnitType,
  extentOverrides?: Partial<Extent>,
  contract?: ValueContract
): InferenceCanonicalType {
  return {
    payload,
    unit,
    extent: {
      cardinality: extentOverrides?.cardinality ?? axisInst({ kind: 'one' }),
      temporality: extentOverrides?.temporality ?? axisInst({ kind: 'continuous' }),
      binding: extentOverrides?.binding ?? axisInst(DEFAULT_BINDING),
      perspective: extentOverrides?.perspective ?? axisInst(DEFAULT_PERSPECTIVE),
      branch: extentOverrides?.branch ?? axisInst(DEFAULT_BRANCH),
    },
    contract,
  };
}

/**
 * Create an inference field type (many + continuous). Accepts vars.
 */
export function inferField(
  payload: InferencePayloadType,
  unit: InferenceUnitType,
  instance: InstanceRef,
  contract?: ValueContract
): InferenceCanonicalType {
  return {
    payload,
    unit,
    extent: {
      cardinality: axisInst({ kind: 'many', instance }),
      temporality: axisInst({ kind: 'continuous' }),
      binding: axisInst(DEFAULT_BINDING),
      perspective: axisInst(DEFAULT_PERSPECTIVE),
      branch: axisInst(DEFAULT_BRANCH),
    },
    contract,
  };
}

// =============================================================================
// Finalization — the ONE function that converts inference → canonical
// =============================================================================

export interface Substitution {
  readonly payloads: ReadonlyMap<string, PayloadType>;
  readonly units: ReadonlyMap<string, UnitType>;
  /** Axis var substitutions (optional — backward compatible when absent) */
  readonly cardinalities?: ReadonlyMap<CardinalityVarId, CardinalityValue>;
  readonly temporalities?: ReadonlyMap<TemporalityVarId, TemporalityValue>;
  readonly bindings?: ReadonlyMap<BindingVarId, BindingValue>;
  readonly perspectives?: ReadonlyMap<PerspectiveVarId, PerspectiveValue>;
  readonly branches?: ReadonlyMap<BranchVarId, BranchValue>;
}

/** Empty substitution — no vars resolved. */
export const EMPTY_SUBSTITUTION: Substitution = {
  payloads: new Map(),
  units: new Map(),
};

/**
 * Resolve a single axis value through substitution.
 * Returns the axis unchanged if already instantiated.
 * Throws if the axis is a var and no substitution exists.
 */
function resolveAxis<T, V extends string>(
  axis: Axis<T, V>,
  axisName: string,
  subst: ReadonlyMap<V, T> | undefined,
): Axis<T, V> {
  if (!isAxisVar(axis)) return axis;
  if (!subst) {
    throw new Error(`Unresolved ${axisName} variable: ${axis.var} (no substitution map)`);
  }
  const resolved = subst.get(axis.var);
  if (resolved === undefined) {
    throw new Error(`Unresolved ${axisName} variable: ${axis.var}`);
  }
  return axisInst(resolved);
}

/**
 * Try to resolve a single axis value, returning null if var is unresolved.
 */
function tryResolveAxis<T, V extends string>(
  axis: Axis<T, V>,
  subst: ReadonlyMap<V, T> | undefined,
): Axis<T, V> | null {
  if (!isAxisVar(axis)) return axis;
  if (!subst) return null;
  const resolved = subst.get(axis.var);
  if (resolved === undefined) return null;
  return axisInst(resolved);
}

/**
 * Convert InferenceCanonicalType to CanonicalType by applying substitution.
 * Throws if any variable survives after substitution.
 *
 * This is the ONLY function in the codebase that crosses the inference→canonical boundary.
 * Contracts pass through unchanged (they are never inferred, only declared).
 */
export function finalizeInferenceType(
  t: InferenceCanonicalType,
  subst: Substitution
): CanonicalType {
  let payload: PayloadType;
  if (isPayloadVar(t.payload)) {
    const resolved = subst.payloads.get(t.payload.id);
    if (!resolved) {
      throw new Error(`Unresolved payload variable: ${t.payload.id}`);
    }
    payload = resolved;
  } else {
    payload = t.payload as PayloadType;
  }

  let unit: UnitType;
  if (isUnitVar(t.unit)) {
    const resolved = subst.units.get(t.unit.id);
    if (!resolved) {
      throw new Error(`Unresolved unit variable: ${t.unit.id}`);
    }
    unit = resolved;
  } else {
    unit = t.unit as UnitType;
  }

  // Resolve axis vars in extent
  const extent: Extent = {
    cardinality: resolveAxis(t.extent.cardinality, 'cardinality', subst.cardinalities),
    temporality: resolveAxis(t.extent.temporality, 'temporality', subst.temporalities),
    binding: resolveAxis(t.extent.binding, 'binding', subst.bindings),
    perspective: resolveAxis(t.extent.perspective, 'perspective', subst.perspectives),
    branch: resolveAxis(t.extent.branch, 'branch', subst.branches),
  };

  return { payload, unit, extent, contract: t.contract };
}

/**
 * Check if an InferenceCanonicalType can be finalized with the given substitution.
 * Returns true if finalizeInferenceType() would succeed (no unresolved vars).
 */
export function isInferenceCanonicalizable(
  t: InferenceCanonicalType,
  subst: Substitution,
): boolean {
  // Check payload
  if (isPayloadVar(t.payload)) {
    if (!subst.payloads.has(t.payload.id)) return false;
  }

  // Check unit
  if (isUnitVar(t.unit)) {
    if (!subst.units.has(t.unit.id)) return false;
  }

  // Check axis vars
  if (isAxisVar(t.extent.cardinality)) {
    if (!subst.cardinalities?.has(t.extent.cardinality.var)) return false;
  }
  if (isAxisVar(t.extent.temporality)) {
    if (!subst.temporalities?.has(t.extent.temporality.var)) return false;
  }
  if (isAxisVar(t.extent.binding)) {
    if (!subst.bindings?.has(t.extent.binding.var)) return false;
  }
  if (isAxisVar(t.extent.perspective)) {
    if (!subst.perspectives?.has(t.extent.perspective.var)) return false;
  }
  if (isAxisVar(t.extent.branch)) {
    if (!subst.branches?.has(t.extent.branch.var)) return false;
  }

  return true;
}

/**
 * Apply partial substitution to an InferenceCanonicalType.
 * Resolves whatever vars are available, leaves others as vars.
 * Used to compute partial TypeFacts (status: 'unknown') during the fixpoint.
 */
export function applyPartialSubstitution(
  t: InferenceCanonicalType,
  subst: Substitution,
): InferenceCanonicalType {
  let payload = t.payload;
  if (isPayloadVar(payload)) {
    const resolved = subst.payloads.get(payload.id);
    if (resolved) payload = resolved;
  }

  let unit = t.unit;
  if (isUnitVar(unit)) {
    const resolved = subst.units.get(unit.id);
    if (resolved) unit = resolved;
  }

  const extent: Extent = {
    cardinality: tryResolveAxis(t.extent.cardinality, subst.cardinalities) ?? t.extent.cardinality,
    temporality: tryResolveAxis(t.extent.temporality, subst.temporalities) ?? t.extent.temporality,
    binding: tryResolveAxis(t.extent.binding, subst.bindings) ?? t.extent.binding,
    perspective: tryResolveAxis(t.extent.perspective, subst.perspectives) ?? t.extent.perspective,
    branch: tryResolveAxis(t.extent.branch, subst.branches) ?? t.extent.branch,
  };

  return { payload, unit, extent, contract: t.contract };
}
