/**
 * src/pillars/types/schemas.ts
 *
 * The data-model foundation of the pillar compiler's type system: every type a
 * port can declare, expressed as a Zod schema so the runtime validator, the
 * JSON round-trip, and the TypeScript type are one artifact rather than three
 * that drift. [LAW:one-source-of-truth]
 *
 * This file imports ONLY zod. Semantics — unification, substitution, the
 * fixpoint resolver, validateAxes — are deliberately absent; they live in
 * sibling children that import these schemas. The schema layer knows the
 * *shape* of a type, never how to solve one. [LAW:decomposition]
 *
 * Two separations the schemas enforce mechanically, not by convention:
 *
 *   1. Z-prefix. Every exported type is `Z…`, so a search for the Z-prefixed
 *      name finds only this system and the bare V1 name finds only V1. The two
 *      type systems cannot be confused at a callsite, and a forbidden-pattern
 *      test can police the boundary.
 *
 *   2. Concrete vs inference. `ZCanonicalType` cannot hold a type variable —
 *      its schema has no `{kind:'var'}` member, so a variable-bearing value
 *      fails `ZCanonicalTypeSchema.parse` at runtime AND is unassignable to a
 *      `ZCanonicalType` parameter at compile time. A consumer needing a
 *      fully-resolved type declares `ZCanonicalType` and is structurally
 *      incapable of receiving a variable. The only inference→concrete bridge
 *      is one `ZCanonicalTypeSchema.safeParse` (landed by the resolver child),
 *      never a `kind === 'inst'` check scattered across callsites.
 *      [LAW:types-are-the-program]
 */

import { z } from 'zod';

/**
 * Retains the precise tuple type of its arguments. `z.discriminatedUnion`
 * requires a non-empty tuple `[A, ...A[]]`, but a bare array literal infers as
 * `A[]` and loses that shape. Routing shared member lists through this identity
 * lets the concrete and inference unions be built from one list while still
 * satisfying Zod's tuple constraint. [LAW:one-source-of-truth]
 */
const members = <T extends readonly [unknown, ...unknown[]]>(...m: T): T => m;

// ---------------------------------------------------------------------------
// Branded variable identities
// ---------------------------------------------------------------------------

/**
 * A type variable's identity is a string at runtime, but a PayloadVarId must
 * never be accepted where a UnitVarId is expected. Branding makes the three
 * variable spaces — and InstanceRef, the identity of a `many` cardinality's
 * lane set — mutually unassignable with zero runtime cost. [LAW:types-are-the-program]
 */
export const PayloadVarIdSchema = z.string().brand<'PayloadVarId'>();
export type PayloadVarId = z.infer<typeof PayloadVarIdSchema>;
export const payloadVarId = (s: string): PayloadVarId => PayloadVarIdSchema.parse(s);

export const UnitVarIdSchema = z.string().brand<'UnitVarId'>();
export type UnitVarId = z.infer<typeof UnitVarIdSchema>;
export const unitVarId = (s: string): UnitVarId => UnitVarIdSchema.parse(s);

export const CardinalityVarIdSchema = z.string().brand<'CardinalityVarId'>();
export type CardinalityVarId = z.infer<typeof CardinalityVarIdSchema>;
export const cardinalityVarId = (s: string): CardinalityVarId => CardinalityVarIdSchema.parse(s);

export const InstanceRefSchema = z.string().brand<'InstanceRef'>();
export type InstanceRef = z.infer<typeof InstanceRefSchema>;
export const instanceRef = (s: string): InstanceRef => InstanceRefSchema.parse(s);

// ---------------------------------------------------------------------------
// Payload — what a value IS
// ---------------------------------------------------------------------------

/**
 * The concrete payload members. `material` already exists in the pillar block
 * ABI from the materials work; `cameraProjection | shape2d | shape3d` are
 * added by a later child. The members are a shared constant so the concrete
 * and inference unions are built from one list — adding a payload kind touches
 * exactly one place. [LAW:one-source-of-truth]
 */
