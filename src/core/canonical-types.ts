/**
 * Canonical Type System for Oscilla v2.5
 *
 * This module implements the 5-axis type system as specified in:
 * design-docs/spec/CANONICAL-ARCHITECTURE-oscilla-v2.5-20260109-160000.md
 *
 * The type system separates concerns into:
 * - PayloadType: What the value is made of (float, vec2, color, etc.)
 * - Extent: Where/when/about-what a value exists (5 independent axes)
 * - SignalType: Complete type contract (payload + extent + unit)
 * - NumericUnit: Optional unit annotation for numeric types (phase, radians, etc.)
 *
 * Key design principles:
 * - No optional fields - use discriminated unions (AxisTag pattern)
 * - Runtime erasure - all type info resolved at compile time
 * - Single source of truth - this is the authoritative type system
 */

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
export type Unit =
  | { readonly kind: 'none' }         // For payloads without units (bool, shape)
  | { readonly kind: 'scalar' }       // Dimensionless numeric
  | { readonly kind: 'norm01' }       // Clamped [0, 1]
  | { readonly kind: 'phase01' }      // Cyclic [0, 1) with wrap semantics
  | { readonly kind: 'radians' }      // Angle in radians
  | { readonly kind: 'degrees' }      // Angle in degrees
  | { readonly kind: 'ms' }           // Milliseconds
  | { readonly kind: 'seconds' }      // Seconds
  | { readonly kind: 'count' }        // Integer count/index
  | { readonly kind: 'ndc2' }         // Normalized device coords vec2 [0,1]^2
  | { readonly kind: 'ndc3' }         // Normalized device coords vec3 [0,1]^3
  | { readonly kind: 'world2' }       // World-space vec2
  | { readonly kind: 'world3' }       // World-space vec3
  | { readonly kind: 'rgba01' };      // Float color RGBA each in [0,1]

// --- Unit Constructors ---
export function unitNone(): Unit { return { kind: 'none' }; }
export function unitScalar(): Unit { return { kind: 'scalar' }; }
export function unitNorm01(): Unit { return { kind: 'norm01' }; }
export function unitPhase01(): Unit { return { kind: 'phase01' }; }
export function unitRadians(): Unit { return { kind: 'radians' }; }
export function unitDegrees(): Unit { return { kind: 'degrees' }; }
export function unitMs(): Unit { return { kind: 'ms' }; }
export function unitSeconds(): Unit { return { kind: 'seconds' }; }
export function unitCount(): Unit { return { kind: 'count' }; }
export function unitNdc2(): Unit { return { kind: 'ndc2' }; }
export function unitNdc3(): Unit { return { kind: 'ndc3' }; }
export function unitWorld2(): Unit { return { kind: 'world2' }; }
export function unitWorld3(): Unit { return { kind: 'world3' }; }
export function unitRgba01(): Unit { return { kind: 'rgba01' }; }

/**
 * Compare two units for deep equality.
 */
export function unitsEqual(a: Unit, b: Unit): boolean {
  return a.kind === b.kind;
}

// --- Payload-Unit Validation (Spec §A4) ---

const ALLOWED_UNITS: Record<PayloadType, readonly Unit['kind'][]> = {
  float: ['scalar', 'norm01', 'phase01', 'radians', 'degrees', 'ms', 'seconds'],
  int: ['count', 'ms'],
  vec2: ['ndc2', 'world2'],
  color: ['rgba01'],
  bool: ['none'],
  shape: ['none'],
};

/**
 * Check if a (payload, unit) combination is valid per spec §A4.
 */
export function isValidPayloadUnit(payload: PayloadType, unit: Unit): boolean {
  const allowed = ALLOWED_UNITS[payload];
  if (!allowed) return false;
  return allowed.includes(unit.kind);
}

/**
 * Get the default unit for a payload type.
 * Used for ergonomic helpers where unit can be omitted.
 */
export function defaultUnitForPayload(payload: PayloadType): Unit {
  switch (payload) {
    case 'float': return unitScalar();
    case 'int': return unitCount();
    case 'vec2': return unitWorld2();
    case 'color': return unitRgba01();
    case 'bool': return unitNone();
    case 'shape': return unitNone();
  }
}

// --- Legacy Compat (deprecated, will be removed) ---
/** @deprecated Use Unit type instead */
export type NumericUnit = Unit['kind'];

// =============================================================================
// PayloadType - What the value is made of
// =============================================================================

/**
 * The base data type of a value.
 *
 * Note: 'phase' is NOT a payload - it's float with unit:phase01.
 * Note: 'event' and 'domain' are NOT PayloadTypes - they are axis/resource concepts.
 */
