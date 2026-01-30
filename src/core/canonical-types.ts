/**
 * Canonical Type System for Oscilla v2.5
 *
 * This module implements the 5-axis type system as specified in:
 * design-docs/spec/CANONICAL-ARCHITECTURE-oscilla-v2.5-20260109-160000.md
 *
 * The type system separates concerns into:
 * - PayloadType: What the value is made of (float, vec2, color, etc.)
 * - Extent: Where/when/about-what a value exists (5 independent axes)
 * - CanonicalType: Complete type contract (payload + extent + unit)
 * - NumericUnit: Optional unit annotation for numeric types (phase, radians, etc.)
 *
 * Key design principles:
 * - No optional fields - use discriminated unions (Axis<T,V> pattern)
 * - Runtime erasure - all type info resolved at compile time
 * - Single source of truth - this is the authoritative type system
 */

import {
  type CardinalityVarId,
  type TemporalityVarId,
  type BindingVarId,
  type PerspectiveVarId,
  type BranchVarId,
  type DomainTypeId,
  type InstanceId,
  domainTypeId,
  instanceId,
} from './ids.js';

// =============================================================================
// Unit - Closed Discriminated Union (Spec §A3)
// =============================================================================

/**
 * Unit annotation for typed values.
 *
 * Every typed value has (payload, unit, extent). Unit is ALWAYS present.
 * Units are semantic, not representational: phase01 != scalar even though
 * both are float32 at runtime.
 *
 * Spec Reference: 0-Units-and-Adapters.md §A3
 */
export type UnitType =
  | { readonly kind: 'none' }         // For payloads without units (bool)
  | { readonly kind: 'scalar' }       // Dimensionless numeric
  | { readonly kind: 'norm01' }       // Clamped [0, 1]
  | { readonly kind: 'phase01' }      // Cyclic [0, 1) with wrap semantics
  | { readonly kind: 'radians' }      // Angle in radians
  | { readonly kind: 'degrees' }      // Angle in degrees
  | { readonly kind: 'deg' }          // Alias for degrees (camera spec uses 'deg')
  | { readonly kind: 'ms' }           // Milliseconds
  | { readonly kind: 'seconds' }      // Seconds
  | { readonly kind: 'count' }        // Integer count/index
  | { readonly kind: 'ndc2' }         // Normalized device coords vec2 [0,1]^2
  | { readonly kind: 'ndc3' }         // Normalized device coords vec3 [0,1]^3
  | { readonly kind: 'world2' }       // World-space vec2
  | { readonly kind: 'world3' }       // World-space vec3
  | { readonly kind: 'rgba01' };      // Float color RGBA each in [0,1]

// --- Unit Constructors ---
export function unitNone(): UnitType { return { kind: 'none' }; }
export function unitScalar(): UnitType { return { kind: 'scalar' }; }
export function unitNorm01(): UnitType { return { kind: 'norm01' }; }
export function unitPhase01(): UnitType { return { kind: 'phase01' }; }
export function unitRadians(): UnitType { return { kind: 'radians' }; }
export function unitDegrees(): UnitType { return { kind: 'degrees' }; }
export function unitDeg(): UnitType { return { kind: 'deg' }; }
export function unitMs(): UnitType { return { kind: 'ms' }; }
export function unitSeconds(): UnitType { return { kind: 'seconds' }; }
export function unitCount(): UnitType { return { kind: 'count' }; }
export function unitNdc2(): UnitType { return { kind: 'ndc2' }; }
export function unitNdc3(): UnitType { return { kind: 'ndc3' }; }
export function unitWorld2(): UnitType { return { kind: 'world2' }; }
export function unitWorld3(): UnitType { return { kind: 'world3' }; }
export function unitRgba01(): UnitType { return { kind: 'rgba01' }; }

let unitVarCounter = 0;
/**
 * REMOVED per D5: Unit variables belong in inference wrappers, not canonical types.
 * This function is no longer valid.
 * @deprecated Use InferenceUnit from analyze-type-constraints instead
 */
export function unitVar(_id?: string): never {
  throw new Error('unitVar() removed per D5 - use InferenceUnit in constraint solver instead');
}

/**
 * Compare two units for deep equality.
 */
export function unitsEqual(a: UnitType, b: UnitType): boolean {
  // Note: Unit variables removed per D5 - all units are concrete
  return a.kind === b.kind;
}

// =============================================================================
// PayloadType - What the value is made of
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
 * Note: 'phase' is NOT a payload - it's float with unit:phase01.
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
 * The kind discriminator for concrete payload types.
 * Use this for switch statements and Record keys.
 */
