/**
 * src/pillars/scene/assemble.ts
 *
 * Joins resolved block contributions into a normalized `ScenePlan`.
 *
 * Each draw block is joined to the instance bundle feeding its primary edge: the
 * draw's shell (geometry, material kind, camera) plus the resolved bundle
 * (count, transform, color) become one `SceneObject` + `DrawItem`. The bundle is
 * resolved by folding any modifier chain back to its instance source, so a
 * source→modifier→…→draw chain and a direct source→draw wire assemble the same
 * way. Resources are normalized into ref-keyed tables.
 *
 * [LAW:one-source-of-truth] Each geometry/material is defined exactly once in
 *   its table and referenced by handle from the scene object — no inline
 *   duplication.
 * [LAW:no-silent-failure] A draw with no primary edge, or whose source is not an
 *   instance source, is a surfaced error — never a silently-dropped draw.
 */

import type { PillarEdge } from '../types';
import {
  SCENE_PLAN_VERSION,
  defineScenePlan,
  geometryRef,
  materialRef,
  sceneObjectRef,
  textureRef,
  type CameraPlan,
  type DrawItem,
  type GeometryDef,
  type GeometryRef,
  type MaterialDef,
  type MaterialRef,
  type ScenePlan,
  type SceneObject,
  type SceneObjectRef,
  type TextureDef,
  type TextureRef,
} from '../../render/scene-plan';
import type { InstanceBundle, MaterialShell, SceneContribution } from './scene-block';
import type { ColorPlan } from './color';
import { collectInputChannels, materialChannels } from './inputs';

export type SceneCompileResult =
  | { readonly kind: 'ok'; readonly plan: ScenePlan }
  | { readonly kind: 'error'; readonly errors: readonly string[] };

/**
 * The deferred resource tables: compute and post are owned by later tickets
 * (TSL compute/post per three-fork-deltas.md). Textures are now produced from
 * textured material shells (the asset bridge, ulu.4).
 *
 * [LAW:dataflow-not-control-flow] Deferred capabilities are present-but-empty
 *   collections, not absent fields — the shape is fixed; only contents vary.
 */
function emptyDeferredResources(): Pick<ScenePlan['resources'], 'computeResources' | 'postChains'> {
  return { computeResources: {}, postChains: {} };
}

/**
 * Join a draw's material shell to its upstream instance bundle, minting any
 * texture resource the shell references. A textured shell adds one entry to the
 * shared `textures` table and refers to it by handle; an unlit shell pulls its
 * per-instance color from the bundle.
 *
 * [LAW:one-source-of-truth] The texture is defined once in the table, keyed by a
 *   minted handle; the material references it by that handle only.
 * [LAW:types-are-the-program] Exhaustive over the material shell union; a new
 *   material kind is a compile error here until its join is declared.
 */
function joinMaterial(
  drawId: string,
  shell: MaterialShell,
  bundle: InstanceBundle,
  textures: Record<TextureRef, TextureDef>,
): MaterialDef {
  switch (shell.kind) {
    case 'unlitColor':
      return lowerUnlitColor(drawId, bundle.color, textures);
    case 'texturedUnlit': {
      const texRef = textureRef(`${drawId}:texture`);
      textures[texRef] = { kind: 'asset', assetId: shell.assetId };
      return { kind: 'texturedUnlit', texture: texRef };
    }
    default:
      return assertNever(shell);
  }
}

/**
 * Lower the bundle's {@link ColorPlan} into the material for an unlit draw. A
 * per-channel-math `binding` becomes a `unlitColor` material directly; a `lut`
 * color mints a `{kind:'data'}` texture (the baked OKLab ramp) in the shared
 * table and becomes a `unlitColorLut` material sampling it by the per-instance
 * coord — the same normalize-resource-then-refer-by-handle move a textured shell
 * makes.
 *
 * [LAW:single-enforcer] The LUT texture is minted in exactly one place; the
 *   material references it by the handle minted here, never inlines its pixels.
 * [LAW:types-are-the-program] Exhaustive over the color-plan union; a new color
 *   representation is a compile error here until its lowering is declared.
 */
function lowerUnlitColor(
  drawId: string,
  color: ColorPlan,
  textures: Record<TextureRef, TextureDef>,
): MaterialDef {
  switch (color.kind) {
    case 'binding':
      return { kind: 'unlitColor', color: color.binding };
    case 'lut': {
      const texRef = textureRef(`${drawId}:lut`);
      textures[texRef] = {
        kind: 'data',
        width: color.lut.width,
        height: 1,
        pixels: color.lut.pixels,
        filter: color.lut.filter,
      };
      return { kind: 'unlitColorLut', texture: texRef, coord: color.coord };
    }
    default:
      return assertNever(color);
  }
}

function assertNever(value: never): never {
  throw new Error(`[scene] unhandled material shell: ${JSON.stringify(value)}`);
}

