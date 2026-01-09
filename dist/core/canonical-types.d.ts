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
/**
 * The base data type of a value.
 *
 * Note: 'event' and 'domain' are NOT PayloadTypes - they are axis/resource concepts.
 */
export type PayloadType = 'float' | 'int' | 'vec2' | 'color' | 'phase' | 'bool' | 'unit';
/**
 * Discriminated union representing "default unless instantiated".
 *
 * This pattern replaces optional fields with explicit union branches,
 * enabling TypeScript type narrowing and ensuring no implicit nulls.
 */
export type AxisTag<T> = {
    readonly kind: 'default';
} | {
    readonly kind: 'instantiated';
    readonly value: T;
};
/**
 * Create a default axis tag.
 */
export declare function axisDefault<T>(): AxisTag<T>;
/**
 * Create an instantiated axis tag.
 */
export declare function axisInstantiated<T>(value: T): AxisTag<T>;
/**
 * Check if an axis tag is instantiated.
 */
export declare function isInstantiated<T>(tag: AxisTag<T>): tag is {
    kind: 'instantiated';
    value: T;
};
/**
 * Get the value from an axis tag, or return the default if not instantiated.
 */
export declare function getAxisValue<T>(tag: AxisTag<T>, defaultValue: T): T;
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
export declare function domainRef(id: DomainId): DomainRef;
/**
 * How many lanes/elements a value has.
 *
 * Mapping from old World:
 * - zero = was 'static' / 'config' / 'scalar' (compile-time constant)
 * - one = was 'signal' (single lane, time-varying)
 * - many(domain) = was 'field(domain)' (N lanes aligned by domain)
 */
export type Cardinality = {
    readonly kind: 'zero';
} | {
    readonly kind: 'one';
} | {
    readonly kind: 'many';
    readonly domain: DomainRef;
};
/**
 * Create a zero cardinality (compile-time constant).
 */
export declare function cardinalityZero(): Cardinality;
/**
 * Create a one cardinality (single lane).
 */
export declare function cardinalityOne(): Cardinality;
/**
 * Create a many cardinality (N lanes aligned by domain).
 */
export declare function cardinalityMany(domain: DomainRef): Cardinality;
/**
 * When a value exists in time.
 *
 * - continuous: Value exists every frame/tick
 * - discrete: Event occurrences only (sparse, edge-triggered)
 */
export type Temporality = {
    readonly kind: 'continuous';
} | {
    readonly kind: 'discrete';
};
/**
 * Create a continuous temporality.
 */
export declare function temporalityContinuous(): Temporality;
/**
 * Create a discrete temporality (events).
 */
export declare function temporalityDiscrete(): Temporality;
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
export declare function referentRef(id: ReferentId): ReferentRef;
/**
 * How a value is bound to a referent.
 *
 * Note: Binding is independent of Domain. Same domain can host
 * unbound image vs bound mask.
 */
export type Binding = {
    readonly kind: 'unbound';
} | {
    readonly kind: 'weak';
    readonly referent: ReferentRef;
} | {
    readonly kind: 'strong';
    readonly referent: ReferentRef;
} | {
    readonly kind: 'identity';
    readonly referent: ReferentRef;
};
/**
 * Create an unbound binding.
 */
export declare function bindingUnbound(): Binding;
/**
 * Create a weak binding.
 */
export declare function bindingWeak(referent: ReferentRef): Binding;
/**
 * Create a strong binding.
 */
export declare function bindingStrong(referent: ReferentRef): Binding;
/**
 * Create an identity binding.
 */
export declare function bindingIdentity(referent: ReferentRef): Binding;
/**
 * Perspective identifier.
 */
export type PerspectiveId = string;
/**
 * Branch identifier.
 */
export type BranchId = string;
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
export declare function extentDefault(): Extent;
/**
 * Create an extent with specified axes (rest default).
 */
export declare function extent(overrides: Partial<Extent>): Extent;
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
export declare function signalType(payload: PayloadType, extentOverrides?: Partial<Extent>): SignalType;
/**
 * V0 canonical default values for each axis.
 *
 * These are used when resolving AxisTag.default during compilation.
 */
export declare const DEFAULTS_V0: {
    readonly cardinality: Cardinality;
    readonly temporality: Temporality;
    readonly binding: Binding;
    readonly perspective: PerspectiveId;
    readonly branch: BranchId;
};
/**
 * V0 evaluation frame defaults.
 */
export declare const FRAME_V0: {
    readonly perspective: PerspectiveId;
    readonly branch: BranchId;
};
/**
 * Shape specification for a domain.
 */
export type DomainShape = {
    readonly kind: 'fixed_count';
    readonly count: number;
} | {
    readonly kind: 'grid_2d';
    readonly width: number;
    readonly height: number;
} | {
    readonly kind: 'voices';
    readonly maxVoices: number;
} | {
    readonly kind: 'mesh_vertices';
    readonly assetId: string;
};
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
export declare function domainDeclFixedCount(id: DomainId, count: number): DomainDecl;
/**
 * Create a 2D grid domain declaration.
 */
export declare function domainDeclGrid2d(id: DomainId, width: number, height: number): DomainDecl;
/**
 * Create a voices domain declaration.
 */
export declare function domainDeclVoices(id: DomainId, maxVoices: number): DomainDecl;
/**
 * Create a mesh vertices domain declaration.
 */
export declare function domainDeclMeshVertices(id: DomainId, assetId: string): DomainDecl;
/**
 * Error indicating axis unification failed.
 */
export declare class AxisUnificationError extends Error {
    readonly axis: string;
    readonly valueA: unknown;
    readonly valueB: unknown;
    constructor(axis: string, valueA: unknown, valueB: unknown);
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
export declare function unifyAxis<T>(axisName: string, a: AxisTag<T>, b: AxisTag<T>): AxisTag<T>;
/**
 * Unify two extents according to v0 strict join rules.
 *
 * All 5 axes are unified independently. Any mismatch throws.
 */
export declare function unifyExtent(a: Extent, b: Extent): Extent;
/**
 * Convert old "World" concept to new axes.
 *
 * Mapping:
 * - static/scalar → zero + continuous
 * - signal → one + continuous
 * - field(domain) → many(domain) + continuous
 * - event → one|many + discrete
 */
export declare function worldToAxes(world: 'static' | 'scalar' | 'signal' | 'field' | 'event', domainId?: DomainId): {
    cardinality: Cardinality;
    temporality: Temporality;
};
/**
 * Create a Signal SignalType (one + continuous).
 */
export declare function signalTypeSignal(payload: PayloadType): SignalType;
/**
 * Create a Field SignalType (many(domain) + continuous).
 */
export declare function signalTypeField(payload: PayloadType, domainId: DomainId): SignalType;
/**
 * Create a Trigger SignalType (one + discrete).
 */
export declare function signalTypeTrigger(payload: PayloadType): SignalType;
/**
 * Create a Static/Scalar SignalType (zero + continuous).
 */
export declare function signalTypeStatic(payload: PayloadType): SignalType;
/**
 * Create a per-lane Event SignalType (many(domain) + discrete).
 */
export declare function signalTypePerLaneEvent(payload: PayloadType, domainId: DomainId): SignalType;
