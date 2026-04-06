/**
 * src/pillars/types.ts
 *
 * Type definitions for the 4-Pillar SourceBundle block model.
 *
 * Derived from:
 *   - design-docs/B0-4-Pillar-Arch-UBER.md (architecture)
 *   - design-docs/B2-source-bundle/01-engineering-design.md (engineering constraints)
 *
 * [LAW:one-source-of-truth] Output types (ExprIR, MemoryManifest, RosterEntry)
 * are imported from the boundary-contract. This file only defines the
 * pillar-specific shapes layered on top.
 *
 * The shapes here deliberately differ from any legacy compiler types — this is
 * a fresh design from the design docs, not an adaptation of prior code.
 */

import type {
  ExprIR,
  MemoryManifest,
  RosterEntry,
  GlobalSpec,
  ArenaScalarSpec,
  InstanceDomainSpec,
  TextureSpec,
  StaticGeometrySpec,
  SamplerSpec,
  DataStreamSpec,
} from '../render/rust/boundary-contract';

// ---------------------------------------------------------------------------
// SourceBundle — the compound proxy that flows between pillar blocks
// ---------------------------------------------------------------------------

/**
 * A SourceBundle is a named collection of field expressions.
 *
 * Every edge in a PillarPatch carries a whole SourceBundle. Generators emit
 * bundles. Modifiers consume a primary bundle and produce a new one. Intents
 * consume a bundle and iterate its fields to emit StoreField statements.
 *
 * Bundle field names double as the field symbols written to a manifest
 * domain. A bundle with keys `pos_x, pos_y, color_r` corresponds to a domain
 * with those exact field names.
 *
 * [LAW:dataflow-not-control-flow] There is no "scalar port" concept in this
 * model. Everything is a bundle. A scalar value is a one-field bundle.
 */
export type SourceBundle = Readonly<Record<string, ExprIR>>;

// ---------------------------------------------------------------------------
// Block kinds (three of the four pillars — Material deferred)
// ---------------------------------------------------------------------------

/**
 * The pillar roles in the 4-Pillar architecture.
 *
 * - 'generator': Pillar 1. Declares a domain in the manifest and emits a
 *   SourceBundle whose field expressions define the initial values of each
 *   field.
 *
 * - 'modifier': Pillar 2. Receives a primary SourceBundle, transforms some
 *   subset of its fields, and emits a new SourceBundle with the modified
 *   fields replaced. Untouched fields pass through by identity.
 *
 * - 'intent': Pillar 4. Terminal. Consumes a SourceBundle and produces
 *   roster entries (Compute, System_DrawPrep, Render). The first slice uses
 *   a hardcoded fragment shader inside the Intent; a dedicated Material
 *   pillar comes later.
 */
export type PillarKind = 'generator' | 'modifier' | 'intent';

// ---------------------------------------------------------------------------
// PillarPatch — the graph representation
// ---------------------------------------------------------------------------

/**
 * A block instance within a PillarPatch.
 *
 * `type` identifies the block definition in the registry (e.g. 'ParticlePool',
 * 'ExpressionModifier', 'DrawBundle'). `config` holds instance-specific
 * parameters that the block definition reads during manifest/lowering.
 */
export interface PillarBlock {
  readonly id: string;
  readonly kind: PillarKind;
  readonly type: string;
  readonly config: Readonly<Record<string, unknown>>;
}

/**
 * An edge between two blocks in a PillarPatch. Every edge carries a whole
 * SourceBundle — there is no per-port scalar wiring in this model.
 *
 * `inputSlot` is the named slot on the target block where the bundle arrives
 * (e.g. `'primary'`, `'clock'`, `'sourceA'`). The target block reads it as
 * `ctx.inputBundles[inputSlot]`.
 *
 * `role` distinguishes the primary bundle (determines the dispatch domain,
 * the bundle whose fields are writable) from secondary bundles (read-only,
 * used for cross-domain reads). The initial slice only uses `'primary'`.
 */
export interface PillarEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly inputSlot: string;
  readonly role: 'primary' | 'secondary';
}

export interface PillarPatch {
  readonly blocks: readonly PillarBlock[];
  readonly edges: readonly PillarEdge[];
}

// ---------------------------------------------------------------------------
// Manifest contributions (declared during the harvest phase)
// ---------------------------------------------------------------------------

/**
 * What a block contributes to the MemoryManifest during the harvest phase.
 *
 * Generators typically declare a domain plus its field set. Intents typically
 * declare the camera global and the shape geometry used for the draw. Modifiers
 * usually have no manifest contributions — they operate on a bundle whose
 * fields were already declared by the upstream Generator.
 */
export interface ManifestContribution {
  readonly globals?: Readonly<Record<string, GlobalSpec>>;
  readonly arenaScalars?: Readonly<Record<string, ArenaScalarSpec>>;
  readonly domains?: Readonly<Record<string, InstanceDomainSpec>>;
  readonly textures?: Readonly<Record<string, TextureSpec>>;
  readonly shapes?: Readonly<Record<string, StaticGeometrySpec>>;
  readonly samplers?: Readonly<Record<string, SamplerSpec>>;
  readonly dataStreams?: Readonly<Record<string, DataStreamSpec>>;
}

// ---------------------------------------------------------------------------
// Lowering context + result
// ---------------------------------------------------------------------------

/**
 * Context passed to a block's `manifestRequirements` callback.
 *
 * The manifest is not yet assembled during this phase — each block contributes
 * independently and the compiler merges contributions.
 */
export interface PillarManifestContext {
  readonly blockId: string;
  readonly blockType: string;
  readonly config: Readonly<Record<string, unknown>>;
}

/**
 * Context passed to a block's `lower` callback.
 *
 * `inputBundles` contains one entry per named input slot that the walker has
 * resolved by following incoming edges. The values are complete SourceBundles,
 * not individual expressions.
 *
 * `manifest` is the fully-harvested MemoryManifest. Blocks may read from it
 * (e.g. to look up a field symbol) but may not mutate it.
 */
export interface PillarLoweringContext {
  readonly blockId: string;
  readonly blockType: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly blockKind: PillarKind;
  readonly inputBundles: Readonly<Record<string, SourceBundle>>;
  readonly manifest: MemoryManifest;
}

/**
 * Result of lowering a block.
 *
 * - Generators and Modifiers return `kind: 'bundle'` with a SourceBundle.
 * - Intents return `kind: 'intent'` with injected roster entries (compute,
 *   drawPrep, render).
 */
export type PillarLoweredBlock =
  | { readonly kind: 'bundle'; readonly output: SourceBundle }
  | { readonly kind: 'intent'; readonly passes: readonly RosterEntry[] };

// ---------------------------------------------------------------------------
// Block definition contract
// ---------------------------------------------------------------------------

/**
 * The registration shape for a pillar block type.
 *
 * `kind` is declared up-front so the compiler can validate graph topology
 * (e.g. Intents are sinks; Generators have no inputs).
 *
 * `manifestRequirements` is optional — Modifiers typically have none.
 *
 * `lower` is required. It must return a result whose `kind` matches the
 * block's declared `kind` (bundle for generator/modifier, intent for intent).
 */
export interface PillarBlockDef {
  readonly kind: PillarKind;
  readonly manifestRequirements?: (ctx: PillarManifestContext) => ManifestContribution;
  readonly lower: (ctx: PillarLoweringContext) => PillarLoweredBlock;
}
