/**
 * src/pillars/block-api.ts
 *
 * The public ABI between block authors and the compiler.
 *
 * This file is a LEAF in the dependency graph. It imports only from the
 * boundary contract — never from frontend/, lowering/, assembly/, blocks/,
 * or block-dsl/. Both the frontend's normalization pass and the lowering
 * walker import their types from here, so neither phase has to reach into
 * the other.
 *
 * Anything that appears in a block file's `lower()` signature lives here.
 * Adding a field to one of these types is a breaking change to every block
 * in the codebase, so changes should be deliberate and well-reviewed.
 *
 * dependency-cruiser rule: src/pillars/block-api.ts must not import from
 * any phase directory. See `.dependency-cruiser.cjs` for the enforcement.
 * The schema layer (`./types/schemas`) is the one exception — it is a leaf
 * the ABI is allowed to build on, one-way. [LAW:one-way-deps]
 */

import { z } from 'zod';

import type {
  ArenaScalarSpec,
  DataStreamSpec,
  ExprIR,
  GlobalSpec,
  InstanceDomainSpec,
  MemoryManifest,
  PipelineStateSpec,
  RosterEntry,
  SamplerSpec,
  StatementIR,
  StaticGeometrySpec,
  TextureSpec,
} from '../render/rust/boundary-contract';
import type {
  ZBlockContract,
  ZCombineMode,
  ZInferenceBundleType,
  ZInferenceCanonicalType,
  ZPortBinding,
} from './types/schemas';

// ---------------------------------------------------------------------------
// NodeId — opaque brand for nodes in the NormalizedGraph
// ---------------------------------------------------------------------------

/**
 * The opaque identifier for a node in the NormalizedGraph. The exact
 * generation scheme (preserve PillarBlock.id verbatim, mint fresh ids,
 * collision-avoiding rewrites under adapter insertion, etc.) is an
 * implementation detail of the frontend that may evolve over time.
 *
 * The contract:
 *   - The backend treats it as opaque. The walker uses it as a Map key
 *     for memoization and includes it in error messages, but never
 *     interprets it.
 *   - It is stable within a single compile pass — the same node always
 *     has the same NodeId across the frontend → lowering → assembly
 *     handoff.
 *   - It is a string at runtime, so it serializes cleanly and can be
 *     used as a debug-tracing key by an out-of-band DebugService.
 */
export type NodeId = string & { readonly __nodeIdBrand: unique symbol };

// ---------------------------------------------------------------------------
// SourceBundle and the lowering result types
// ---------------------------------------------------------------------------

/**
 * A SourceBundle is a named collection of field expressions. The bundle's
 * keys double as field names in the source domain's SoA storage. Generators
 * emit bundles. Modifiers consume a primary bundle and produce a new one.
 * Intents iterate a bundle to emit StoreField statements.
 *
 * The shape is `Readonly<Record<string, ExprIR>>` — a flat field-name to
 * expression mapping. Nesting is not supported; flatten if needed.
 */
export type SourceBundle = Readonly<Record<string, ExprIR>>;

/**
 * Result of lowering a Generator or Modifier block: a new SourceBundle
 * plus an optional domainId annotation.
 *
 * The walker uses `domainId` to detect cross-domain secondary bundle reads
 * and rewrite them to LoadField. Generators with a per-instance domain
 * (e.g. ParticlePool) set it explicitly. Generators without a domain
 * (e.g. Clock — fields are scalar globals) leave it undefined. Modifiers
 * leave it undefined and the walker fills it in by inheriting from the
 * primary input bundle.
 */
export interface LoweredBundle {
  readonly kind: 'bundle';
  readonly output: SourceBundle;
  readonly domainId?: string;
}

/**
 * Result of lowering an Intent block: a list of roster entries (compute,
 * drawPrep, render, etc.) that the assembly phase will incorporate into
 * the final PipelineInstallPayload.
 */
export interface LoweredIntent {
  readonly kind: 'intent';
  readonly passes: readonly RosterEntry[];
}

