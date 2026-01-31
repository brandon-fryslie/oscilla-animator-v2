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
 *
 * IMPORTANT: CanonicalType is final, resolved, backend-safe. It NEVER contains vars.
 * Inference types (which CAN have vars) are in inference-types.ts.
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
 * Restructured to 8 structured kinds (items #18, #19):
 * - Simple: none, scalar, norm01, count
 * - Structured: angle, time, space, color
 *
 * Spec Reference: 0-Units-and-Adapters.md §A3
 */
export type UnitType =
  | { readonly kind: 'none' }
  | { readonly kind: 'scalar' }
  | { readonly kind: 'norm01' }
  | { readonly kind: 'count' }
  | { readonly kind: 'angle'; readonly unit: 'radians' | 'degrees' | 'phase01' }
  | { readonly kind: 'time'; readonly unit: 'ms' | 'seconds' }
  | { readonly kind: 'space'; readonly unit: 'ndc' | 'world' | 'view'; readonly dims: 2 | 3 }
  | { readonly kind: 'color'; readonly unit: 'rgba01' };

// --- Unit Constructors ---

/** Unitless (bool, enums) */
export function unitNone(): UnitType {
  return { kind: 'none' };
}

/** Dimensionless numeric scalar */
export function unitScalar(): UnitType {
  return { kind: 'scalar' };
}

/** Normalized [0,1] */
export function unitNorm01(): UnitType {
  return { kind: 'norm01' };
}

/** Integer count/index */
export function unitCount(): UnitType {
  return { kind: 'count' };
}

/** Angle in phase [0,1) with wrap semantics */
export function unitPhase01(): UnitType {
  return { kind: 'angle', unit: 'phase01' };
}

/** Angle in radians */
export function unitRadians(): UnitType {
  return { kind: 'angle', unit: 'radians' };
}

/** Angle in degrees (no 'deg' - only 'degrees' per #19) */
export function unitDegrees(): UnitType {
  return { kind: 'angle', unit: 'degrees' };
}

/** Time in milliseconds */
export function unitMs(): UnitType {
  return { kind: 'time', unit: 'ms' };
}

/** Time in seconds */
export function unitSeconds(): UnitType {
  return { kind: 'time', unit: 'seconds' };
}

/** Normalized device coordinates vec2 [0,1]^2 */
export function unitNdc2(): UnitType {
  return { kind: 'space', unit: 'ndc', dims: 2 };
}

/** Normalized device coordinates vec3 [0,1]^3 */
export function unitNdc3(): UnitType {
  return { kind: 'space', unit: 'ndc', dims: 3 };
}

/** World-space vec2 */
export function unitWorld2(): UnitType {
  return { kind: 'space', unit: 'world', dims: 2 };
}

/** World-space vec3 */
export function unitWorld3(): UnitType {
  return { kind: 'space', unit: 'world', dims: 3 };
}

/** Float color RGBA each in [0,1] */
export function unitRgba01(): UnitType {
  return { kind: 'color', unit: 'rgba01' };
}

/**
 * Compare two units for deep structural equality.
 * Updated for #18 to handle nested unit and dims fields.
 */
export function unitsEqual(a: UnitType, b: UnitType): boolean {
  if (a.kind !== b.kind) return false;

  // Structural comparison for kinds with nested fields
  switch (a.kind) {
    case 'angle':
      return (b as Extract<UnitType, { kind: 'angle' }>).unit === a.unit;
    case 'time':
      return (b as Extract<UnitType, { kind: 'time' }>).unit === a.unit;
    case 'space': {
      const bSpace = b as Extract<UnitType, { kind: 'space' }>;
      return bSpace.unit === a.unit && bSpace.dims === a.dims;
    }
    case 'color':
      return (b as Extract<UnitType, { kind: 'color' }>).unit === a.unit;
    case 'none':
    case 'scalar':
    case 'norm01':
    case 'count':
      return true; // Kind match is sufficient for simple units
    default: {
      const _exhaustive: never = a;
      throw new Error(`Unknown unit kind in unitsEqual: ${(_exhaustive as UnitType).kind}`);
    }
  }
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

/**
 * Map payload kinds to allowed unit kinds.
 * Updated for #18 structured units - now lists top-level kinds only.
 * Nested unit/dims validation is done by structural comparison.
 */
const ALLOWED_UNITS: Record<PayloadKind, readonly UnitType['kind'][]> = {
  float: ['scalar', 'norm01', 'angle', 'time'],
  int: ['count', 'time'],
  vec2: ['space'],
  vec3: ['space'],
  color: ['color'],
  bool: ['none'],
  cameraProjection: ['none'],
};

/**
 * Get a ConcretePayloadType from its kind string.
 * Used for deserialization and backwards compatibility.
 */
export function payloadFromKind(kind: PayloadKind): ConcretePayloadType {
  return PAYLOAD_BY_KIND[kind];
}

/**
 * Compare two payloads for equality.
 */
export function payloadsEqual(a: PayloadType, b: PayloadType): boolean {
  // Both are concrete - compare by kind
  return a.kind === b.kind;
}

/**
 * Check if a (payload, unit) combination is valid per spec §A4.
 * Updated for #18 to check top-level unit kind only.
 */
export function isValidPayloadUnit(payload: PayloadType, unit: UnitType): boolean {
  const allowed = ALLOWED_UNITS[payload.kind];
  if (!allowed) return false;
  return allowed.includes(unit.kind);
}

/**
 * Get the default unit for a payload type.
 * Used for ergonomic helpers where unit can be omitted.
 */
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

// --- Helper Extractors for ConstValue ---

/**
 * Extract a scalar number from a ConstValue.
 * Works for float, int, bool (as 0|1), and single-component payload types.
 * Throws for vec2, vec3, color, and cameraProjection.
 *
 * Use this when you need a single numeric value from a const expression.
 */
export function constValueAsNumber(cv: ConstValue): number {
  switch (cv.kind) {
    case 'float':
    case 'int':
      return cv.value;
    case 'bool':
      return cv.value ? 1 : 0;
    case 'cameraProjection':
      // cameraProjection is an enum string, not a number
      throw new Error(`Cannot convert cameraProjection const value to number: ${cv.value}`);
    case 'vec2':
    case 'vec3':
    case 'color':
      throw new Error(`Cannot convert ${cv.kind} const value to scalar number (use component access instead)`);
    default: {
      const _exhaustive: never = cv;
      throw new Error(`Unknown ConstValue kind: ${(_exhaustive as ConstValue).kind}`);
    }
  }
}

/**
 * Extract a boolean from a ConstValue.
 * Only works for bool kind.
 * Throws for other kinds.
 */
export function constValueAsBool(cv: ConstValue): boolean {
  if (cv.kind !== 'bool') {
    throw new Error(`Expected bool ConstValue, got: ${cv.kind}`);
  }
  return cv.value;
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
      const _exhaustive: never = p as never;
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

/**
 * Extract instantiated value from axis, or throw if variable.
 */
export function requireInst<T, V>(a: Axis<T, V>, name: string): T {
  if (isAxisInst(a)) return a.value;
  throw new Error(`Expected instantiated ${name}, got var: ${JSON.stringify(a)}`);
}

// =============================================================================
// Extent Axes - Where/When/About-What (Spec §2)
// =============================================================================

/**
 * Cardinality: How many instances exist?
 */
export type CardinalityValue =
  | { readonly kind: 'zero' }
  | { readonly kind: 'one' }
  | { readonly kind: 'many'; readonly instance: InstanceRef };

export type Cardinality = Axis<CardinalityValue, CardinalityVarId>;


export function cardinalityZero(): Cardinality {
  return axisInst({ kind: 'zero' });
}

export function cardinalityOne(): Cardinality {
  return axisInst({ kind: 'one' });
}

export function cardinalityMany(instance: InstanceRef): Cardinality {
  return axisInst({ kind: 'many', instance });
}

export function requireManyInstance(type: CanonicalType): InstanceRef {
  const card = requireInst(type.extent.cardinality, 'cardinality');
  if (card.kind !== 'many') {
    throw new Error(`Expected many cardinality, got: ${card.kind}`);
  }
  return card.instance;
}

/**
 * Temporality: Does it vary over time?
 */
export type TemporalityValue =
  | { readonly kind: 'continuous' }
  | { readonly kind: 'discrete' };

export type Temporality = Axis<TemporalityValue, TemporalityVarId>;

export function temporalityContinuous(): Temporality {
  return axisInst({ kind: 'continuous' });
}

export function temporalityDiscrete(): Temporality {
  return axisInst({ kind: 'discrete' });
}

/**
 * Binding: What instance does this value belong to?
 */
export type BindingValue =
  | { readonly kind: 'unbound' }
  | { readonly kind: 'weak' }
  | { readonly kind: 'strong' }
  | { readonly kind: 'identity' };

export type Binding = Axis<BindingValue, BindingVarId>;

export const DEFAULT_BINDING: BindingValue = { kind: 'unbound' };


export function bindingUnbound(): Binding {
  return axisInst({ kind: 'unbound' });
}

export function bindingWeak(): Binding {
  return axisInst({ kind: 'weak' });
}

export function bindingStrong(): Binding {
  return axisInst({ kind: 'strong' });
}

export function bindingIdentity(): Binding {
  return axisInst({ kind: 'identity' });
}


/**
 * Perspective: From whose point of view?
 */
export type PerspectiveValue =
  | { readonly kind: 'default' }
  | { readonly kind: 'specific'; readonly instance: InstanceRef };

export type Perspective = Axis<PerspectiveValue, PerspectiveVarId>;

export const DEFAULT_PERSPECTIVE: PerspectiveValue = { kind: 'default' };

/**
 * Branch: Which parallel universe?
 */
export type BranchValue =
  | { readonly kind: 'default' }
  | { readonly kind: 'specific'; readonly instance: InstanceRef };

export type Branch = Axis<BranchValue, BranchVarId>;

export const DEFAULT_BRANCH: BranchValue = { kind: 'default' };

/**
 * Extent: Complete 5-axis where/when/about-what specification.
 */
export interface Extent {
  readonly cardinality: Cardinality;
  readonly temporality: Temporality;
  readonly binding: Binding;
  readonly perspective: Perspective;
  readonly branch: Branch;
}

// =============================================================================
// CanonicalType - Complete Type Contract
// =============================================================================

/**
 * Complete type for a value: what it is (payload), what it measures (unit),
 * and where/when/about-what it exists (extent).
 *
 * This is the FINAL, RESOLVED type. It NEVER contains vars.
 * For inference types (which CAN have vars), see InferenceCanonicalType in inference-types.ts.
 */
export interface CanonicalType {
  readonly payload: PayloadType;
  readonly unit: UnitType;
  readonly extent: Extent;
}

/**
 * Create a CanonicalType with explicit payload, unit, and optional extent overrides.
 */
export function canonicalType(
  payload: PayloadType,
  unit?: UnitType,
  extentOverrides?: Partial<Extent>
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
  };
}

/**
 * Create a signal type (one + continuous).
 */
export function canonicalSignal(payload: PayloadType, unit?: UnitType): CanonicalType {
  return canonicalType(payload, unit, {
    cardinality: cardinalityOne(),
    temporality: temporalityContinuous(),
  });
}

/**
 * Create a field type (many + continuous).
 */
export function canonicalField(
  payload: PayloadType,
  unit: UnitType | undefined,
  instance: InstanceRef
): CanonicalType {
  return canonicalType(payload, unit, {
    cardinality: cardinalityMany(instance),
    temporality: temporalityContinuous(),
  });
}

/**
 * Create an event type (discrete + bool + none).
 */
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
export function canonicalConst(payload: PayloadType, unit?: UnitType): CanonicalType {
  return canonicalType(payload, unit, {
    cardinality: cardinalityZero(),
    temporality: temporalityContinuous(),
  });
}

// =============================================================================
// Derived Kind - Computed from Extent (Spec §3)
// =============================================================================

/**
 * The three derived runtime kinds: signal, field, event.
 * Per spec, these are NOT stored but derived from extent axes.
 *
 * DEPRECATED: Slated for removal when ValueExpr unification lands.
 * Consumers should dispatch on CanonicalType directly instead of this
 * lossy projection. Zero-cardinality (const) maps to 'signal' here,
 * but check `type.extent.cardinality` directly if you need to distinguish.
 */
export type DerivedKind = 'signal' | 'field' | 'event';

/**
 * Derive runtime kind from extent axes.
 * Throws if any axis is var (must resolve first).
 *
 * DEPRECATED: Dispatch on CanonicalType directly. This function loses
 * information (zero-cardinality constants map to 'signal').
 *
 * Rules:
 * - discrete → event
 * - many + continuous → field
 * - zero/one + continuous → signal
 */
export function deriveKind(type: CanonicalType): DerivedKind {
  const card = requireInst(type.extent.cardinality, 'cardinality');
  const tempo = requireInst(type.extent.temporality, 'temporality');

  if (tempo.kind === 'discrete') return 'event';
  if (card.kind === 'many') return 'field';
  return 'signal';
}

/**
 * Try to derive kind from extent axes.
 * Returns null if any axis is var (instead of throwing).
 *
 * Use this in contexts where vars are allowed (e.g., UI, inference).
 */
export function tryDeriveKind(type: CanonicalType): DerivedKind | null {
  const card = type.extent.cardinality;
  const tempo = type.extent.temporality;

  if (!isAxisInst(card) || !isAxisInst(tempo)) return null;

  if (tempo.value.kind === 'discrete') return 'event';
  if (card.value.kind === 'many') return 'field';
  return 'signal';
}

// =============================================================================
// Type Assertion Helpers (Required by spec)
// =============================================================================


/**
 * Require that a type is a signal type.
 * Throws if not signal.
 */
export function requireSignalType(t: CanonicalType): void {
  const kind = deriveKind(t);
  if (kind !== 'signal') {
    throw new Error(`Expected signal type, got: ${kind}`);
  }
}

/**
 * Require that a type is a field type.
 * Throws if not field, returns InstanceRef if valid.
 */
export function requireFieldType(t: CanonicalType): InstanceRef {
  const kind = deriveKind(t);
  if (kind !== 'field') {
    throw new Error(`Expected field type, got: ${kind}`);
  }
  return requireManyInstance(t);
}

/**
 * Require that a type is an event type.
 * Throws if not event.
 */
export function requireEventType(t: CanonicalType): void {
  const kind = deriveKind(t);
  if (kind !== 'event') {
    throw new Error(`Expected event type, got: ${kind}`);
  }
}

/**
 * Check if a type is a signal type (boolean check).
 */
export function isSignalType(t: CanonicalType): boolean {
  const kind = tryDeriveKind(t);
  return kind === 'signal';
}

/**
 * Check if a type is a field type (boolean check).
 */
export function isFieldType(t: CanonicalType): boolean {
  const kind = tryDeriveKind(t);
  return kind === 'field';
}

/**
 * Check if a type is an event type (boolean check).
 */
export function isEventType(t: CanonicalType): boolean {
  const kind = tryDeriveKind(t);
  return kind === 'event';
}

// =============================================================================
// Instance References - Domain System (Spec §4)
// =============================================================================

/**
 * Reference to a specific instance declaration.
 * Identifies which domain and which declared instance.
 */
export interface InstanceRef {
  readonly domainTypeId: DomainTypeId;
  readonly instanceId: InstanceId;
}

export function instanceRef(domainType: string, instanceIdStr: string): InstanceRef {
  return {
    domainTypeId: domainTypeId(domainType),
    instanceId: instanceId(instanceIdStr),
  };
}

// =============================================================================
// Type Equality and Comparison
// =============================================================================

/**
 * Check if two CardinalityValue objects are equal.
 */
export function cardinalitiesEqual(a: CardinalityValue, b: CardinalityValue): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'zero' || a.kind === 'one') return true;
  // Both are 'many'
  const aMany = a as Extract<CardinalityValue, { kind: 'many' }>;
  const bMany = b as Extract<CardinalityValue, { kind: 'many' }>;
  return (
    aMany.instance.domainTypeId === bMany.instance.domainTypeId &&
    aMany.instance.instanceId === bMany.instance.instanceId
  );
}

