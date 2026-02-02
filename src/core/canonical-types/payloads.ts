/**
 * Payload Types — What the value is made of
 *
 * Closed union of concrete payload kinds (float, int, bool, vec2, vec3, color, cameraProjection).
 * Stride is NOT stored — use payloadStride() to derive it from kind.
 */

import type { UnitType } from './units';
import {
  unitScalar, unitCount, unitWorld2, unitWorld3,
  unitRgba01, unitNone,
} from './units';

// =============================================================================
// Types
// =============================================================================

/**
 * Closed union of camera projection modes.
 * Per resolution Q8: cameraProjection is a closed enum, not a matrix.
 */
export type CameraProjection = 'orthographic' | 'perspective';

/**
 * Concrete payload types (non-variable) as discriminated union.
 *
 * Stride is NOT stored - use payloadStride() to derive it from kind.
 * Per resolution Q7: stride is derived, never stored.
 *
 * Note: 'phase' is NOT a payload - it's float with unit:turns.
 * Note: 'event' and 'domain' are NOT PayloadTypes - they are axis/resource concepts.
 * Note: 'shape' removed per Q6 - shapes are resources, not payloads.
 */
export type ConcretePayloadType =
  | { readonly kind: 'float' }
  | { readonly kind: 'int' }
  | { readonly kind: 'bool' }
  | { readonly kind: 'vec2' }
  | { readonly kind: 'vec3' }
  | { readonly kind: 'color' }
  | { readonly kind: 'cameraProjection' };

/**
 * PayloadType is the final, concrete payload type.
 * In canonical types, PayloadType = ConcretePayloadType (no vars allowed).
 *
 * For inference types (which CAN have vars), see InferencePayloadType in inference-types.ts.
 */
export type PayloadType = ConcretePayloadType;

/**
 * The kind discriminator for concrete payload types.
 * Use this for switch statements and Record keys.
 */
export type PayloadKind = ConcretePayloadType['kind'];

// =============================================================================
// Singleton Instances
// =============================================================================

/** Float payload type (stride: 1) */
export const FLOAT: ConcretePayloadType = { kind: 'float' } as const;
/** Int payload type (stride: 1) */
export const INT: ConcretePayloadType = { kind: 'int' } as const;
/** Bool payload type (stride: 1) */
export const BOOL: ConcretePayloadType = { kind: 'bool' } as const;
/** Vec2 payload type (stride: 2) */
export const VEC2: ConcretePayloadType = { kind: 'vec2' } as const;
/** Vec3 payload type (stride: 3) */
export const VEC3: ConcretePayloadType = { kind: 'vec3' } as const;
/** Color payload type (stride: 4) */
export const COLOR: ConcretePayloadType = { kind: 'color' } as const;
/** Camera projection payload type (stride: 1) */
export const CAMERA_PROJECTION: ConcretePayloadType = { kind: 'cameraProjection' } as const;

/**
 * Map from kind string to singleton instance.
 * Used by payloadFromKind() for deserialization and compatibility.
 */
const PAYLOAD_BY_KIND: Record<PayloadKind, ConcretePayloadType> = {
  float: FLOAT,
  int: INT,
  bool: BOOL,
  vec2: VEC2,
  vec3: VEC3,
  color: COLOR,
  cameraProjection: CAMERA_PROJECTION,
};

// =============================================================================
// Payload-Unit Validation (Spec §A4)
// =============================================================================

/**
 * Map payload kinds to allowed unit kinds.
 * Updated for #18 structured units - now lists top-level kinds only.
 * Updated for ValueContract migration: removed 'norm01' (use scalar + contract:clamp01).
 */
const ALLOWED_UNITS: Record<PayloadKind, readonly UnitType['kind'][]> = {
  float: ['scalar', 'angle', 'time'],
  int: ['count', 'time'],
  vec2: ['space'],
  vec3: ['space'],
  color: ['color'],
  bool: ['none'],
  cameraProjection: ['none'],
};

// =============================================================================
// Functions
// =============================================================================

/** Get a ConcretePayloadType from its kind string. */
export function payloadFromKind(kind: PayloadKind): ConcretePayloadType {
  return PAYLOAD_BY_KIND[kind];
}

/** Compare two payloads for equality. */
export function payloadsEqual(a: PayloadType, b: PayloadType): boolean {
  return a.kind === b.kind;
}

/** Check if a (payload, unit) combination is valid per spec §A4. */
export function isValidPayloadUnit(payload: PayloadType, unit: UnitType): boolean {
  const allowed = ALLOWED_UNITS[payload.kind];
  if (!allowed) return false;
  return allowed.includes(unit.kind);
}

/** Get the default unit for a payload type. */
export function defaultUnitForPayload(payload: PayloadType): UnitType {
  switch (payload.kind) {
    case 'float': return unitScalar();
    case 'int': return unitCount();
    case 'vec2': return unitWorld2();
    case 'vec3': return unitWorld3();
    case 'color': return unitRgba01();
    case 'bool': return unitNone();
    case 'cameraProjection': return unitNone();
    default: {
      const _exhaustive: never = payload;
      throw new Error(`Unknown payload kind: ${(_exhaustive as ConcretePayloadType).kind}`);
    }
  }
}