export type PayloadKind = ConcretePayloadType['kind'];

// --- Singleton instances for each concrete payload type ---
// Use these instead of creating new objects. They are identical by reference.

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

// --- Payload-Unit Validation (Spec §A4) ---

const ALLOWED_UNITS: Record<PayloadKind, readonly UnitType['kind'][]> = {
  float: ['scalar', 'norm01', 'phase01', 'radians', 'degrees', 'deg', 'ms', 'seconds'],
  int: ['count', 'ms'],
  vec2: ['ndc2', 'world2'],
  vec3: ['ndc3', 'world3'],
  color: ['rgba01'],
  bool: ['none'],
  cameraProjection: ['none'], // Camera projection is an enum, no unit
};

/**
 * Get a ConcretePayloadType from its kind string.
 * Used for deserialization and backwards compatibility.
 */
export function payloadFromKind(kind: PayloadKind): ConcretePayloadType {
  return PAYLOAD_BY_KIND[kind];
}

/**
 * The base data type of a value, including unresolved variables.
 *
 * PayloadType can be either:
 * - A concrete type object with kind (e.g., FLOAT, VEC2)
 * - A payload variable { kind: 'var', id: string } for polymorphic ports
 *
 * Payload variables MUST be resolved by the constraint solver before compilation.
 */
export type PayloadType =
  | ConcretePayloadType
  | { readonly kind: 'var'; readonly id: string };  // Unresolved payload variable

let payloadVarCounter = 0;
/**
 * Create an unresolved payload variable.
 * Payload variables MUST be resolved by the constraint solver before compilation.
 */
export function payloadVar(id?: string): PayloadType {
  return { kind: 'var', id: id ?? `_pv${payloadVarCounter++}` };
}

/**
 * Check if a payload is an unresolved variable.
 */
export function isPayloadVar(payload: PayloadType): payload is { kind: 'var'; id: string } {
  return typeof payload === 'object' && payload !== null && payload.kind === 'var';
}

/**
 * Check if a payload is a concrete (non-variable) type.
 */
export function isConcretePayload(payload: PayloadType): payload is ConcretePayloadType {
  // After removing stride field, check that it's not a var
  return typeof payload === 'object' && payload !== null && payload.kind !== 'var';
}

/**
 * Compare two payloads for equality.
 */
export function payloadsEqual(a: PayloadType, b: PayloadType): boolean {
  if (isPayloadVar(a) && isPayloadVar(b)) {
    return a.id === b.id;
  }
  if (isPayloadVar(a) || isPayloadVar(b)) {
    return false;  // One is var, other is concrete
  }
  // Both concrete - compare by kind
  return a.kind === b.kind;
}

/**
 * Check if a (payload, unit) combination is valid per spec §A4.
 * Note: Unit variables removed per D5. This now only checks concrete units.
 */
export function isValidPayloadUnit(payload: PayloadType, unit: UnitType): boolean {
  // Payload variables are always valid during inference (will be resolved later)
  if (isPayloadVar(payload)) return true;
  // After isPayloadVar check, payload is ConcretePayloadType
  const concretePayload = payload as ConcretePayloadType;
  const allowed = ALLOWED_UNITS[concretePayload.kind];
  if (!allowed) return false;
  return allowed.includes(unit.kind);
}

/**
 * Get the default unit for a payload type.
 * Used for ergonomic helpers where unit can be omitted.
 * Throws if given a payload variable (must resolve payload first).
 */
export function defaultUnitForPayload(payload: PayloadType): UnitType {
  if (isPayloadVar(payload)) {
    throw new Error(`Cannot get default unit for payload variable ${payload.id} - resolve payload first`);
  }
  // After isPayloadVar check, payload is ConcretePayloadType
  const concretePayload = payload as ConcretePayloadType;
  switch (concretePayload.kind) {
    case 'float': return unitScalar();
    case 'int': return unitCount();
    case 'vec2': return unitWorld2();
    case 'vec3': return unitWorld3();
    case 'color': return unitRgba01();
    case 'bool': return unitNone();
    case 'cameraProjection': return unitNone();
    default: {
      const _exhaustive: never = concretePayload;
      throw new Error(`Unknown payload kind: ${(_exhaustive as ConcretePayloadType).kind}`);
    }
  }
}

// =============================================================================
// ConstValue - Strongly-Typed Constant Values (Invariant I5)
// =============================================================================

