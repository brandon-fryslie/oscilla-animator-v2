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

import type { PayloadType, UnitType, Extent, CanonicalType, InstanceRef, ValueContract } from './canonical-types';
import { axisInst, type Axis, DEFAULT_BINDING, DEFAULT_PERSPECTIVE, DEFAULT_BRANCH } from './canonical-types';

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
    // Type guard has narrowed to PayloadType, but TypeScript needs help
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
    // Type guard has narrowed to UnitType, but TypeScript needs help
    unit = t.unit as UnitType;
  }

  return { payload, unit, extent: t.extent, contract: t.contract };
}