/**
 * Resolve the instance bundle a block feeds downstream by folding the modifier
 * chain back to its instance source. A source is the base case (its bundle); a
 * modifier resolves its own `primary` upstream and applies its transform to it.
 *
 * [LAW:dataflow-not-control-flow] One generic fold over the chain: a modifier is
 *   a value carrying `apply`, not a per-type branch here — adding a modifier
 *   block adds no code path to this walk.
 * [LAW:no-silent-failure] A chain that dangles, cycles, or bottoms out at a draw
 *   (which produces no bundle) is a surfaced error, never a silently-dropped or
 *   default bundle.
 */
function resolveBundle(
  blockId: string,
  edges: readonly PillarEdge[],
  contributions: ReadonlyMap<string, SceneContribution>,
  errors: string[],
  visiting: ReadonlySet<string>,
): InstanceBundle | null {
  if (visiting.has(blockId)) {
    errors.push(`[scene] instance chain has a cycle through block '${blockId}'`);
    return null;
  }
  const contribution = contributions.get(blockId);
  if (contribution === undefined) {
    errors.push(`[scene] instance chain references unknown block '${blockId}'`);
    return null;
  }

  switch (contribution.role) {
    case 'instanceSource':
      return contribution.bundle;
    case 'modifier': {
      const primaryEdge = edges.find((e) => e.target === blockId && e.role === 'primary');
      if (!primaryEdge) {
        errors.push(`[scene] modifier block '${blockId}' has no primary input edge`);
        return null;
      }
      const upstream = resolveBundle(
        primaryEdge.source,
        edges,
        contributions,
        errors,
        new Set(visiting).add(blockId),
      );
      if (upstream === null) return null;
      return contribution.apply(upstream);
    }
    case 'draw':
      errors.push(
        `[scene] instance chain ends at draw block '${blockId}', which is not an instance source`,
      );
      return null;
    default:
      return assertNever(contribution);
  }
}

/**
 * Reconcile the cameras declared by every draw into the single scene camera.
 * One scene has one camera; if draws disagree, that is a loud error rather than
 * an arbitrary winner.
 */
function reconcileCamera(cameras: readonly CameraPlan[], errors: string[]): CameraPlan | null {
  if (cameras.length === 0) return null;
  const [first, ...rest] = cameras;
  const firstKey = JSON.stringify(first);
  for (const camera of rest) {
    if (JSON.stringify(camera) !== firstKey) {
      errors.push('[scene] draw blocks declare conflicting cameras; a scene has one camera');
      return null;
    }
  }
  return first;
}

export function assembleScenePlan(
  edges: readonly PillarEdge[],
  contributions: ReadonlyMap<string, SceneContribution>,
): SceneCompileResult {
  const errors: string[] = [];

  const geometries: Record<GeometryRef, GeometryDef> = {};
  const materials: Record<MaterialRef, MaterialDef> = {};
  const textures: Record<TextureRef, TextureDef> = {};
  const objects: Record<SceneObjectRef, SceneObject> = {};
  const draws: DrawItem[] = [];
  const cameras: CameraPlan[] = [];

  const drawEntries = [...contributions].filter(
    (entry): entry is [string, Extract<SceneContribution, { role: 'draw' }>] =>
      entry[1].role === 'draw',
  );
  if (drawEntries.length === 0) {
    errors.push('[scene] no draw block: the patch renders nothing');
  }

  for (const [drawId, contribution] of drawEntries) {
    const primaryEdge = edges.find((e) => e.target === drawId && e.role === 'primary');
    if (!primaryEdge) {
      errors.push(`[scene] draw block '${drawId}' has no primary input edge`);
      continue;
    }
    // Resolve the bundle feeding this draw by folding any modifier chain back to
    // its instance source. A direct source→draw wire is the zero-modifier case.
    const bundle = resolveBundle(primaryEdge.source, edges, contributions, errors, new Set());
    if (bundle === null) continue;

    const { shell } = contribution;

    const geoRef = geometryRef(`${drawId}:geometry`);
    const matRef = materialRef(`${drawId}:material`);
    const objRef = sceneObjectRef(drawId);

    geometries[geoRef] = shell.geometry;
    // Join the material shell to the bundle, minting any texture it references.
    materials[matRef] = joinMaterial(drawId, shell.material, bundle, textures);
    objects[objRef] = {
      geometry: geoRef,
      material: matRef,
      instancing: { count: bundle.count, transform: bundle.transform },
    };
    draws.push({ target: shell.target, object: objRef });
    cameras.push(shell.camera);
  }

  const camera = reconcileCamera(cameras, errors);

  if (errors.length > 0 || camera === null) {
    return { kind: 'error', errors };
  }

  // Inputs are derived from every per-instance expression the plan contains.
  const exprs = [
    ...Object.values(objects).flatMap((o) => [
      o.instancing.transform.positionX,
      o.instancing.transform.positionY,
      o.instancing.transform.rotation,
    ]),
    ...Object.values(materials).flatMap((m) => materialChannels(m)),
  ];

  const plan = defineScenePlan({
    version: SCENE_PLAN_VERSION,
    resources: { geometries, materials, textures, ...emptyDeferredResources() },
    objects,
    render: {
      camera,
      inputs: collectInputChannels(exprs),
      draws,
      postChain: null,
    },
  });

  return { kind: 'ok', plan };
}