/**
 * Strongly-typed constant value representation.
 *
 * INVARIANT I5 (15-FiveAxesTypeSystem-Conclusion.md:95-99):
 * ConstValue.kind MUST match CanonicalType.payload.kind
 *
 * Enforcement:
 * 1. Compile time: TypeScript prevents wrong value types
 * 2. Runtime: Axis enforcement validates kind matches payload
 *
 * Tuple values are readonly to prevent mutation and maintain
 * CanonicalType immutability contract.
 *
 * @see constValueMatchesPayload for validation helper
 */
export type ConstValue =
  | { readonly kind: 'float'; readonly value: number }
  | { readonly kind: 'int'; readonly value: number }
  | { readonly kind: 'bool'; readonly value: boolean }
  | { readonly kind: 'vec2'; readonly value: readonly [number, number] }
  | { readonly kind: 'vec3'; readonly value: readonly [number, number, number] }
  | { readonly kind: 'color'; readonly value: readonly [number, number, number, number] }
  | { readonly kind: 'cameraProjection'; readonly value: CameraProjection };

/**
 * Validate that ConstValue.kind matches PayloadType.kind.
 *
 * Used by axis enforcement pass to catch payload mismatches at runtime.
 *
 * @returns true if kinds match, false otherwise
 *
 * @example
 * const payload: PayloadType = { kind: 'float' };
 * const value: ConstValue = { kind: 'float', value: 42.0 };
 * constValueMatchesPayload(payload, value); // true
 *
 * const wrongValue: ConstValue = { kind: 'vec2', value: [1, 2] };
 * constValueMatchesPayload(payload, wrongValue); // false
 */
export function constValueMatchesPayload(
  payload: PayloadType,
  constValue: ConstValue
): boolean {
  return payload.kind === constValue.kind;
}

// --- Helper Constructors for ConstValue ---

/**
 * Create a float constant value.
 */
export function floatConst(value: number): ConstValue {
  return { kind: 'float', value };
}

/**
 * Create an int constant value.
 */
export function intConst(value: number): ConstValue {
  return { kind: 'int', value };
}

/**
 * Create a bool constant value.
 */
export function boolConst(value: boolean): ConstValue {
  return { kind: 'bool', value };
}

/**
 * Create a vec2 constant value.
 */
export function vec2Const(x: number, y: number): ConstValue {
  return { kind: 'vec2', value: [x, y] as const };
}

/**
 * Create a vec3 constant value.
 */
export function vec3Const(x: number, y: number, z: number): ConstValue {
  return { kind: 'vec3', value: [x, y, z] as const };
}

/**
 * Create a color constant value (RGBA).
 */
export function colorConst(r: number, g: number, b: number, a: number): ConstValue {
  return { kind: 'color', value: [r, g, b, a] as const };
}

/**
 * Create a camera projection constant value.
 * Per resolution Q8: accepts CameraProjection closed enum.
 */
export function cameraProjectionConst(value: CameraProjection): ConstValue {
  return { kind: 'cameraProjection', value };
}



/**
 * Get the stride for a given PayloadType.
 * Throws if given a payload variable (must resolve payload first).
 *
 * @param type - The payload type (must be concrete)
 * @returns Number of scalar slots required
 * @deprecated Use payloadStride() instead - this delegates to it
 */
export function strideOf(type: PayloadType): number {
  return payloadStride(type);
}

/**
 * Get payload stride (derived from payload only).
 * Per resolution Q7: This is the single authority for stride.
 * Per resolution Q4: Exhaustive switch with explicit case for every PayloadType kind.
 */
export function payloadStride(p: PayloadType): number {
  if (isPayloadVar(p)) {
    throw new Error('Cannot get stride for payload variable - resolve payload first');
  }

  // Exhaustive switch - no default fall-through
  switch (p.kind) {
    case 'float': return 1;
    case 'int': return 1;
    case 'bool': return 1;
    case 'vec2': return 2;
    case 'vec3': return 3;
    case 'color': return 4;
    case 'cameraProjection': return 1;
    default: {
      // Exhaustiveness check - if we reach here, we missed a case
      const _exhaustive: never = p;
      throw new Error(`Unknown payload kind: ${(_exhaustive as ConcretePayloadType).kind}`);
    }
  }
}

// =============================================================================
// Axis - Variable or Instantiated Pattern
// =============================================================================

/**
 * Discriminated union representing "type variable or instantiated value".
 *
 * This pattern supports polymorphic type inference (var) and resolved types (inst).
 * Enables constraint solving during type inference, then resolves to instantiated values.
 *
 * T = value type (e.g., CardinalityValue)
 * V = variable ID type (e.g., CardinalityVarId)
 */
export type Axis<T, V> =
  | { readonly kind: 'var'; readonly var: V }
  | { readonly kind: 'inst'; readonly value: T };

