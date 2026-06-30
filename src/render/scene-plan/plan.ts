/**
 * src/render/scene-plan/plan.ts
 *
 * The backend-neutral ScenePlan: the primary compiler→renderer assembly target
 * for the Three migration. Replaces PipelineInstallPayload as the thing the
 * compiler produces and the renderer consumes.
 *
 * Scope source: design-docs/three-fork-integration-proposal.md §2.2, §4.
 * Ownership/seam canon: design-docs/three-migration-backend-canon.md.
 * Proof target shape: design-docs/three-migration-first-proof-contract.md.
 * Replacement narrative: design-docs/three-migration-scene-plan.md.
 *
 * [LAW:one-source-of-truth] ScenePlan is THE assembly target. It does not wrap,
 *   embed, or round-trip to PipelineInstallPayload; the two are alternative
 *   targets and the Rust-boundary payload is frozen legacy (canon §"Dead
 *   Concepts"). There is no dual ownership.
 * [LAW:locality-or-seam] Every renderer-specific decision (which Three class
 *   realizes a geometry, how a material compiles to TSL) lives behind the
 *   renderer seam. This module names resources and their composition only.
 * [LAW:types-are-the-program] Resources are normalized: each is defined once in
 *   a table keyed by its ref, and referenced everywhere else by that handle.
 */

import type { AssetId } from '../../core/ids';
import type {
  GeometryRef,
  MaterialRef,
  TextureRef,
  SceneObjectRef,
  ComputeResourceRef,
  PostChainRef,
} from './refs';
import type { PlanExpr, PlanInputChannel } from './expr';

/**
 * ScenePlan schema version. The renderer asserts compatibility on install.
 *
 * [LAW:no-silent-failure] An incompatible plan version is an explicit, loud
 *   contract mismatch, not a silently-misread payload.
 */
export const SCENE_PLAN_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Resource definitions — the value type stored in each ref-keyed table.
// ---------------------------------------------------------------------------

/**
 * A geometry resource: the per-object shape, in object-local units. Per-object
 * placement (position, rotation) is applied by the instancing transform, not
 * baked here.
 */
export type GeometryDef =
  | { readonly kind: 'rectangle'; readonly width: number; readonly height: number }
  | { readonly kind: 'point' };

/**
 * A color, expressed in a named color space. Each channel is a PlanExpr, so a
 * channel may be uniform (`const`) or vary per instance / per frame by
 * referencing an intrinsic or input.
 *
 * `oklab` is the perceptual interpolation space (Björn Ottosson's OKLab): `l` is
 * perceived lightness, `a`/`b` the green–red and blue–yellow Cartesian axes.
 * Authored colors enter this space at the seam (`hexColorBinding`) and the
 * renderer converts it back to linear sRGB for display. Mixing/animating color
 * in `oklab` is hue-correct without the muddy midtones of rgb interpolation.
 */
export type ColorBinding =
  | { readonly space: 'hsl'; readonly h: PlanExpr; readonly s: PlanExpr; readonly l: PlanExpr }
  | { readonly space: 'rgb'; readonly r: PlanExpr; readonly g: PlanExpr; readonly b: PlanExpr }
  | {
      readonly space: 'rgba';
      readonly r: PlanExpr;
      readonly g: PlanExpr;
      readonly b: PlanExpr;
      readonly a: PlanExpr;
    }
  | { readonly space: 'oklab'; readonly l: PlanExpr; readonly a: PlanExpr; readonly b: PlanExpr };

/**
 * A material resource: how an object's surface is shaded.
 *
 * - `unlitColor` shades by a per-instance {@link ColorBinding} (no texture).
 * - `texturedUnlit` samples a texture resource (by handle) across the object's
 *   UVs. The texture is resolved from an Oscilla asset by the loading bridge.
 * - `unlitColorLut` shades by *sampling a color lookup table* at a per-instance
 *   `coord`: the LUT is a `{kind:'data'}` texture whose texels are OKLab triples,
 *   and the renderer maps the sampled triple back to linear sRGB (the same
 *   OKLab→display step `unlitColor`'s `oklab` binding uses). This is how a
 *   palette/index/gradient color source ("every dot a different color", a heatmap
 *   ramp) is expressed without a per-channel-math `ColorBinding`: the lookup that
 *   the pure-math expression vocabulary lacks is the texture sample itself.
 *
 * [LAW:dataflow-not-control-flow] The shading model is a discriminated value;
 *   each variant carries exactly the resources it needs, so a textured material
 *   cannot exist without a texture handle and an unlit one cannot reference one.
 */
export type MaterialDef =
  | { readonly kind: 'unlitColor'; readonly color: ColorBinding }
  | { readonly kind: 'texturedUnlit'; readonly texture: TextureRef }
  | { readonly kind: 'unlitColorLut'; readonly texture: TextureRef; readonly coord: PlanExpr };

/** Texture minification/magnification filter for a {@link TextureDef}. */
export type TextureFilter = 'nearest' | 'linear';

/**
 * A texture resource. Two origins:
 *
 * - `asset` — resolved from an Oscilla asset by the loading bridge. `assetId` is
 *   the branded {@link AssetId} the {@link AssetRegistry} resolves to canonical
 *   metadata; the bridge (src/render/webgpu/three/asset-bridge.ts) decodes that
 *   into a Three `Texture`.
 * - `data` — a CPU-built lookup table the compiler bakes inline (e.g. a palette
 *   ramp): `pixels` is a flat `width × height × 4` array of float RGBA channel
 *   values in declaration order. It resolves to no asset, so it is never looked
 *   up in the registry; the bridge builds a `DataTexture` directly from it. The
 *   sampling `filter` (a palette wants `nearest`, a gradient `linear`) is a
 *   property of the resource, applied when the bridge realizes it.
 *
 * The texture table is empty for plans that use no textures (e.g. the Grid of
 * Squares steel thread).
 *
 * [LAW:dataflow-not-control-flow] Texture origin is a discriminated value; an
 *   `asset` texture cannot carry inline pixels and a `data` texture cannot carry
 *   an assetId. The "where does this texture come from" branch lives in the type.
 */