/**
 * A MaterialSpec is the WGSL composition a Material block (Pillar 3) emits:
 * the vertex/fragment AST a render sink draws with, the optional compute AST
 * a texture-materialize sink runs, and the data contract (`requiredFields`)
 * the spec demands of whatever bundle is paired with it.
 *
 * It lives here — not in boundary-contract — because it appears in a block's
 * `lower()` signature (`LoweredMaterial`, `LoweringContext.inputMaterials`),
 * which is precisely what block-api.ts owns. It is NOT a boundary-crossing
 * serialized type: `colorVaryingName`, `requiredFields`, and `wgslPreamble`
 * are TS-only and never reach Rust. The block-dsl `defineMaterialSpec`
 * constructor imports this type from here (block-dsl → block-api is allowed;
 * the reverse is not). [LAW:one-way-deps]
 *
 * `requiredFields` is the single source of truth for "what fields must the
 * paired bundle contain" — sinks validate against this list, they do not
 * hand-check field names. [LAW:single-enforcer]
 *
 * Keep the shape minimal; do not add fields without a consumer.
 * [LAW:no-mode-explosion]
 */
export interface MaterialSpec {
  readonly vertexAst: readonly StatementIR[];
  readonly fragmentAst: readonly StatementIR[];
  /** For texture-materialize sinks, which have no vertex/fragment stage. */
  readonly computeAst?: readonly StatementIR[];
  readonly requiredFields: readonly string[];
  /** Name of the color varying passed vertex → fragment. Typically 'color'. */
  readonly colorVaryingName: string;
  readonly pipelineState: PipelineStateSpec;
  /** Optional helper WGSL (e.g. OKLab conversion fns); consumed by a later epic. */
  readonly wgslPreamble?: string;
}

/**
 * Result of lowering a Material block: a MaterialSpec carrying the WGSL
 * fragments that turn a bundle into a color. A Material is wired into a sink
 * via a `'material'`-role edge; the walker resolves it into
 * `LoweringContext.inputMaterials`.
 *
 * This is a distinct variant from LoweredBundle because a material carries
 * WGSL composition, not field expressions — different value, different
 * behavior. [LAW:one-type-per-behavior]
 */
export interface LoweredMaterial {
  readonly kind: 'material';
  readonly spec: MaterialSpec;
}

/**
 * The discriminated union of every possible lowering result. The walker
 * checks `result.kind` to know what to do with the result, but it does
 * NOT use any field to determine what KIND of node produced the result —
 * that information is irrecoverable from the closure.
 */
export type LoweredBlock = LoweredBundle | LoweredIntent | LoweredMaterial;

// ---------------------------------------------------------------------------
// LoweringContext — the only thing the closure receives at lowering time
// ---------------------------------------------------------------------------

/**
 * The context passed to a block's `lower()` function at compile time.
 *
 * Notice what is NOT here:
 *   - No blockId or blockType (the closure already knows its own identity
 *     via captured `args`; the walker tracks NodeId separately for error
 *     reporting).
 *   - No raw config (the closure captured its TLowerArgs at frontend time;
 *     the backend never sees TConfig).
 *   - No registry handle (the walker has no concept of "other blocks").
 *   - No graph reference (the walker is the only thing that walks the
 *     graph; nodes only see their resolved inputs).
 *
 * The context contains:
 *   - `inputBundles`: bundles resolved from this node's incoming bundle
 *     edges (primary/secondary), keyed by inputSlot name. The walker has
 *     already done cross-domain rewriting before populating this.
 *   - `inputMaterials`: MaterialSpecs resolved from this node's incoming
 *     material-role edges, keyed by inputSlot name. Kept SEPARATE from
 *     `inputBundles` because a material and a bundle are different value
 *     types with different behavior. [LAW:one-type-per-behavior]
 *   - `manifest`: the fully-merged MemoryManifest, frozen at this point
 *     in the pipeline.
 */
export interface LoweringContext {
  readonly inputBundles: Readonly<Record<string, SourceBundle>>;
  readonly inputMaterials: Readonly<Record<string, MaterialSpec>>;
  readonly manifest: MemoryManifest;
}

// ---------------------------------------------------------------------------
// ManifestContribution — what each block declares as its resource needs
// ---------------------------------------------------------------------------

/**
 * What a block contributes to the MemoryManifest during normalization.
 *
 * Generators typically declare a domain plus its field set, plus any
 * globals or arena scalars they need. Intents typically declare the
 * camera global and the shape geometry used for the draw. Modifiers
 * usually have no manifest contributions — they operate on a bundle whose
 * fields were already declared by the upstream Generator.
 *
 * Multiple blocks may declare the same key (e.g. two Intents both
 * declaring `sys:camera`) as long as the specs are structurally identical.
 * The lowering phase's `manifest-merge.ts` enforces this.
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
// Diagnostic — what readConfig pushes into the accumulator
// ---------------------------------------------------------------------------

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

/**
 * A diagnostic emitted by the frontend (typically by `readConfig` during
 * normalization). The frontend collects every diagnostic from every block
 * before halting, so users see all errors in one pass instead of fix-and-
 * retry chains.
 *
 * The backend never runs on a graph that had any severity:'error'
 * diagnostics — `buildNormalizedGraph` returns `{ graph: null, diagnostics }`
 * in that case.
 */