export type PayloadType =
  | 'float'   // Floating-point values
  | 'int'     // Integer values
  | 'vec2'    // 2D positions/vectors
  | 'color'   // Color values (RGBA)
  | 'bool'    // Boolean values
  | 'shape';  // Shape descriptor (ellipse, rect, path)

// =============================================================================
// AxisTag - No Optional Fields Pattern
// =============================================================================

/**
 * Discriminated union representing "default unless instantiated".
 *
 * This pattern replaces optional fields with explicit union branches,
 * enabling TypeScript type narrowing and ensuring no implicit nulls.
 */
export type AxisTag<T> =
  | { readonly kind: 'default' }
  | { readonly kind: 'instantiated'; readonly value: T };

/**
 * Create a default axis tag.
 */
export function axisDefault<T>(): AxisTag<T> {
  return { kind: 'default' };
}

/**
 * Create an instantiated axis tag.
 */
export function axisInstantiated<T>(value: T): AxisTag<T> {
  return { kind: 'instantiated', value };
}

/**
 * Check if an axis tag is instantiated.
 */
export function isInstantiated<T>(tag: AxisTag<T>): tag is { kind: 'instantiated'; value: T } {
  return tag.kind === 'instantiated';
}

/**
 * Get the value from an axis tag, or return the default if not instantiated.
 */
export function getAxisValue<T>(tag: AxisTag<T>, defaultValue: T): T {
  return tag.kind === 'instantiated' ? tag.value : defaultValue;
}

// =============================================================================
// Instance System (NEW - Domain Refactor)
// =============================================================================

/**
 * Re-export domain registry types.
 * These define the domain TYPE system (shape, circle, control, event).
 */
export type { DomainTypeId, InstanceId, IntrinsicSpec, DomainType } from './domain-registry';
export {
  domainTypeId,
  instanceId,
  DOMAIN_SHAPE,
  DOMAIN_CIRCLE,
  DOMAIN_RECTANGLE,
  DOMAIN_CONTROL,
  DOMAIN_EVENT,
  getDomainType,
  isSubdomainOf,
  getIntrinsics,
  hasIntrinsic,
} from './domain-registry';

/**
 * Reference to a specific instance.
 * Instances are configurations of domain types (count, layout, lifecycle).
 */
export interface InstanceRef {
  readonly kind: 'instance';
  readonly domainType: string; // DomainTypeId
  readonly instanceId: string; // InstanceId
}

/**
 * Create an instance reference.
 */