const PAYLOAD_MEMBERS = members(
  z.object({ kind: z.literal('float') }),
  z.object({ kind: z.literal('int') }),
  z.object({ kind: z.literal('bool') }),
  z.object({ kind: z.literal('vec2') }),
  z.object({ kind: z.literal('vec3') }),
  z.object({ kind: z.literal('color') }),
  z.object({ kind: z.literal('material') }),
);

export const ZPayloadTypeSchema = z.discriminatedUnion('kind', PAYLOAD_MEMBERS);
export type ZPayloadType = z.infer<typeof ZPayloadTypeSchema>;

export const ZInferencePayloadTypeSchema = z.discriminatedUnion('kind', [
  ...PAYLOAD_MEMBERS,
  z.object({ kind: z.literal('var'), var: PayloadVarIdSchema }),
]);
export type ZInferencePayloadType = z.infer<typeof ZInferencePayloadTypeSchema>;

// ---------------------------------------------------------------------------
// Unit — what a value MEANS dimensionally
// ---------------------------------------------------------------------------

/**
 * Structured units. `color` carries `rgba01` today; the OKLab epic adds
 * `oklch`. Unit and payload both have a `color` kind — they are independent
 * unions, so a `color` payload and a `color` unit never collide.
 */
const UNIT_MEMBERS = members(
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('count') }),
  z.object({ kind: z.literal('angle'), unit: z.enum(['radians', 'degrees', 'phase01']) }),
  z.object({ kind: z.literal('time'), unit: z.enum(['ms', 'seconds']) }),
  z.object({
    kind: z.literal('space'),
    space: z.enum(['ndc', 'world', 'view']),
    dims: z.union([z.literal(2), z.literal(3)]),
  }),
  z.object({ kind: z.literal('color'), unit: z.enum(['rgba01']) }),
);

export const ZUnitTypeSchema = z.discriminatedUnion('kind', UNIT_MEMBERS);
export type ZUnitType = z.infer<typeof ZUnitTypeSchema>;

export const ZInferenceUnitTypeSchema = z.discriminatedUnion('kind', [
  ...UNIT_MEMBERS,
  z.object({ kind: z.literal('var'), var: UnitVarIdSchema }),
]);
export type ZInferenceUnitType = z.infer<typeof ZInferenceUnitTypeSchema>;

// ---------------------------------------------------------------------------
// Extent — the five axes describing a value's shape in space, time, and branch
// ---------------------------------------------------------------------------

/**
 * Cardinality: how many lanes. `zero` is compile-time-only (no runtime lanes,
 * NOT a synonym for scalar — scalar is `one`); `many` aligns its lanes by an
 * InstanceRef and may declare a pool `capacity`. It is the one extent axis the
 * solver unifies, so it is the one axis with a variable form.
 */
const CARDINALITY_MEMBERS = members(
  z.object({ kind: z.literal('zero') }),
  z.object({ kind: z.literal('one') }),
  z.object({
    kind: z.literal('many'),
    instance: InstanceRefSchema,
    capacity: z.number().int().positive().optional(),
  }),
);

export const ZCardinalitySchema = z.discriminatedUnion('kind', CARDINALITY_MEMBERS);
export type ZCardinality = z.infer<typeof ZCardinalitySchema>;

export const ZInferenceCardinalitySchema = z.discriminatedUnion('kind', [
  ...CARDINALITY_MEMBERS,
  z.object({ kind: z.literal('var'), var: CardinalityVarIdSchema }),
]);
export type ZInferenceCardinality = z.infer<typeof ZInferenceCardinalitySchema>;

/**
 * Temporality: when a value exists. `discrete` carries event semantics whose
 * hard invariants (payload=bool, unit=none) are enforced by `validateAxes` in
 * a later child, not encoded here — the schema layer admits the shape; the
 * gate decides legality. There is no temporality variable: the solver derives
 * temporality, it does not unify it.
 */
export const ZTemporalitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('continuous') }),
  z.object({ kind: z.literal('discrete') }),
]);
export type ZTemporality = z.infer<typeof ZTemporalitySchema>;

/**
 * Binding, perspective, and branch are default-only for now: each admits
 * exactly its default value and nothing else. There is no variable form and no
 * second value to represent — adding either is a deliberate future change with
 * a consumer, not speculative surface. [LAW:no-mode-explosion]
 */