export interface Diagnostic {
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  /** Optional id of the block that produced this diagnostic. */
  readonly blockId?: string;
}

// ---------------------------------------------------------------------------
// BlockDefinition — the contract every block file exports
// ---------------------------------------------------------------------------

/**
 * The shape every block file exports as a named constant.
 *
 * The two generic parameters are the heart of the opaque-backend property:
 *
 *   - `TConfig` is the validated, narrowed shape of the block's user-
 *     supplied configuration. The frontend may inspect any of it.
 *
 *   - `TLowerArgs` is the explicit whitelist of what the backend's
 *     lowering function receives. The closure built in
 *     `frontend/build-normalized-graph.ts` captures `TLowerArgs`, NOT
 *     `TConfig`. This means future block authors who add UI hints, port
 *     declarations, validation rules, or any other frontend-only metadata
 *     to TConfig do not automatically expose them to the backend — they
 *     would have to deliberately include them in `buildLowerArgs`.
 *
 * For most blocks today, `TLowerArgs` will equal `TConfig` (or `TConfig`
 * plus a few symbol ids harvested from the manifest contribution). That
 * is fine. The split costs nothing when the two are equal and pays off
 * the moment they need to diverge.
 */
export interface BlockDefinition<TConfig, TLowerArgs> {
  /** Registry key. Must be unique across ALL_BLOCKS. */
  readonly type: string;

  /**
   * The block's type surface: input/output ports with their declared bundle
   * types. Optional in this child because not every block has been migrated to
   * declare one yet; it becomes mandatory once the block-migration child lands.
   * Blocks built via `defineBlock` always carry one. The frontend type solver,
   * the validate gate, and the insert-menu query read this — never the block
   * body. [LAW:locality-or-seam]
   */
  readonly contract?: ZBlockContract;

  /**
   * FRONTEND-ONLY. Validates and narrows raw user-supplied config.
   *
   * Contract:
   *   - On valid input: returns the narrowed TConfig. Does NOT push to
   *     diagnostics.
   *   - On invalid input: pushes one or more severity:'error' Diagnostic
   *     entries to the diagnostics accumulator and returns null.
   *   - Pushes EVERY error it can find before returning. Does not stop
   *     on the first problem within a single block's config.
   *   - NEVER throws on user input. A throw from readConfig is reserved
   *     for compiler bugs / invariant violations only. If a throw could
   *     fire on any user input, that's a bug in readConfig.
   */
  readonly readConfig: (
    raw: Readonly<Record<string, unknown>>,
    diagnostics: Diagnostic[],
  ) => TConfig | null;

  /**
   * FRONTEND-ONLY. Computes the block's manifest contribution from the
   * narrowed config. Pure: receives only TConfig.
   */
  readonly buildManifestContribution: (config: TConfig) => ManifestContribution;

  /**
   * FRONTEND-ONLY. Produces the EXACT set of arguments the lowerer will
   * receive. This is the explicit whitelist that determines what crosses
   * the frontend/backend boundary.
   *
   * Receives both the validated config AND the manifest contribution
   * (so the args may include resolved symbol ids that the contribution
   * declared, e.g. `${domainId}:active`).
   */
  readonly buildLowerArgs: (
    config: TConfig,
    contribution: ManifestContribution,
  ) => TLowerArgs;

  /**
   * BACKEND-FACING. The ONLY function captured in the NormalizedNode
   * closure. Receives only TLowerArgs and a generic LoweringContext.
   *
   * Has no access to:
   *   - TConfig (only the buildLowerArgs whitelist made it across)
   *   - the registry
   *   - other blocks
   *   - the un-normalized PillarPatch
   *   - any frontend metadata
   *
   * The closure created in build-normalized-graph.ts wraps this function
   * with `args` already bound, producing a `(ctx) => LoweredBlock` that
   * the walker calls without ever seeing what's inside.
   */
  readonly lower: (args: TLowerArgs, ctx: LoweringContext) => LoweredBlock;
}

// ---------------------------------------------------------------------------
// defineBlock — the authoring helper with end-to-end TypeScript inference
// ---------------------------------------------------------------------------

/**
 * The author-facing shape of one input port: the bundle of fields it carries
 * and (optionally) how multiple incoming edges combine. Direction and the
 * port's stable id are NOT written by the author — `defineBlock` derives `dir`
 * from whether the port sits under `inputs` or `outputs`, and sets `id` to the
 * slot key. The author states each fact once. [LAW:one-source-of-truth]
 */