export type TextureDef =
  | { readonly kind: 'asset'; readonly assetId: AssetId }
  | {
      readonly kind: 'data';
      readonly width: number;
      readonly height: number;
      readonly pixels: readonly number[];
      readonly filter: TextureFilter;
    };

/**
 * A compute resource (storage buffer / compute job).
 *
 * DEFERRED (three-fork-deltas.md §3, §4.2): served by TSL compute when a ticket
 *   first needs solver-style work. Defined minimally so the ref is meaningful;
 *   the owning ticket expands it. Empty for the steel thread.
 */
export type ComputeResourceDef = { readonly kind: 'storage'; readonly byteLength: number };

/**
 * A post-processing chain.
 *
 * DEFERRED (three-fork-deltas.md §3): served by Three post nodes when a ticket
 *   first needs postprocessing. The backend resolves each pass id to a Three
 *   post node. Empty for the steel thread.
 */
export type PostChainDef = { readonly kind: 'passes'; readonly passes: readonly string[] };

/**
 * The normalized resource tables. Each resource is defined exactly once here,
 * keyed by its ref; everything else references it by handle.
 */
export interface ScenePlanResources {
  readonly geometries: Readonly<Record<GeometryRef, GeometryDef>>;
  readonly materials: Readonly<Record<MaterialRef, MaterialDef>>;
  readonly textures: Readonly<Record<TextureRef, TextureDef>>;
  readonly computeResources: Readonly<Record<ComputeResourceRef, ComputeResourceDef>>;
  readonly postChains: Readonly<Record<PostChainRef, PostChainDef>>;
}

// ---------------------------------------------------------------------------
// Scene objects — placed renderables that compose resources.
// ---------------------------------------------------------------------------

/**
 * Per-instance affine placement. Each field is a PlanExpr evaluated per
 * instance, so a transform may reference `index`/`rank` intrinsics and runtime
 * inputs. Position is in world units; rotation is in radians about Z.
 *
 * Scale is intentionally absent: the first proof targets vary only position and
 * rotation per instance (proof contract). A uniform shape size lives on the
 * geometry. Per-instance scale is added when a patch first requires it.
 */
export interface TransformBinding {
  readonly positionX: PlanExpr;
  readonly positionY: PlanExpr;
  readonly rotation: PlanExpr;
}

/** Instancing: how many copies of an object exist and how each is placed. */
export interface InstancingPlan {
  readonly count: number;
  readonly transform: TransformBinding;
}

/**
 * A renderable placed in the scene: a geometry shaded by a material, drawn
 * `instancing.count` times. The object's identity is the key under which it is
 * stored in `ScenePlan.objects`, not a field here.
 */
export interface SceneObject {
  readonly geometry: GeometryRef;
  readonly material: MaterialRef;
  readonly instancing: InstancingPlan;
}

// ---------------------------------------------------------------------------
// Render plan — how a frame is drawn from the scene.
// ---------------------------------------------------------------------------

/**
 * The camera framing the scene.
 *
 * One variant today (orthographic 2D); perspective is added when a patch first
 * needs it, as a new variant of this union (the legacy boundary modeled this as
 * a `cameraProjection` flag — here it is a discriminated value).
 */
export interface CameraPlan {
  readonly kind: 'orthographic';
  /** Visible region is [-halfExtentX, +halfExtentX] on X. */
  readonly halfExtentX: number;
  /** Visible region is [-halfExtentY, +halfExtentY] on Y. */
  readonly halfExtentY: number;
}

/** Where a draw item renders to. */
export type RenderTarget = 'previewCanvas';

/** One ordered draw: render a scene object into a target. */
export interface DrawItem {
  readonly target: RenderTarget;
  readonly object: SceneObjectRef;
}

/**
 * The per-frame rendering orchestration: camera, the runtime input channels the
 * plan reads, the ordered draws, and an optional post chain.
 *
 * [LAW:dataflow-not-control-flow] `inputs` is the explicit set of runtime-
 *   updated channels the renderer must feed each frame, declared as data rather
 *   than discovered by walking every expression.
 */
export interface RenderPlan {
  readonly camera: CameraPlan;
  readonly inputs: readonly PlanInputChannel[];
  readonly draws: readonly DrawItem[];
  readonly postChain: PostChainRef | null;
}

// ---------------------------------------------------------------------------
// ScenePlan — the top-level compiled artifact.
// ---------------------------------------------------------------------------

/**
 * The compiled, backend-neutral description of one renderable scene. The
 * compiler (ulu.3) produces it; the Three renderer (ulu.2) consumes it.
 */
export interface ScenePlan {
  readonly version: typeof SCENE_PLAN_VERSION;
  readonly resources: ScenePlanResources;
  readonly objects: Readonly<Record<SceneObjectRef, SceneObject>>;
  readonly render: RenderPlan;
}

/**
 * Identity helper that pins ScenePlan construction to this module.
 *
 * [LAW:single-enforcer] Compiler assembly constructs plans through this helper,
 *   so the canonical shape has one named construction site (mirrors
 *   defineDrawPrepRenderContract in src/render/types.ts).
 */
export function defineScenePlan(plan: ScenePlan): ScenePlan {
  return plan;
}