/**
 * Create a type variable axis.
 */
export function axisVar<T, V>(v: V): Axis<T, V> {
  return { kind: 'var', var: v };
}

/**
 * Create an instantiated axis.
 */
export function axisInst<T, V>(value: T): Axis<T, V> {
  return { kind: 'inst', value };
}

/**
 * Check if an axis is a type variable.
 */
export function isAxisVar<T, V>(a: Axis<T, V>): a is { kind: 'var'; var: V } {
  return a.kind === 'var';
}

/**
 * Check if an axis is instantiated.
 */
export function isAxisInst<T, V>(a: Axis<T, V>): a is { kind: 'inst'; value: T } {
  return a.kind === 'inst';
}

// =============================================================================
// Instance System (NEW - Domain Refactor)
// =============================================================================

/**
 * Reference to a specific instance.
 * Instances are configurations of domain types (count, layout, lifecycle).
 */
export interface InstanceRef {
  readonly instanceId: InstanceId;
  readonly domainTypeId: DomainTypeId;
}

/**
 * Create an instance reference.
 */
export function instanceRef(instanceId: InstanceId, domainTypeId: DomainTypeId): InstanceRef {
  return { instanceId, domainTypeId };
}

// =============================================================================
// Cardinality - How Many Lanes
// =============================================================================

/**
 * How many lanes/elements a value has.
 *
 * Mapping from old World:
 * - zero = was 'static' / 'config' / 'scalar' (compile-time constant)
 * - one = was 'signal' (single lane, time-varying)
 * - many(instance) = was 'field(domain)' (N lanes aligned by instance)
 */
export type CardinalityValue =
  | { readonly kind: 'zero' }                              // Compile-time constant, no runtime lanes
  | { readonly kind: 'one' }                               // Single lane
  | { readonly kind: 'many'; readonly instance: InstanceRef }; // N lanes aligned by instance

// =============================================================================
// Temporality - When
// =============================================================================

/**
 * When a value exists in time.
 *
 * - continuous: Value exists every frame/tick
 * - discrete: Event occurrences only (sparse, edge-triggered)
 */
export type TemporalityValue =
  | { readonly kind: 'continuous' }
  | { readonly kind: 'discrete' };

// =============================================================================
// Binding - Referential Anchoring
// =============================================================================

/**
 * How a value is bound to a referent.
 *
 * Note: BindingValue is a closed semantic set. Referents ("what is it bound to?")
 * belong in continuity policies / state mapping config / StateOp args, NOT in the type lattice.
 */
export type BindingValue =
  | { readonly kind: 'unbound' }
  | { readonly kind: 'weak' }
  | { readonly kind: 'strong' }
  | { readonly kind: 'identity' };

// =============================================================================
// Perspective and Branch (v0: Default-Only)
// =============================================================================

/**
 * Perspective value (v0: only default).
 */
export type PerspectiveValue =
  | { readonly kind: 'default' };

/**
 * Branch value (v0: only default).
 */
export type BranchValue =
  | { readonly kind: 'default' };

// =============================================================================
// Per-Axis Type Aliases
// =============================================================================

/**
 * Cardinality axis: type variable or instantiated cardinality value.
 */
export type CardinalityAxis = Axis<CardinalityValue, CardinalityVarId>;

/**
 * Temporality axis: type variable or instantiated temporality value.
 */
export type TemporalityAxis = Axis<TemporalityValue, TemporalityVarId>;

/**
 * Binding axis: type variable or instantiated binding value.
 */
export type BindingAxis = Axis<BindingValue, BindingVarId>;

/**
 * Perspective axis: type variable or instantiated perspective value.
 */
export type PerspectiveAxis = Axis<PerspectiveValue, PerspectiveVarId>;

/**
 * Branch axis: type variable or instantiated branch value.
 */
export type BranchAxis = Axis<BranchValue, BranchVarId>;

// =============================================================================
// Extent - 5-Axis Coordinate
// =============================================================================

/**
 * Describes where/when/about-what a value exists.
 *
 * The 5 axes are independent of PayloadType:
 * 1. Cardinality: How many lanes (zero/one/many)
 * 2. Temporality: When value exists (continuous/discrete)
 * 3. Binding: Referential anchoring (unbound/weak/strong/identity)
 * 4. Perspective: Point of view (v0: default only)
 * 5. Branch: Execution branch (v0: default only)
 */
export interface Extent {
  readonly cardinality: CardinalityAxis;
  readonly temporality: TemporalityAxis;
  readonly binding: BindingAxis;
  readonly perspective: PerspectiveAxis;
  readonly branch: BranchAxis;
}