type InputPortDecl = {
  readonly type: ZInferenceBundleType;
  readonly combine?: ZCombineMode;
};

type OutputPortDecl = {
  readonly type: ZInferenceBundleType;
};

/**
 * Maps a declared input-port set to the precisely-typed `inputBundles` the
 * block's `lower` sees. Each slot becomes a record whose keys are EXACTLY the
 * fields that slot's bundle declared (no index signature), so reading a
 * declared field yields its runtime `ExprIR` and reading an undeclared field is
 * a compile error. This is what turns the contract into a compile-time spec
 * rather than a runtime hope. [LAW:types-are-the-program]
 */
type InferBundles<TInputs> = {
  readonly [Slot in keyof TInputs]: TInputs[Slot] extends { readonly type: infer Bundle }
    ? { readonly [Field in keyof Bundle]: ExprIR }
    : never;
};

/**
 * The `LoweringContext` a `defineBlock` block sees, with the wide
 * `Record<string, SourceBundle>` inputBundles REPLACED (not intersected) by the
 * precise per-slot view. Intersecting would re-admit arbitrary keys through the
 * record's index signature and defeat the field-level checking, so the wide
 * member is omitted first. [LAW:types-are-the-program]
 */
type TypedLoweringContext<TInputs> = Omit<LoweringContext, 'inputBundles'> & {
  readonly inputBundles: InferBundles<TInputs>;
};

const toBindings = (
  decls: Readonly<Record<string, InputPortDecl>>,
  dir: 'in' | 'out',
): Record<string, ZPortBinding> => {
  const out: Record<string, ZPortBinding> = {};
  for (const [slot, decl] of Object.entries(decls)) {
    out[slot] =
      decl.combine === undefined
        ? { id: slot, dir, type: decl.type }
        : { id: slot, dir, type: decl.type, combine: decl.combine };
  }
  return out;
};

/**
 * Builds a fully-typed `BlockDefinition` from Zod schemas, giving block authors
 * end-to-end inference: `config` validates with a one-line `.safeParse` instead
 * of a hand-rolled `readConfig`, and `lower` receives both the parsed config and
 * an `inputBundles` view typed field-by-field from the declared ports.
 *
 * The `TConfig`/`TLowerArgs` split collapses here — `lower` receives the parsed
 * config directly (`buildLowerArgs` is identity). A block that needs to inject
 * resolved symbol ids into the backend still uses the longhand `BlockDefinition`
 * literal; `defineBlock` covers the common case where config IS the lower args.
 *
 * `const` type parameters preserve the literal slot and field keys through
 * inference (Zod discussion #670), which is the entire point: without them the
 * field keys widen to `string` and the compile-time checking evaporates.
 */
export function defineBlock<
  TConfig extends z.ZodType,
  const TInputs extends Record<string, InputPortDecl>,
  const TOutputs extends Record<string, OutputPortDecl>,
>(spec: {
  readonly type: string;
  readonly config: TConfig;
  readonly inputs: TInputs;
  readonly outputs: TOutputs;
  readonly manifest?: (config: z.infer<TConfig>) => ManifestContribution;
  readonly lower: (
    config: z.infer<TConfig>,
    ctx: TypedLoweringContext<TInputs>,
  ) => LoweredBlock;
}): BlockDefinition<z.infer<TConfig>, z.infer<TConfig>> {
  const contract: ZBlockContract = {
    inputs: toBindings(spec.inputs, 'in'),
    outputs: toBindings(spec.outputs, 'out'),
  };

  return {
    type: spec.type,
    contract,
    readConfig: (raw, diagnostics) => {
      const parsed = spec.config.safeParse(raw);
      if (parsed.success) return parsed.data;
      for (const issue of parsed.error.issues) {
        const path = issue.path.length > 0 ? `config.${issue.path.join('.')}: ` : '';
        diagnostics.push({
          severity: 'error',
          message: `[${spec.type}] ${path}${issue.message}`,
        });
      }
      return null;
    },
    buildManifestContribution: spec.manifest ?? (() => ({})),
    buildLowerArgs: (config) => config,
    // The walker hands us the wide LoweringContext; the contract guarantees the
    // declared fields are present, so we refine the view to the typed one at
    // this single seam rather than threading a generic ctx through the walker.
    lower: (args, ctx) => spec.lower(args, ctx as TypedLoweringContext<TInputs>),
  };
}