/**
 * Check if two TemporalityValue objects are equal.
 */
export function temporalitiesEqual(a: TemporalityValue, b: TemporalityValue): boolean {
  return a.kind === b.kind;
}

/**
 * Check if two BindingValue objects are equal.
 */
export function bindingsEqual(a: BindingValue, b: BindingValue): boolean {
  return a.kind === b.kind;
}

/**
 * Check if two PerspectiveValue objects are equal.
 */
export function perspectivesEqual(a: PerspectiveValue, b: PerspectiveValue): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'default') return true;
  const aSpec = a as Extract<PerspectiveValue, { kind: 'specific' }>;
  const bSpec = b as Extract<PerspectiveValue, { kind: 'specific' }>;
  return (
    aSpec.instance.domainTypeId === bSpec.instance.domainTypeId &&
    aSpec.instance.instanceId === bSpec.instance.instanceId
  );
}

/**
 * Check if two BranchValue objects are equal.
 */
export function branchesEqual(a: BranchValue, b: BranchValue): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'default') return true;
  const aSpec = a as Extract<BranchValue, { kind: 'specific' }>;
  const bSpec = b as Extract<BranchValue, { kind: 'specific' }>;
  return (
    aSpec.instance.domainTypeId === bSpec.instance.domainTypeId &&
    aSpec.instance.instanceId === bSpec.instance.instanceId
  );
}