// =============================================================================
// Default Axis Values (used by canonical constructors)
// =============================================================================

const DEFAULT_BINDING: BindingValue = { kind: 'unbound' };
const DEFAULT_PERSPECTIVE: PerspectiveValue = { kind: 'default' };
const DEFAULT_BRANCH: BranchValue = { kind: 'default' };

// =============================================================================
// CanonicalType - Complete Type Contract
// =============================================================================

/**
 * The full type description for a port or wire.
 *
 * Every value has (payload, unit, extent). Unit is mandatory.
 * Spec Reference: 0-Units-and-Adapters.md §A1
 */
export interface CanonicalType {
  readonly payload: PayloadType;
  readonly extent: Extent;
  readonly unit: UnitType;
}

// =============================================================================
// Canonical Constructors (no ambiguity)
// =============================================================================

/**
 * Create a Signal canonical type (one + continuous).
 *
 * Signal types represent single-lane time-varying values.
 * Examples: time, mouse position, camera FOV.
 */
export function canonicalSignal(payload: PayloadType, unit: UnitType = { kind: 'scalar' }): CanonicalType {
  return {
    payload,
    unit,
    extent: {
      cardinality: axisInst({ kind: 'one' }),
      temporality: axisInst({ kind: 'continuous' }),
      binding: axisInst(DEFAULT_BINDING),
      perspective: axisInst(DEFAULT_PERSPECTIVE),
      branch: axisInst(DEFAULT_BRANCH),
    },
  };
}

/**
 * Create a Field canonical type (many(instance) + continuous).
 *
 * Field types represent multi-lane spatially-indexed values.
 * Examples: particle positions, per-instance colors.
 */
export function canonicalField(payload: PayloadType, unit: UnitType, instance: InstanceRef): CanonicalType {
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
  };
}

/**
 * Create an Event canonical type with cardinality=one (one + discrete).
 *
 * Event types are HARD invariants:
 *   - payload = bool
 *   - unit = none
 *   - temporality = discrete
 *   - cardinality = one
 */
export function canonicalEventOne(): CanonicalType {
  return {
    payload: BOOL,
    unit: { kind: 'none' },
    extent: {
      cardinality: axisInst({ kind: 'one' }),
      temporality: axisInst({ kind: 'discrete' }),
      binding: axisInst(DEFAULT_BINDING),
      perspective: axisInst(DEFAULT_PERSPECTIVE),
      branch: axisInst(DEFAULT_BRANCH),
    },
  };
}

/**
 * Create an Event canonical type with cardinality=many (many(instance) + discrete).
 *
 * Event types are HARD invariants:
 *   - payload = bool
 *   - unit = none
 *   - temporality = discrete
 *   - cardinality = many(instance)
 */
export function canonicalEventField(instance: InstanceRef): CanonicalType {
  return {
    payload: BOOL,
    unit: { kind: 'none' },
    extent: {
      cardinality: axisInst({ kind: 'many', instance }),
      temporality: axisInst({ kind: 'discrete' }),
      binding: axisInst(DEFAULT_BINDING),
      perspective: axisInst(DEFAULT_PERSPECTIVE),
      branch: axisInst(DEFAULT_BRANCH),
    },
  };
}

// =============================================================================
// Derived Classification Helpers
// =============================================================================

/**
 * Derived kind classification (not a separate type system).
 *
 * Classification rules:
 * - temporality=discrete → 'event'
 * - temporality=continuous + cardinality=many → 'field'
 * - temporality=continuous + cardinality=one → 'signal'
 */
export type DerivedKind = 'signal' | 'field' | 'event';

export function deriveKind(t: CanonicalType): DerivedKind {
  const card = t.extent.cardinality;
  const tempo = t.extent.temporality;

  // Must be instantiated
  if (tempo.kind !== 'inst') {
    throw new Error('Cannot derive kind from type with uninstantiated temporality axis');
  }

  if (tempo.value.kind === 'discrete') return 'event';

  // continuous:
  if (card.kind !== 'inst') {
    throw new Error('Cannot derive kind from type with uninstantiated cardinality axis');
  }

  if (card.value.kind === 'many') return 'field';
  return 'signal';
}

/**
 * Try to derive kind from a CanonicalType.
 * Returns null if any axis is a variable (not instantiated).
 *
 * Per resolution Q3: UI/inference paths use tryDeriveKind; backend paths use strict deriveKind.
 */
