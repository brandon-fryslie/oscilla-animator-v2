/**
 * Type System Test Helpers
 *
 * Factory functions for creating properly-typed CanonicalType and related objects
 * for testing. Eliminates the need for 'as any' casts when building type objects.
 *
 * @internal - Test-only infrastructure. Not part of public API.
 */

import {
  canonicalType as makeSignalType,
  unitScalar,
  unitCount,
  unitTurns, contractWrap01, contractClamp01,
  unitRadians,
  unitDegrees,
  unitNdc2,
  unitNdc3,
  unitWorld2,
  unitWorld3,
  unitRgba01,
  unitNone,
  axisInst,
  FLOAT,
  INT,
  BOOL,
  VEC2,
  VEC3,
  COLOR,
  CAMERA_PROJECTION,
  type PayloadType,
  type CanonicalType,
  type UnitType,
  type Extent,
  type CardinalityValue,
  type TemporalityValue,
  type BindingValue,
  type InstanceRef,
} from '../core/canonical-types';

import { instanceId, domainTypeId } from '../core/ids.js';

// Helper functions for tests
// NOTE: CardinalityValue now has \'zero\', \'one\', and \'many\' per spec


export function cardinalityZero(): CardinalityValue {
  return { kind: 'zero' };
}

export function cardinalityOne(): CardinalityValue {
  return { kind: 'one' };
}

export function cardinalityMany(instance: InstanceRef): CardinalityValue {
  return { kind: 'many', instance };
}

export function temporalityContinuous(): TemporalityValue {
  return { kind: 'continuous' };
}

export function temporalityDiscrete(): TemporalityValue {
  return { kind: 'discrete' };
}

export function bindingUnbound(): BindingValue {
  return { kind: 'unbound' };
}

// Backward compat alias
export const bindingDefault = bindingUnbound;

/**
 * Test helper: create InstanceRef from string literals (uses branded ID casts).
 */
export function testInstanceRef(instId: string, domainType: string = 'default'): InstanceRef {
  return { instanceId: instanceId(instId), domainTypeId: domainTypeId(domainType) };
}

/**
 * Create a test CanonicalType with specified payload and optional unit.
 *
 * Uses sensible defaults for the extent (cardinality: one, temporality: continuous, etc.).
 * For custom extent, use testSignalTypeWithExtent instead.
 *
 * @param payload - The payload type (float, int, vec2, etc.)
 * @param unit - Optional unit; if omitted, uses default for payload
 * @returns A properly typed CanonicalType
 *
 * @example
 * const floatType = testSignalType(FLOAT);
 * const phaseType = testSignalType(FLOAT, unitTurns(), undefined, contractWrap01());
 * const posType = testSignalType(VEC2, unitWorld2());
 */
export function testSignalType(
  payload: PayloadType,
  unit?: UnitType
): CanonicalType {
  return unit
    ? makeSignalType(payload, unit)
    : makeSignalType(payload);
}

/**
 * Create a test CanonicalType with custom extent.
 *
 * Use this when you need to test field types (cardinality: many)
 * or other non-default extent configurations.
 *
 * @param payload - The payload type
 * @param unit - The unit annotation
 * @param extentOverrides - Partial extent to customize (rest use defaults)
 * @returns A properly typed CanonicalType
 *
 * @example
 * // Field type over instances
 * const fieldType = testSignalTypeWithExtent(
 *   FLOAT,
 *   unitScalar(),
 *   { cardinality: cardinalityMany(instanceRef('circle')) }
 * );
 */
export function testSignalTypeWithExtent(
  payload: PayloadType,
  unit: UnitType,
  extentOverrides: Partial<Extent>
): CanonicalType {
  return makeSignalType(payload, unit, extentOverrides);
}

/**
 * Create a test float type with specified unit.
 *
 * Convenience helper for float types, the most common case.
 *
 * @param unit - Unit for the float (defaults to scalar if omitted)
 * @returns A CanonicalType with payload='float'
 *
 * @example
 * const scalar = testFloat();
 * const phase = testFloat(unitTurns(), undefined, contractWrap01());
 * const angle = testFloat(unitRadians());
 */
export function testFloat(unit?: UnitType): CanonicalType {
  return makeSignalType(FLOAT, unit ?? unitScalar());
}

/**
 * Create a test int type (defaults to count unit).
 *
 * @param unit - Unit for the int (defaults to count if omitted)
 * @returns A CanonicalType with payload='int'
 *
 * @example
 * const index = testInt();
 * const timeMs = testInt(unitMs());
 */
export function testInt(unit?: UnitType): CanonicalType {
  return makeSignalType(INT, unit ?? unitCount());
}

/**
 * Create a test vec2 type (defaults to world2 unit).
 *
 * @param unit - Unit for the vec2 (defaults to world2 if omitted)
 * @returns A CanonicalType with payload='vec2'
 *
 * @example
 * const position = testVec2();
 * const normalized = testVec2(unitNdc2());
 */
export function testVec2(unit?: UnitType): CanonicalType {
  return makeSignalType(VEC2, unit ?? unitWorld2());
}

/**
 * Create a test vec3 type (defaults to world3 unit).
 *
 * @param unit - Unit for the vec3 (defaults to world3 if omitted)
 * @returns A CanonicalType with payload='vec3'
 */
export function testVec3(unit?: UnitType): CanonicalType {
  return makeSignalType(VEC3, unit ?? unitWorld3());
}

/**
 * Create a test color type (RGBA, defaults to rgba01 unit).
 *
 * @param unit - Unit for the color (defaults to rgba01 if omitted)
 * @returns A CanonicalType with payload='color'
 *
 * @example
 * const color = testColor();
 */
export function testColor(unit?: UnitType): CanonicalType {
  return makeSignalType(COLOR, unit ?? unitRgba01());
}

/**
 * Create a test bool type (no unit).
 *
 * @returns A CanonicalType with payload='bool'
 */
export function testBool(): CanonicalType {
  return makeSignalType(BOOL, unitNone());
}

/**
 * Create a test shape type (shape descriptor, no unit).
 *
 * @returns A CanonicalType with payload='shape'
 */
export function testShape(): CanonicalType {
  return makeSignalType(FLOAT, unitNone());
}

/**
 * Create a field type (cardinality: many over instances).
 *
 * Convenience for the common pattern of creating field types with many cardinality.
 *
 * @param payload - The payload type
 * @param unit - The unit
 * @param instance - The instance to align by (e.g., from instanceRef)
 * @returns A CanonicalType with cardinality=many
 *
 * @example
 * const pointField = testFieldType(VEC2, unitWorld2(), instanceRef('polygon'));
 */
export function testFieldType(
  payload: PayloadType,
  unit: UnitType,
  instance: InstanceRef
): CanonicalType {
  return makeSignalType(payload, unit, {
    cardinality: axisInst(cardinalityMany(instance)),
  });
}

/**
 * Create a discrete (event) type.
 *
 * @param payload - The payload type for the event
 * @param unit - The unit annotation
 * @returns A CanonicalType with temporality=discrete
 *
 * @example
 * const clickEvent = testEventType(BOOL, unitNone());
 */
export function testEventType(
  payload: PayloadType,
  unit: UnitType
): CanonicalType {
  return makeSignalType(payload, unit, {
    temporality: axisInst(temporalityDiscrete()),
  });
}

// Re-export unit constructors for convenience
export { unitScalar, unitCount, unitTurns, contractWrap01, contractClamp01, unitRadians, unitDegrees, unitNdc2, unitNdc3, unitWorld2, unitWorld3, unitRgba01, unitNone };

// Re-export cardinality constructors

