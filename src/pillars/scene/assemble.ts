/**
 * src/pillars/scene/assemble.ts
 *
 * Joins resolved block contributions into a normalized `ScenePlan`.
 *
 * Each draw block is joined to the instance source on its primary edge: the
 * draw's shell (geometry, material kind, camera) plus the source's bundle
 * (count, transform, color) become one `SceneObject` + `DrawItem`. Resources
 * are normalized into ref-keyed tables.
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
  type CameraPlan,
  type DrawItem,
  type GeometryDef,
  type GeometryRef,
  type MaterialDef,
  type MaterialRef,
  type ScenePlan,
  type SceneObject,
  type SceneObjectRef,
} from '../../render/scene-plan';
import type { SceneContribution } from './scene-block';
import { collectInputChannels, colorChannels } from './inputs';

export type SceneCompileResult =
  | { readonly kind: 'ok'; readonly plan: ScenePlan }
  | { readonly kind: 'error'; readonly errors: readonly string[] };

/**
 * The deferred resource tables: textures, compute, and post are owned by later
 * tickets (asset bridge ulu.4; TSL compute/post per three-fork-deltas.md).
 *
 * [LAW:dataflow-not-control-flow] Deferred capabilities are present-but-empty
 *   collections, not absent fields — the shape is fixed; only contents vary.
 */
function emptyDeferredResources(): Pick<
  ScenePlan['resources'],
  'textures' | 'computeResources' | 'postChains'
> {
  return { textures: {}, computeResources: {}, postChains: {} };
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
    const source = contributions.get(primaryEdge.source);
    if (!source || source.role !== 'instanceSource') {
      errors.push(
        `[scene] draw block '${drawId}' primary source '${primaryEdge.source}' is not an instance source`,
      );
      continue;
    }

    const { shell } = contribution;
    const { bundle } = source;

    const geoRef = geometryRef(`${drawId}:geometry`);
    const matRef = materialRef(`${drawId}:material`);
    const objRef = sceneObjectRef(drawId);

    geometries[geoRef] = shell.geometry;
    // Join: the material shell's kind + the upstream bundle's per-instance color.
    materials[matRef] = { kind: shell.material.kind, color: bundle.color };
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
    ...Object.values(materials).flatMap((m) => colorChannels(m.color)),
  ];

  const plan = defineScenePlan({
    version: SCENE_PLAN_VERSION,
    resources: { geometries, materials, ...emptyDeferredResources() },
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