export function tryDeriveKind(t: CanonicalType): DerivedKind | null {
  const card = t.extent.cardinality;
  const tempo = t.extent.temporality;

  // Return null if any axis is var
  if (tempo.kind !== 'inst') return null;
  if (card.kind !== 'inst') return null;

  // All axes instantiated - same logic as deriveKind
  if (tempo.value.kind === 'discrete') return 'event';
  if (card.value.kind === 'many') return 'field';
  return 'signal';
}

/**
 * Try to get instance reference from cardinality=many.
 * Returns null if not a many cardinality.
 */
export function tryGetManyInstance(t: CanonicalType): InstanceRef | null {
  const card = t.extent.cardinality;
  if (card.kind !== 'inst') return null;
  if (card.value.kind !== 'many') return null;
  return card.value.instance;
}

/**
 * Require instance reference from cardinality=many.
 * Throws if not a many cardinality.
 */
export function requireManyInstance(t: CanonicalType): InstanceRef {
  const inst = tryGetManyInstance(t);
  if (!inst) {
    throw new Error(`Expected field type (cardinality=many), got ${deriveKind(t)}`);
  }
  return inst;
}

/**
 * Check if type is a signal (one + continuous).
 */
export function isSignalType(t: CanonicalType): boolean {
  return deriveKind(t) === 'signal';
}

/**
 * Assert type is a signal, throw if not.
 */
export function assertSignalType(t: CanonicalType): void {
  const k = deriveKind(t);
  if (k !== 'signal') throw new Error(`Expected signal type, got ${k}`);

  const card = t.extent.cardinality;
  if (card.kind !== 'inst' || card.value.kind !== 'one') {
    throw new Error('Signal types must have cardinality=one (instantiated)');
  }
  const tempo = t.extent.temporality;
  if (tempo.kind !== 'inst' || tempo.value.kind !== 'continuous') {
    throw new Error('Signal types must have temporality=continuous (instantiated)');
  }
}

/**
 * Check if type is a field (many + continuous).
 */
export function isFieldType(t: CanonicalType): boolean {
  return deriveKind(t) === 'field';
}

/**
 * Assert type is a field, return instance ref.
 */
export function assertFieldType(t: CanonicalType): InstanceRef {
  const k = deriveKind(t);
  if (k !== 'field') throw new Error(`Expected field type, got ${k}`);

  const inst = tryGetManyInstance(t);
  if (!inst) throw new Error('Field types must have cardinality=many(instance) (instantiated)');

  const tempo = t.extent.temporality;
  if (tempo.kind !== 'inst' || tempo.value.kind !== 'continuous') {
    throw new Error('Field types must have temporality=continuous (instantiated)');
  }
  return inst;
}

/**
 * Check if type is an event (discrete).
 */
export function isEventType(t: CanonicalType): boolean {
  return deriveKind(t) === 'event';
}

/**
 * Assert type is an event.
 */
export function assertEventType(t: CanonicalType): void {
  const k = deriveKind(t);
  if (k !== 'event') throw new Error(`Expected event type, got ${k}`);

  if (t.payload.kind !== 'bool') throw new Error('Event payload must be bool');
  if (t.unit.kind !== 'none') throw new Error('Event unit must be none');

  const tempo = t.extent.temporality;
  if (tempo.kind !== 'inst' || tempo.value.kind !== 'discrete') {
    throw new Error('Event temporality must be discrete (instantiated)');
  }
}

/**
 * Create a CanonicalType with specified payload and unit.
 *
 * Overload 1: canonicalType(payload) - uses default unit for payload (only for concrete payloads)
 * Overload 2: canonicalType(payload, unit) - explicit unit (required for payload variables)
 * Overload 3: canonicalType(payload, unit, extentOverrides) - full control
 *
 * Legacy: canonicalType(payload, extentOverrides) still works during migration.
 *
 * Note: When using payloadVar(), you MUST provide an explicit unit (use unitVar for polymorphism).
 */
