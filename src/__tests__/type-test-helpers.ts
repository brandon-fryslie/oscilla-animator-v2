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
  unitPhase01,
  unitNorm01,
  unitRadians,
  unitDegrees,
  unitNdc2,
  unitNdc3,
  unitWorld2,
  unitWorld3,
  unitRgba01,
  unitNone,
  extentDefault,
  extent,
  cardinalityOne,
  cardinalityMany,
  temporalityContinuous,
  temporalityDiscrete,
  bindingUnbound,
  axisInstantiated,
  FLOAT,
  INT,
  BOOL,
  VEC2,
  VEC3,
  COLOR,
  SHAPE,
  CAMERA_PROJECTION,
  type PayloadType,
  type CanonicalType,
  type Unit,
  type Extent,
  type Cardinality,
  type InstanceRef,
} from '../core/canonical-types';

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
 * const phaseType = testSignalType(FLOAT, unitPhase01());
 * const posType = testSignalType(VEC2, unitWorld2());
 */
export function testSignalType(
  payload: PayloadType,
  unit?: Unit
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
  unit: Unit,
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
 * const phase = testFloat(unitPhase01());
 * const angle = testFloat(unitRadians());
 */
export function testFloat(unit?: Unit): CanonicalType {
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
export function testInt(unit?: Unit): CanonicalType {
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
export function testVec2(unit?: Unit): CanonicalType {
  return makeSignalType(VEC2, unit ?? unitWorld2());
}

/**
 * Create a test vec3 type (defaults to world3 unit).
 *
 * @param unit - Unit for the vec3 (defaults to world3 if omitted)
 * @returns A CanonicalType with payload='vec3'
 */
export function testVec3(unit?: Unit): CanonicalType {
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
export function testColor(unit?: Unit): CanonicalType {
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
  return makeSignalType(SHAPE, unitNone());
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
  unit: Unit,
  instance: InstanceRef
): CanonicalType {
  return makeSignalType(payload, unit, {
    cardinality: axisInstantiated(cardinalityMany(instance)),
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
  unit: Unit
): CanonicalType {
  return makeSignalType(payload, unit, {
    temporality: axisInstantiated(temporalityDiscrete()),
  });
}

// Re-export unit constructors for convenience
export { unitScalar, unitCount, unitPhase01, unitNorm01, unitRadians, unitDegrees, unitNdc2, unitNdc3, unitWorld2, unitWorld3, unitRgba01, unitNone };

// Re-export cardinality constructors
export { cardinalityOne, cardinalityMany, temporalityContinuous, temporalityDiscrete, bindingUnbound };
