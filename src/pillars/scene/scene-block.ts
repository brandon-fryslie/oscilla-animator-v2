/**
 * src/pillars/scene/scene-block.ts
 *
 * The ABI between scene-block authors and the ScenePlan lowering.
 *
 * Scope source: design-docs/three-fork-integration-proposal.md §2.1, §2.2, §3.
 * Ownership/seam canon: design-docs/three-migration-backend-canon.md
 *   (Oscilla owns "compile/lower stages from authored graph to backend-neutral
 *   execution data"; ScenePlan is that data).
 * Replacement narrative: design-docs/three-migration-scene-plan.md §"Concept
 *   Mapping".
 *
 * This is the NEW lowering ABI for the Three migration. It is deliberately NOT
 * the GPU-IR `BlockDefinition` (src/pillars/block-api.ts): that ABI's `lower`
 * produces `ExprIR`/`RosterEntry` for the frozen Rust-boundary payload (canon
 * §"Dead Concepts"). A scene block instead `contribute`s backend-neutral
 * ScenePlan fragments.
 *
 * [LAW:decomposition] A scene block is a genuinely different part from a GPU-IR
 *   block — different target representation, different seam — so it gets its own
 *   ABI rather than being forced through the GPU-IR contract.
 * [LAW:effects-at-boundaries] `contribute` is pure: declarative config in,
 *   ScenePlan-fragment description out. Nothing here touches a renderer.
 * [LAW:types-are-the-program] The contribution is a discriminated union on
 *   `role`; the lowering joins the parts by role without re-deriving block kind.
 */

import type { AssetId } from '../../core/ids';
import type {
  CameraPlan,
  ColorBinding,
  GeometryDef,
  RenderTarget,
  TransformBinding,
} from '../../render/scene-plan';

// ---------------------------------------------------------------------------
// Diagnostics — the loud-failure channel for config validation.
// ---------------------------------------------------------------------------

/**
 * A config-validation failure. There is no `warning`/`info` severity here: a
 * scene block either has a usable config or it does not.
 *
 * [LAW:no-silent-failure] An invalid config is a collected, surfaced error, not
 *   a silently-defaulted value that renders the wrong scene.
 */
export interface SceneDiagnostic {
  readonly message: string;
  readonly blockId: string;
}

// ---------------------------------------------------------------------------
// Contributions — what a block hands the lowering, before parts are joined.
// ---------------------------------------------------------------------------

/**
 * The per-instance field bundle an instance-source block emits: how many
 * instances exist and the fields that vary across them. Each field is a
 * `PlanExpr` (carried inside `TransformBinding` / `ColorBinding`), so it may
 * reference `index`/`rank` intrinsics and runtime inputs.
 *
 * [LAW:one-source-of-truth] The bundle is the canonical per-instance data; the
 *   draw block wraps it (geometry, material shell, camera) without re-deriving
 *   any of these fields.
 */
export interface InstanceBundle {
  readonly count: number;
  readonly transform: TransformBinding;
  readonly color: ColorBinding;
}

/**
 * The surface a draw block wraps around its instance bundle.
 *
 * - `unlitColor` takes its per-instance color from the upstream `InstanceBundle`;
 *   the shell carries no color of its own.
 * - `texturedUnlit` samples a texture asset (named by {@link AssetId}); the
 *   lowering mints the plan's `TextureRef` and the textures-table entry from it.
 *
 * [LAW:no-mode-explosion] Material kinds are variants of this union; the
 *   lowering's join stays a total switch as kinds are added.
 */
export type MaterialShell =
  | { readonly kind: 'unlitColor' }
  | { readonly kind: 'texturedUnlit'; readonly assetId: AssetId };

/**
 * What a draw (sink) block contributes before it is joined to its instance
 * bundle: the rendering shell around the per-instance data.
 */
export interface DrawShell {
  readonly geometry: GeometryDef;
  readonly material: MaterialShell;
  readonly camera: CameraPlan;
  readonly target: RenderTarget;
}

/**
 * The discriminated contribution every scene block produces. The lowering
 * joins an `instanceSource` to the `draw` that reads it (via the primary edge).
 */
export type SceneContribution =
  | { readonly role: 'instanceSource'; readonly bundle: InstanceBundle }
  | { readonly role: 'draw'; readonly shell: DrawShell };

