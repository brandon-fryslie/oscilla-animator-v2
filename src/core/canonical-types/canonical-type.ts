/**
 * CanonicalType — Complete Type Contract
 *
 * What it is (payload), what it measures (unit), where/when/about-what
 * it exists (extent), and what range guarantees it provides (contract).
 *
 * This is the FINAL, RESOLVED type. It NEVER contains vars.
 * For inference types (which CAN have vars), see InferenceCanonicalType in inference-types.ts.
 */

import type { PayloadType } from './payloads';
import { BOOL } from './payloads';
import { defaultUnitForPayload } from './payloads';
import type { UnitType } from './units';
import { unitNone } from './units';
import type { Extent } from './extent';
import type { InstanceRef } from './instance-ref';
import type { ValueContract } from './contract';
import { axisInst } from './axis';
import { requireInst } from './axis';
import { cardinalityZero, cardinalityOne, cardinalityMany } from './cardinality';
import { temporalityContinuous, temporalityDiscrete } from './temporality';
import { DEFAULT_BINDING } from './binding';
import { DEFAULT_PERSPECTIVE } from './perspective';
import { DEFAULT_BRANCH } from './branch';

// =============================================================================
// CanonicalType
// =============================================================================

export interface CanonicalType {
  readonly payload: PayloadType;
  readonly unit: UnitType;
  readonly extent: Extent;
  readonly contract?: ValueContract;
}

// =============================================================================
// Constructors
// =============================================================================

/** Create a CanonicalType with explicit payload, unit, and optional extent overrides and contract. */
export function canonicalType(
  payload: PayloadType,
  unit?: UnitType,
  extentOverrides?: Partial<Extent>,
  contract?: ValueContract
): CanonicalType {
  return {
    payload,
    unit: unit ?? defaultUnitForPayload(payload),
    extent: {
      cardinality: extentOverrides?.cardinality ?? cardinalityOne(),
      temporality: extentOverrides?.temporality ?? temporalityContinuous(),
      binding: extentOverrides?.binding ?? axisInst(DEFAULT_BINDING),
      perspective: extentOverrides?.perspective ?? axisInst(DEFAULT_PERSPECTIVE),
      branch: extentOverrides?.branch ?? axisInst(DEFAULT_BRANCH),
    },
    contract,
  };
}

/** Create a signal type (one + continuous). */
export function canonicalSignal(
  payload: PayloadType,
  unit?: UnitType,
  contract?: ValueContract
): CanonicalType {
  return canonicalType(payload, unit, {
    cardinality: cardinalityOne(),
    temporality: temporalityContinuous(),
  }, contract);
}

/** Create a field type (many + continuous). */
export function canonicalField(
  payload: PayloadType,
  unit: UnitType | undefined,
  instance: InstanceRef,
  contract?: ValueContract
): CanonicalType {
  return canonicalType(payload, unit, {
    cardinality: cardinalityMany(instance),
    temporality: temporalityContinuous(),
  }, contract);
}

/** Create an event type (discrete + bool + none). */
export function canonicalEvent(): CanonicalType {
  return canonicalType(BOOL, unitNone(), {
    cardinality: cardinalityOne(),
    temporality: temporalityDiscrete(),
  });
}

/**
 * Compile-time constant type (zero cardinality + continuous).
 * Zero-cardinality values are universal donors — consumable by signal or field
 * contexts without explicit lifting. The evaluator reads the constant directly.
 */
export function canonicalConst(
  payload: PayloadType,
  unit?: UnitType,
  contract?: ValueContract
): CanonicalType {
  return canonicalType(payload, unit, {
    cardinality: cardinalityZero(),
    temporality: temporalityContinuous(),
  }, contract);
}

// =============================================================================
// CanonicalType Helpers
// =============================================================================

/**
 * Extract InstanceRef from a CanonicalType with many cardinality.
 * Throws if cardinality is not many.
 */
export function requireManyInstance(type: CanonicalType): InstanceRef {
  const card = requireInst(type.extent.cardinality, 'cardinality');
  if (card.kind !== 'many') {
    throw new Error(`Expected many cardinality, got: ${card.kind}`);
  }
  return card.instance;
}

/**
 * Return a copy of the type with its cardinality instance replaced.
 * Used by instance-creating blocks (Array, Polygon, Star) to rewrite
 * placeholder instance refs with the actual instance ID.
 */
export function withInstance(type: CanonicalType, instance: InstanceRef): CanonicalType {
  return {
    ...type,
    extent: {
      ...type.extent,
      cardinality: cardinalityMany(instance),
    },
  };
}
