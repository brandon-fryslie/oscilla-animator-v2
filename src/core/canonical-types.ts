/**
 * Canonical Type System for Oscilla v2.5
 *
 * This module implements the 5-axis type system as specified in:
 * design-docs/spec/CANONICAL-ARCHITECTURE-oscilla-v2.5-20260109-160000.md
 *
 * The type system separates concerns into:
 * - PayloadType: What the value is made of (float, vec2, color, etc.)
 * - Extent: Where/when/about-what a value exists (5 independent axes)
 * - SignalType: Complete type contract (payload + extent)
 *
 * Key design principles:
 * - No optional fields - use discriminated unions (AxisTag pattern)
 * - Runtime erasure - all type info resolved at compile time
 * - Single source of truth - this is the authoritative type system
 */

// =============================================================================
// PayloadType - What the value is made of
// =============================================================================

/**
 * The base data type of a value.
 *
 * Note: 'event' and 'domain' are NOT PayloadTypes - they are axis/resource concepts.
 */
export type PayloadType =
  | 'float'   // Floating-point values
  | 'int'     // Integer values
  | 'vec2'    // 2D positions/vectors
  | 'color'   // Color values (RGBA)
  | 'phase'   // Phase values [0, 1) with wrap semantics
  | 'bool'    // Boolean values
  | 'unit';   // Unit interval [0, 1]

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
// Domain References
// =============================================================================

/**
 * Stable identifier for a domain declaration.
 */
export type DomainId = string;

/**
 * Reference to a domain by ID.
 */
export interface DomainRef {
  readonly kind: 'domain';
  readonly id: DomainId;
}

/**
 * Create a domain reference.
 */
export function domainRef(id: DomainId): DomainRef {
  return { kind: 'domain', id };
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
 * - many(domain) = was 'field(domain)' (N lanes aligned by domain)
 */
export type Cardinality =
  | { readonly kind: 'zero' }                           // Compile-time constant, no runtime lanes
  | { readonly kind: 'one' }                            // Single lane
  | { readonly kind: 'many'; readonly domain: DomainRef }; // N lanes aligned by domain

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
 * Create a many cardinality (N lanes aligned by domain).
 */
export function cardinalityMany(domain: DomainRef): Cardinality {
  return { kind: 'many', domain };
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
 * Replaces the old TypeDesc with a cleaner separation of concerns.
 */
export interface SignalType {
  readonly payload: PayloadType;
  readonly extent: Extent;
}

/**
 * Create a SignalType with specified payload and extent.
 */
export function signalType(payload: PayloadType, extentOverrides?: Partial<Extent>): SignalType {
  return {
    payload,
    extent: extentOverrides ? extent(extentOverrides) : extentDefault(),
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
// Domain Declarations
// =============================================================================

/**
 * Shape specification for a domain.
 */
export type DomainShape =
  | { readonly kind: 'fixed_count'; readonly count: number }
  | { readonly kind: 'grid_2d'; readonly width: number; readonly height: number }
  | { readonly kind: 'voices'; readonly maxVoices: number }
  | { readonly kind: 'mesh_vertices'; readonly assetId: string };

/**
 * Domain declaration - compile-time resource defining element topology.
 *
 * Domain is NOT a wire value. It's a compile-time declared stable index set.
 * At runtime, domains are erased to loop bounds + layout constants.
 */
export interface DomainDecl {
  readonly kind: 'domain_decl';
  readonly id: DomainId;
  readonly shape: DomainShape;
}

/**
 * Create a fixed-count domain declaration.
 */
export function domainDeclFixedCount(id: DomainId, count: number): DomainDecl {
  return { kind: 'domain_decl', id, shape: { kind: 'fixed_count', count } };
}

/**
 * Create a 2D grid domain declaration.
 */
export function domainDeclGrid2d(id: DomainId, width: number, height: number): DomainDecl {
  return { kind: 'domain_decl', id, shape: { kind: 'grid_2d', width, height } };
}

/**
 * Create a voices domain declaration.
 */
export function domainDeclVoices(id: DomainId, maxVoices: number): DomainDecl {
  return { kind: 'domain_decl', id, shape: { kind: 'voices', maxVoices } };
}

/**
 * Create a mesh vertices domain declaration.
 */
export function domainDeclMeshVertices(id: DomainId, assetId: string): DomainDecl {
  return { kind: 'domain_decl', id, shape: { kind: 'mesh_vertices', assetId } };
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
 * - field(domain) → many(domain) + continuous
 * - event → one|many + discrete
 */
export function worldToAxes(
  world: 'static' | 'scalar' | 'signal' | 'field' | 'event',
  domainId?: DomainId
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
      if (!domainId) {
        throw new Error('field world requires domainId');
      }
      return {
        cardinality: cardinalityMany(domainRef(domainId)),
        temporality: temporalityContinuous(),
      };
    case 'event':
      return {
        cardinality: domainId ? cardinalityMany(domainRef(domainId)) : cardinalityOne(),
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
export function signalTypeSignal(payload: PayloadType): SignalType {
  return signalType(payload, {
    cardinality: axisInstantiated(cardinalityOne()),
    temporality: axisInstantiated(temporalityContinuous()),
  });
}

/**
 * Create a Field SignalType (many(domain) + continuous).
 */
export function signalTypeField(payload: PayloadType, domainId: DomainId): SignalType {
  return signalType(payload, {
    cardinality: axisInstantiated(cardinalityMany(domainRef(domainId))),
    temporality: axisInstantiated(temporalityContinuous()),
  });
}

/**
 * Create a Trigger SignalType (one + discrete).
 */
export function signalTypeTrigger(payload: PayloadType): SignalType {
  return signalType(payload, {
    cardinality: axisInstantiated(cardinalityOne()),
    temporality: axisInstantiated(temporalityDiscrete()),
  });
}

/**
 * Create a Static/Scalar SignalType (zero + continuous).
 */
export function signalTypeStatic(payload: PayloadType): SignalType {
  return signalType(payload, {
    cardinality: axisInstantiated(cardinalityZero()),
    temporality: axisInstantiated(temporalityContinuous()),
  });
}

/**
 * Create a per-lane Event SignalType (many(domain) + discrete).
 */
export function signalTypePerLaneEvent(payload: PayloadType, domainId: DomainId): SignalType {
  return signalType(payload, {
    cardinality: axisInstantiated(cardinalityMany(domainRef(domainId))),
    temporality: axisInstantiated(temporalityDiscrete()),
  });
}