// ---------------------------------------------------------------------------
// Block definition — the contract every scene block file exports.
// ---------------------------------------------------------------------------

/**
 * The shape every scene-block file exports as a named constant.
 *
 * `readConfig` validates/narrows raw authored config (loud diagnostics on bad
 * input, never throws on user input). `contribute` is the pure mapping from the
 * narrowed config to a backend-neutral ScenePlan fragment.
 */
export interface SceneBlockDefinition<TConfig> {
  readonly type: string;
  readonly role: SceneContribution['role'];
  readonly readConfig: (
    raw: Readonly<Record<string, unknown>>,
    blockId: string,
    diagnostics: SceneDiagnostic[],
  ) => TConfig | null;
  readonly contribute: (config: TConfig) => SceneContribution;
}

// ---------------------------------------------------------------------------
// Registry — value-constructor, no module-level singleton (mirrors frontend).
// ---------------------------------------------------------------------------

export interface SceneRegistry {
  readonly get: (type: string) => SceneBlockDefinition<unknown> | undefined;
}

export function buildSceneRegistry(
  blocks: readonly SceneBlockDefinition<unknown>[],
): SceneRegistry {
  const byType = new Map<string, SceneBlockDefinition<unknown>>();
  for (const block of blocks) {
    if (byType.has(block.type)) {
      throw new Error(`[scene] Duplicate scene block type in registry: '${block.type}'`);
    }
    byType.set(block.type, block);
  }
  return { get: (type) => byType.get(type) };
}

// ---------------------------------------------------------------------------
// Config-reading helpers — one loud, validated read per primitive.
// ---------------------------------------------------------------------------

/**
 * Read a finite number from raw config, pushing a diagnostic if absent or not a
 * finite number. Returns null on failure so the caller can keep collecting
 * other field errors before bailing.
 */
export function readFiniteNumber(
  raw: Readonly<Record<string, unknown>>,
  key: string,
  blockId: string,
  diagnostics: SceneDiagnostic[],
): number | null {
  const value = raw[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    diagnostics.push({
      blockId,
      message: `[scene] block '${blockId}': config '${key}' must be a finite number`,
    });
    return null;
  }
  return value;
}

/** Read a number that must be strictly positive (e.g. a spacing or size). */
export function readPositiveNumber(
  raw: Readonly<Record<string, unknown>>,
  key: string,
  blockId: string,
  diagnostics: SceneDiagnostic[],
): number | null {
  const value = readFiniteNumber(raw, key, blockId, diagnostics);
  if (value === null) return null;
  if (value <= 0) {
    diagnostics.push({
      blockId,
      message: `[scene] block '${blockId}': config '${key}' must be > 0 (got ${value})`,
    });
    return null;
  }
  return value;
}

/**
 * Read an optional non-empty string (e.g. an asset id reference). Absent config
 * returns `undefined` (a legitimate "not set"); a present-but-non-string or
 * empty value is a loud diagnostic and returns `null`.
 *
 * [LAW:dataflow-not-control-flow] The three outcomes are distinct values
 *   (`undefined` set-absent, `null` invalid, the string when valid), so the
 *   caller selects a material shell from the value rather than guessing.
 */
export function readOptionalString(
  raw: Readonly<Record<string, unknown>>,
  key: string,
  blockId: string,
  diagnostics: SceneDiagnostic[],
): string | null | undefined {
  const value = raw[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) {
    diagnostics.push({
      blockId,
      message: `[scene] block '${blockId}': config '${key}' must be a non-empty string when present`,
    });
    return null;
  }
  return value;
}

/** Read a positive integer (e.g. a grid row/column count). */
export function readPositiveInt(
  raw: Readonly<Record<string, unknown>>,
  key: string,
  blockId: string,
  diagnostics: SceneDiagnostic[],
): number | null {
  const value = readFiniteNumber(raw, key, blockId, diagnostics);
  if (value === null) return null;
  if (!Number.isInteger(value) || value <= 0) {
    diagnostics.push({
      blockId,
      message: `[scene] block '${blockId}': config '${key}' must be a positive integer (got ${value})`,
    });
    return null;
  }
  return value;
}