export const ZBindingSchema = z.object({ kind: z.literal('unbound') });
export type ZBinding = z.infer<typeof ZBindingSchema>;

export const ZPerspectiveSchema = z.object({ kind: z.literal('default') });
export type ZPerspective = z.infer<typeof ZPerspectiveSchema>;

export const ZBranchSchema = z.object({ kind: z.literal('default') });
export type ZBranch = z.infer<typeof ZBranchSchema>;

export const ZExtentSchema = z.object({
  cardinality: ZCardinalitySchema,
  temporality: ZTemporalitySchema,
  binding: ZBindingSchema,
  perspective: ZPerspectiveSchema,
  branch: ZBranchSchema,
});
export type ZExtent = z.infer<typeof ZExtentSchema>;

/**
 * The inference extent differs from the concrete one in exactly one axis —
 * cardinality may be a variable. The other four axes are identical, so a
 * concrete `ZExtent` is structurally assignable to a `ZInferenceExtent`.
 */
export const ZInferenceExtentSchema = z.object({
  cardinality: ZInferenceCardinalitySchema,
  temporality: ZTemporalitySchema,
  binding: ZBindingSchema,
  perspective: ZPerspectiveSchema,
  branch: ZBranchSchema,
});
export type ZInferenceExtent = z.infer<typeof ZInferenceExtentSchema>;

// ---------------------------------------------------------------------------
// ZCanonicalType — payload + unit + extent
// ---------------------------------------------------------------------------

/**
 * The single type authority. A `ZCanonicalType` is fully instantiated: because
 * none of its three components admit a `{kind:'var'}` member, a variable-bearing
 * value cannot be parsed into one and cannot be assigned to one. [LAW:one-source-of-truth]
 */
export const ZCanonicalTypeSchema = z.object({
  payload: ZPayloadTypeSchema,
  unit: ZUnitTypeSchema,
  extent: ZExtentSchema,
});
export type ZCanonicalType = z.infer<typeof ZCanonicalTypeSchema>;

export const ZInferenceCanonicalTypeSchema = z.object({
  payload: ZInferencePayloadTypeSchema,
  unit: ZInferenceUnitTypeSchema,
  extent: ZInferenceExtentSchema,
});
export type ZInferenceCanonicalType = z.infer<typeof ZInferenceCanonicalTypeSchema>;

// ---------------------------------------------------------------------------
// Bundle — a named collection of typed values (a port's or block's field set)
// ---------------------------------------------------------------------------

export const ZBundleTypeSchema = z.record(z.string(), ZCanonicalTypeSchema);
export type ZBundleType = z.infer<typeof ZBundleTypeSchema>;

export const ZInferenceBundleTypeSchema = z.record(z.string(), ZInferenceCanonicalTypeSchema);
export type ZInferenceBundleType = z.infer<typeof ZInferenceBundleTypeSchema>;

// ---------------------------------------------------------------------------
// Ports — where a block declares the types it consumes and emits
// ---------------------------------------------------------------------------

/**
 * How a multi-fanout input field reduces when several edges target one port.
 * `first`/`last` pick a single contributor; `sum` adds numeric fields; `or`/`and`
 * combine booleans. Which mode is legal for which payload category is a semantic
 * rule the validate gate enforces in a later child — the schema admits the set,
 * the gate decides the pairing. [LAW:decomposition]
 */
export const ZCombineModeSchema = z.enum(['first', 'last', 'sum', 'or', 'and']);
export type ZCombineMode = z.infer<typeof ZCombineModeSchema>;

/**
 * A single port: its stable identity, its direction, and the bundle of typed
 * fields it carries. The type is a `ZInferenceBundleType` because a port may
 * declare variables (a modifier ties its output field to its input field by
 * sharing a variable) that only become concrete after the resolver runs.
 *
 * Types live on PORTS, never on edges — an edge is `{source, target}` only.
 * A catalog block has fully-typed ports with no edges at all, which is what
 * makes `findInsertableBlocks` answerable without walking a graph. [LAW:one-source-of-truth]
 */