export function canonicalType(
  payload: PayloadType,
  unitOrExtent?: UnitType | Partial<Extent>,
  extentOverrides?: Partial<Extent>
): CanonicalType {
  let unit: UnitType;
  let extOverrides: Partial<Extent> | undefined;

  if (unitOrExtent === undefined) {
    // canonicalType(FLOAT) -> use default unit (only for concrete payloads)
    if (isPayloadVar(payload)) {
      throw new Error(`Cannot omit unit for payload variable ${payload.id} - use unitVar() for polymorphic unit`);
    }
    unit = defaultUnitForPayload(payload);
    extOverrides = undefined;
  } else if ('kind' in unitOrExtent) {
    // canonicalType(FLOAT, unitPhase01(), {...}) or canonicalType(payloadVar('x'), unitVar('y'))
    unit = unitOrExtent as UnitType;
    extOverrides = extentOverrides;
  } else {
    // Legacy: canonicalType(FLOAT, { cardinality: ... })
    if (isPayloadVar(payload)) {
      throw new Error(`Cannot omit unit for payload variable ${payload.id} - use unitVar() for polymorphic unit`);
    }
    unit = defaultUnitForPayload(payload);
    extOverrides = unitOrExtent as Partial<Extent>;
  }

  return {
    payload,
    unit,
    extent: {
      cardinality: extOverrides?.cardinality ?? axisInst({ kind: 'one' }),
      temporality: extOverrides?.temporality ?? axisInst({ kind: 'continuous' }),
      binding: extOverrides?.binding ?? axisInst(DEFAULT_BINDING),
      perspective: extOverrides?.perspective ?? axisInst(DEFAULT_PERSPECTIVE),
      branch: extOverrides?.branch ?? axisInst(DEFAULT_BRANCH),
    },
  };
}

// =============================================================================
// V0 Canonical Defaults (DEPRECATED)
// =============================================================================

/**
 * V0 canonical default values for each axis.
 *
 * Per resolution T03-C-3: perspective/branch are now PerspectiveValue/BranchValue objects.
 * @deprecated These defaults were for the old AxisTag system.
 * New code should use canonical constructors that explicitly instantiate values.
 */
export const DEFAULTS_V0 = {
  cardinality: { kind: 'one' } as CardinalityValue,
  temporality: { kind: 'continuous' } as TemporalityValue,
  binding: { kind: 'unbound' } as BindingValue,
  perspective: { kind: 'default' } as PerspectiveValue,
  branch: { kind: 'default' } as BranchValue,
} as const;

/**
 * V0 evaluation frame defaults.
 * Per resolution T03-C-3: perspective/branch are now PerspectiveValue/BranchValue objects.
 * @deprecated Use PerspectiveValue/BranchValue instead
 */
export const FRAME_V0 = {
  perspective: { kind: 'default' } as PerspectiveValue,
  branch: { kind: 'default' } as BranchValue,
} as const;

// =============================================================================
// =============================================================================
// REMOVED: ResolvedExtent (Sprints 3-6 complete)
// =============================================================================

/**
 * REMOVED: ResolvedExtent type.
 *
 * The new Axis<T,V> system makes this obsolete. All Extent objects with
 * axisInst() are already "resolved". Use Extent directly, or extract
 * values inline with axis.kind === 'inst' ? axis.value : throw.
 *
 * @deprecated REMOVED - Do not use
 */
export type ResolvedExtent = never;

/**
 * REMOVED: resolveExtent function.
 *
 * @deprecated REMOVED - Extract axis values directly instead
 */
export function resolveExtent(_extent: Extent): never {
  throw new Error('resolveExtent() removed - extract axis.value directly where axis.kind === "inst"');
}

// =============================================================================
// Axis Unification
// =============================================================================

/**
 * Error indicating axis unification failed.
 */
export class AxisUnificationError extends Error {
  constructor(
    public readonly axis: string,
    public readonly valueA: unknown,
    public readonly valueB: unknown,
  ) {
    super(`Axis unification failed for '${axis}': cannot unify ${JSON.stringify(valueA)} with ${JSON.stringify(valueB)}`);
    this.name = 'AxisUnificationError';
  }
}

/**
 * Deep equality check for axis values.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (a === null || b === null) return false;

  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
  }
  return true;
}

/**
 * Unify two axis tags according to v0 strict join rules.
 *
 * Rules:
 * - var + var → first var (constraint solver handles)
 * - var + inst(X) → inst(X)
 * - inst(X) + var → inst(X)
 * - inst(X) + inst(X) → inst(X)
 * - inst(X) + inst(Y), X≠Y → ERROR
 *
 * @param axisName - Name of axis (for error messages)
 * @param a - First axis
 * @param b - Second axis
 * @returns Unified axis
 * @throws AxisUnificationError if values don't match
 */
export function unifyAxis<T, V>(axisName: string, a: Axis<T, V>, b: Axis<T, V>): Axis<T, V> {
  if (a.kind === 'var' && b.kind === 'var') {
    return a;
  }
  if (a.kind === 'var') {
    return b;
  }
  if (b.kind === 'var') {
    return a;
  }
  // Both instantiated
  if (deepEqual(a.value, b.value)) {
    return a;
  }
  throw new AxisUnificationError(axisName, a.value, b.value);
}

/**
 * Unify two extents according to v0 strict join rules.
 *
 * All 5 axes are unified independently. Any mismatch throws.
 */