/**
 * Check if two Extent objects are equal (all 5 axes must match).
 * Does NOT support vars - both must be fully instantiated.
 */
export function extentsEqual(a: Extent, b: Extent): boolean {
  const aCard = requireInst(a.cardinality, 'cardinality');
  const bCard = requireInst(b.cardinality, 'cardinality');
  if (!cardinalitiesEqual(aCard, bCard)) return false;

  const aTempo = requireInst(a.temporality, 'temporality');
  const bTempo = requireInst(b.temporality, 'temporality');
  if (!temporalitiesEqual(aTempo, bTempo)) return false;

  const aBind = requireInst(a.binding, 'binding');
  const bBind = requireInst(b.binding, 'binding');
  if (!bindingsEqual(aBind, bBind)) return false;

  const aPersp = requireInst(a.perspective, 'perspective');
  const bPersp = requireInst(b.perspective, 'perspective');
  if (!perspectivesEqual(aPersp, bPersp)) return false;

  const aBranch = requireInst(a.branch, 'branch');
  const bBranch = requireInst(b.branch, 'branch');
  if (!branchesEqual(aBranch, bBranch)) return false;

  return true;
}

/**
 * Check if two CanonicalType objects are equal (deep structural equality).
 * Does NOT support vars - both must be fully instantiated.
 */
export function typesEqual(a: CanonicalType, b: CanonicalType): boolean {
  return (
    payloadsEqual(a.payload, b.payload) &&
    unitsEqual(a.unit, b.unit) &&
    extentsEqual(a.extent, b.extent)
  );
}

// =============================================================================
// Default Extent Pattern (v0 compatibility)
// =============================================================================

/**
 * Default extent for v0 compatibility.
 * All axes instantiated to defaults: one, continuous, default binding/perspective/branch.
 */
export const DEFAULTS_V0: Extent = {
  cardinality: axisInst({ kind: 'one' }),
  temporality: axisInst({ kind: 'continuous' }),
  binding: axisInst({ kind: 'unbound' }),
  perspective: axisInst({ kind: 'default' }),
  branch: axisInst({ kind: 'default' }),
};

// =============================================================================
// Legacy/Deprecated Exports - For Migration Only
// =============================================================================

/**
 * Placeholder for shape migration (Q6).
 * Shape payloads removed; shapes will be modeled as resources.
 * Use FLOAT for now where shape was previously used.
 */
export const SHAPE = FLOAT;