export function instanceRef(domainType: string, instanceId: string): InstanceRef {
  return { kind: 'instance', domainType, instanceId };
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
export type Cardinality =
  | { readonly kind: 'zero' }                              // Compile-time constant, no runtime lanes
  | { readonly kind: 'one' }                               // Single lane
  | { readonly kind: 'many'; readonly instance: InstanceRef }; // N lanes aligned by instance

/**
 * Create a zero cardinality (compile-time constant).
 */
export function cardinalityZero(): Cardinality {
  return { kind: 'zero' };
}

/**
 * Create a one cardinality (single lane).
 */
export function cardinalityOne(): Cardinality {
  return { kind: 'one' };
}

/**
 * Create a many cardinality (N lanes aligned by instance).
 */
export function cardinalityMany(instance: InstanceRef): Cardinality {
  return { kind: 'many', instance };
}

// =============================================================================
// Temporality - When
// =============================================================================

/**
 * When a value exists in time.
 *
 * - continuous: Value exists every frame/tick
 * - discrete: Event occurrences only (sparse, edge-triggered)
 */
export type Temporality =
  | { readonly kind: 'continuous' }
  | { readonly kind: 'discrete' };

/**
 * Create a continuous temporality.
 */
export function temporalityContinuous(): Temporality {
  return { kind: 'continuous' };
}

/**
 * Create a discrete temporality (events).
 */
export function temporalityDiscrete(): Temporality {
  return { kind: 'discrete' };
}

// =============================================================================
// Referent References
// =============================================================================

/**
 * Stable identifier for a referent (binding target).
 */
export type ReferentId = string;

/**
 * Reference to a referent by ID.
 */
export interface ReferentRef {
  readonly kind: 'referent';
  readonly id: ReferentId;
}

/**
 * Create a referent reference.
 */
export function referentRef(id: ReferentId): ReferentRef {
  return { kind: 'referent', id };
}

// =============================================================================
// Binding - Referential Anchoring (v0: Default-Only)
// =============================================================================

/**
 * How a value is bound to a referent.
 *
 * Note: Binding is independent of Domain. Same domain can host
 * unbound image vs bound mask.
 */
export type Binding =
  | { readonly kind: 'unbound' }
  | { readonly kind: 'weak'; readonly referent: ReferentRef }
  | { readonly kind: 'strong'; readonly referent: ReferentRef }
  | { readonly kind: 'identity'; readonly referent: ReferentRef };

/**
 * Create an unbound binding.
 */
export function bindingUnbound(): Binding {
  return { kind: 'unbound' };
}

/**
 * Create a weak binding.
 */
export function bindingWeak(referent: ReferentRef): Binding {
  return { kind: 'weak', referent };
}

/**
 * Create a strong binding.
 */
export function bindingStrong(referent: ReferentRef): Binding {
  return { kind: 'strong', referent };
}

/**
 * Create an identity binding.
 */
export function bindingIdentity(referent: ReferentRef): Binding {
  return { kind: 'identity', referent };
}

// =============================================================================
// Perspective and Branch (v0: Default-Only)
// =============================================================================

/**
 * Perspective identifier.
 */
export type PerspectiveId = string;

/**
 * Branch identifier.
 */
export type BranchId = string;

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
 * 4. Perspective: Point of view (v0: global only)
 * 5. Branch: Execution branch (v0: main only)
 */
export interface Extent {
  readonly cardinality: AxisTag<Cardinality>;
  readonly temporality: AxisTag<Temporality>;
  readonly binding: AxisTag<Binding>;
  readonly perspective: AxisTag<PerspectiveId>;
  readonly branch: AxisTag<BranchId>;
}

/**
 * Create an extent with all default axes.
 */
export function extentDefault(): Extent {
  return {
    cardinality: axisDefault(),
    temporality: axisDefault(),
    binding: axisDefault(),
    perspective: axisDefault(),
    branch: axisDefault(),
  };
}

/**
 * Create an extent with specified axes (rest default).
 */
export function extent(overrides: Partial<Extent>): Extent {
  return {
    cardinality: overrides.cardinality ?? axisDefault(),
    temporality: overrides.temporality ?? axisDefault(),
    binding: overrides.binding ?? axisDefault(),
    perspective: overrides.perspective ?? axisDefault(),
    branch: overrides.branch ?? axisDefault(),
  };
}

// =============================================================================
// SignalType - Complete Type Contract
// =============================================================================

/**
 * The full type description for a port or wire.
 *
 * Every value has (payload, unit, extent). Unit is mandatory.
 * Spec Reference: 0-Units-and-Adapters.md §A1
 */
export interface SignalType {
  readonly payload: PayloadType;
  readonly extent: Extent;
  readonly unit: Unit;
}

/**
 * Create a SignalType with specified payload and unit.
 *
 * Overload 1: signalType(payload) - uses default unit for payload
 * Overload 2: signalType(payload, unit) - explicit unit
 * Overload 3: signalType(payload, unit, extentOverrides) - full control
 *
 * Legacy: signalType(payload, extentOverrides) still works during migration.
 */
export function signalType(
  payload: PayloadType,
  unitOrExtent?: Unit | Partial<Extent>,
  extentOverrides?: Partial<Extent>
): SignalType {
  let unit: Unit;
  let extOverrides: Partial<Extent> | undefined;

  if (unitOrExtent === undefined) {
    // signalType('float') -> use default unit
    unit = defaultUnitForPayload(payload);
    extOverrides = undefined;
  } else if ('kind' in unitOrExtent) {
    // signalType('float', unitPhase01(), {...})
    unit = unitOrExtent as Unit;
    extOverrides = extentOverrides;
  } else {
    // Legacy: signalType('float', { cardinality: ... })
    unit = defaultUnitForPayload(payload);
    extOverrides = unitOrExtent as Partial<Extent>;
  }

  return {
    payload,
    unit,
    extent: extOverrides ? extent(extOverrides) : extentDefault(),
  };
}

// =============================================================================
// V0 Canonical Defaults
// =============================================================================

/**
 * V0 canonical default values for each axis.
 *
 * These are used when resolving AxisTag.default during compilation.
 */
export const DEFAULTS_V0 = {
  cardinality: cardinalityOne(),
  temporality: temporalityContinuous(),
  binding: bindingUnbound(),
  perspective: 'global' as PerspectiveId,
  branch: 'main' as BranchId,
} as const;

/**
 * V0 evaluation frame defaults.
 */
export const FRAME_V0 = {
  perspective: 'global' as PerspectiveId,
  branch: 'main' as BranchId,
} as const;

// =============================================================================
// ResolvedExtent - IR-Ready Form
// =============================================================================

/**
 * ResolvedExtent - All axes instantiated (no defaults).
 *
 * This is the "IR-ready" form of Extent. After default resolution,
 * all AxisTags are guaranteed to be instantiated with concrete values.
 *
 * Used by: IR TypeDesc, debugging, serialization
 */
export interface ResolvedExtent {
  readonly cardinality: Cardinality;
  readonly temporality: Temporality;
  readonly binding: Binding;
  readonly perspective: PerspectiveId;
  readonly branch: BranchId;
}

/**
 * Resolve an Extent to ResolvedExtent using v0 defaults.
 */
export function resolveExtent(extent: Extent): ResolvedExtent {
  return {
    cardinality: getAxisValue(extent.cardinality, DEFAULTS_V0.cardinality),
    temporality: getAxisValue(extent.temporality, DEFAULTS_V0.temporality),
    binding: getAxisValue(extent.binding, DEFAULTS_V0.binding),
    perspective: getAxisValue(extent.perspective, DEFAULTS_V0.perspective),
    branch: getAxisValue(extent.branch, DEFAULTS_V0.branch),
  };
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
 * - default + default → default
 * - default + instantiated(X) → instantiated(X)
 * - instantiated(X) + default → instantiated(X)
 * - instantiated(X) + instantiated(X) → instantiated(X)
 * - instantiated(X) + instantiated(Y), X≠Y → ERROR
 *
 * @param axisName - Name of axis (for error messages)
 * @param a - First axis tag
 * @param b - Second axis tag
 * @returns Unified axis tag
 * @throws AxisUnificationError if values don't match
 */
export function unifyAxis<T>(axisName: string, a: AxisTag<T>, b: AxisTag<T>): AxisTag<T> {
  if (a.kind === 'default' && b.kind === 'default') {
    return { kind: 'default' };
  }
  if (a.kind === 'default') {
    return b;
  }
  if (b.kind === 'default') {
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
): { cardinality: Cardinality; temporality: Temporality } {
  switch (world) {
    case 'static':
    case 'scalar':
      return {
        cardinality: cardinalityZero(),
        temporality: temporalityContinuous(),
      };
    case 'signal':
      return {
        cardinality: cardinalityOne(),
        temporality: temporalityContinuous(),
      };
    case 'field':
      if (!instanceIdStr) {
        throw new Error('field world requires domainId');
      }
      return {
        cardinality: cardinalityMany(instanceRef('default', instanceIdStr)),
        temporality: temporalityContinuous(),
      };
    case 'event':
      return {
        cardinality: instanceIdStr ? cardinalityMany(instanceRef('default', instanceIdStr)) : cardinalityOne(),
        temporality: temporalityDiscrete(),
      };
  }
}

// =============================================================================
// Derived Concept Helpers
// =============================================================================

/**
 * Create a Signal SignalType (one + continuous).
 */
export function signalTypeSignal(payload: PayloadType, unit?: Unit): SignalType {
  const u = unit ?? defaultUnitForPayload(payload);
  return signalType(payload, u, {
    cardinality: axisInstantiated(cardinalityOne()),
    temporality: axisInstantiated(temporalityContinuous()),
  });
}

/**
 * Create a Field SignalType (many(instance) + continuous).
 *
 * Accepts either an InstanceRef or a plain instanceId string (uses 'default' domain type).
 */
export function signalTypeField(payload: PayloadType, instance: InstanceRef | string, unit?: Unit): SignalType {
  const instanceRefValue = typeof instance === 'string'
    ? instanceRef('default', instance)
    : instance;
  const u = unit ?? defaultUnitForPayload(payload);

  return signalType(payload, u, {
    cardinality: axisInstantiated(cardinalityMany(instanceRefValue)),
    temporality: axisInstantiated(temporalityContinuous()),
  });
}

/**
 * Create a Trigger SignalType (one + discrete).
 */
export function signalTypeTrigger(payload: PayloadType, unit?: Unit): SignalType {
  const u = unit ?? defaultUnitForPayload(payload);
  return signalType(payload, u, {
    cardinality: axisInstantiated(cardinalityOne()),
    temporality: axisInstantiated(temporalityDiscrete()),
  });
}

/**
 * Create a Static/Scalar SignalType (zero + continuous).
 */
export function signalTypeStatic(payload: PayloadType, unit?: Unit): SignalType {
  const u = unit ?? defaultUnitForPayload(payload);
  return signalType(payload, u, {
    cardinality: axisInstantiated(cardinalityZero()),
    temporality: axisInstantiated(temporalityContinuous()),
  });
}

/**
 * Create a per-lane Event SignalType (many(instance) + discrete).
 *
 * Accepts either an InstanceRef or a plain instanceId string (uses 'default' domain type).
 */
export function signalTypePerLaneEvent(payload: PayloadType, instance: InstanceRef | string, unit?: Unit): SignalType {
  const instanceRefValue = typeof instance === 'string'
    ? instanceRef('default', instance)
    : instance;
  const u = unit ?? defaultUnitForPayload(payload);

  return signalType(payload, u, {
    cardinality: axisInstantiated(cardinalityMany(instanceRefValue)),
    temporality: axisInstantiated(temporalityDiscrete()),
  });
}