export const ZPortBindingSchema = z.object({
  id: z.string(),
  dir: z.enum(['in', 'out']),
  type: ZInferenceBundleTypeSchema,
  combine: ZCombineModeSchema.optional(),
});
export type ZPortBinding = z.infer<typeof ZPortBindingSchema>;

/**
 * A block's complete type surface: its input and output ports, each keyed by
 * slot name. This is the block's seam — the rest of the compiler (unifier,
 * validate gate, insert-menu query) reads the contract, never the block body.
 * [LAW:locality-or-seam]
 */
export const ZBlockContractSchema = z.object({
  inputs: z.record(z.string(), ZPortBindingSchema),
  outputs: z.record(z.string(), ZPortBindingSchema),
});
export type ZBlockContract = z.infer<typeof ZBlockContractSchema>;

/**
 * Marks a block as an adapter — a one-in/one-out conversion the type system may
 * insert to bridge an otherwise-incompatible edge. There is NO adapter registry
 * and NO pattern dialect: an adapter is a regular block whose polymorphism is
 * expressed in its ports' `ZInferenceCanonicalType` variables, and "find an
 * adapter" is unification over the catalog. So the only data an adapter spec
 * carries beyond the block's existing contract is human-facing description plus
 * a tiebreak priority. [LAW:one-type-per-behavior] [LAW:no-mode-explosion]
 *
 * `priority` is lower-is-preferred (default 0), the deterministic tiebreak when
 * several adapters unify the same edge. It is data on the type, never a mode the
 * search branches on.
 */
export const ZAdapterSpecSchema = z.object({
  description: z.string(),
  priority: z.number().int().optional(),
});
export type ZAdapterSpec = z.infer<typeof ZAdapterSpecSchema>;

// ---------------------------------------------------------------------------
// Constructors — produce inference types ergonomically
// ---------------------------------------------------------------------------

export interface CanonicalOpts {
  readonly unit?: ZInferenceUnitType;
  readonly extent?: ZInferenceExtent;
}

/**
 * The single canonical-type constructor. Payload is the value that varies;
 * unit and extent default to dimensionless and scalar. `zFloat`/`zVec2`/etc.
 * are sugar over this one function — same behavior, different payload — rather
 * than separate implementations. [LAW:one-type-per-behavior]
 */
export const canonical = (
  payload: ZInferencePayloadType,
  opts: CanonicalOpts = {},
): ZInferenceCanonicalType => ({
  payload,
  unit: opts.unit ?? { kind: 'none' },
  extent: opts.extent ?? oneExtent(),
});

export const zFloat = (opts?: CanonicalOpts): ZInferenceCanonicalType =>
  canonical({ kind: 'float' }, opts);

export const zVec2 = (opts?: CanonicalOpts): ZInferenceCanonicalType =>
  canonical({ kind: 'vec2' }, opts);

export const zVec3 = (opts?: CanonicalOpts): ZInferenceCanonicalType =>
  canonical({ kind: 'vec3' }, opts);

/** A color value's natural unit is rgba01; callers may override via opts. */
export const zColor = (opts?: CanonicalOpts): ZInferenceCanonicalType =>
  canonical({ kind: 'color' }, { unit: { kind: 'color', unit: 'rgba01' }, ...opts });

// --- Extent constructors ---------------------------------------------------

export const oneExtent = (): ZExtent => ({
  cardinality: { kind: 'one' },
  temporality: { kind: 'continuous' },
  binding: { kind: 'unbound' },
  perspective: { kind: 'default' },
  branch: { kind: 'default' },
});

export const manyExtent = (instance: InstanceRef, capacity?: number): ZExtent => ({
  ...oneExtent(),
  cardinality:
    capacity === undefined
      ? { kind: 'many', instance }
      : { kind: 'many', instance, capacity },
});

// --- Variable constructors -------------------------------------------------

export const payloadVar = (name: string): ZInferencePayloadType => ({
  kind: 'var',
  var: payloadVarId(name),
});

export const unitVar = (name: string): ZInferenceUnitType => ({
  kind: 'var',
  var: unitVarId(name),
});

export const cardinalityVar = (name: string): ZInferenceCardinality => ({
  kind: 'var',
  var: cardinalityVarId(name),
});