export function unifyExtent(a: Extent, b: Extent): Extent {
  return {
    cardinality: unifyAxis('cardinality', a.cardinality, b.cardinality),
    temporality: unifyAxis('temporality', a.temporality, b.temporality),
    binding: unifyAxis('binding', a.binding, b.binding),
    perspective: unifyAxis('perspective', a.perspective, b.perspective),
    branch: unifyAxis('branch', a.branch, b.branch),
  };
}

// =============================================================================
// Old World → New Axes Helpers
// =============================================================================

/**
 * Convert old "World" concept to new axes.
 *
 * Mapping:
 * - static/scalar → zero + continuous
 * - signal → one + continuous
 * - field(instanceId) → many(instance) + continuous
 * - event → one|many + discrete
 *
 * Note: instanceId parameter is just the ID string (e.g., 'circles-1').
 * Domain type is inferred as 'default' for backward compatibility.
 */
export function worldToAxes(
  world: 'static' | 'scalar' | 'signal' | 'field' | 'event',
  instanceIdStr?: string
): { cardinality: CardinalityValue; temporality: TemporalityValue } {
  switch (world) {
    case 'static':
    case 'scalar':
      return {
        cardinality: {kind: 'zero'},
        temporality: {kind: 'continuous'},
      };
    case 'signal':
      return {
        cardinality: {kind: 'one'},
        temporality: {kind: 'continuous'},
      };
    case 'field':
      if (!instanceIdStr) {
        throw new Error('field world requires domainId');
      }
      return {
        cardinality: { kind: 'many', instance: { instanceId: instanceId(instanceIdStr), domainTypeId: domainTypeId('default') } },
        temporality: {kind: 'continuous'},
      };
    case 'event':
      return {
        cardinality: instanceIdStr ? { kind: 'many', instance: { instanceId: instanceId(instanceIdStr), domainTypeId: domainTypeId('default') } } : {kind: 'one'},
        temporality: {kind: 'discrete'},
      };
  }
}

// =============================================================================
// Derived Concept Helpers
// =============================================================================

// =============================================================================
// REMOVED: Old Signal Type Constructors (Sprints 3-6 complete)
// =============================================================================

/**
 * REMOVED: signalTypeSignal, signalTypeField, signalTypeTrigger,
 * signalTypeStatic, signalTypePerLaneEvent, signalTypePolymorphic
 *
 * Use canonical constructors instead:
 * - signalTypeSignal → canonicalSignal
 * - signalTypeField → canonicalField
 * - signalTypeTrigger → canonicalEventOne
 * - signalTypeStatic → canonicalType with cardinality={kind:'zero'}
 * - signalTypePerLaneEvent → canonicalEventField
 * - signalTypePolymorphic → remove (use proper polymorphic types with vars)
 *
 * @deprecated REMOVED
 */

// =============================================================================

// =============================================================================
// Event Expression Types
// =============================================================================

/**
 * Create a CanonicalType for event expressions.
 *
 * HARD INVARIANTS (enforced at construction):
 * - payload.kind === 'bool' (events are fired/not-fired)
 * - unit.kind === 'none' (events are dimensionless)
 * - temporality === 'discrete' (events fire at instants, not continuous)
 *
 * @param cardinalityAxis - The cardinality axis (one for scalar events, many for per-instance events)
 * @returns CanonicalType satisfying all event invariants
 */
export function eventType(cardinalityAxis: CardinalityAxis): CanonicalType {
  return {
    payload: BOOL,
    unit: { kind: 'none' },
    extent: {
      cardinality: cardinalityAxis,
      temporality: axisInst({ kind: 'discrete' }),
      binding: axisInst(DEFAULT_BINDING),
      perspective: axisInst(DEFAULT_PERSPECTIVE),
      branch: axisInst(DEFAULT_BRANCH),
    },
  };
}

/**
 * Create a scalar event type (cardinality = one).
 * Use this for events that fire globally, not per-instance.
 */
export function eventTypeScalar(): CanonicalType {
  return eventType(axisInst({ kind: 'one' }));
}

/**
 * Create a per-instance event type (cardinality = many).
 * Use this for events that fire per-element.
 */
export function eventTypePerInstance(instance: InstanceRef): CanonicalType {
  return eventType(axisInst({ kind: 'many', instance }));
}

// =============================================================================
// TEMPORARY: SHAPE placeholder for migration (Q6)
// =============================================================================

/**
 * TODO: Remove after resource graph system implemented (Q6)
 * Temporary placeholder - shape is a resource, not a payload
 * @deprecated Use resource graph system instead
 */
export const SHAPE = FLOAT; // Placeholder to allow compilation
