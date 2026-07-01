/**
 * Behavioral tests for the ScenePlan → Three scene-graph realizer.
 *
 * These assert WHAT realization produces (a scene with the right instanced
 * draw, camera framing, declared inputs) and that a malformed plan fails LOUDLY
 * — never how the TSL graph is shaped internally. Realization is pure CPU work,
 * so no GPU device is needed: the actual draw is proven by ulu.5's `--no-headless`
 * e2e, not here.
 */

import { InstancedMesh, MeshBasicNodeMaterial, OrthographicCamera, Texture } from 'three/webgpu';
import { describe, it, expect } from 'vitest';

import {
  SCENE_PLAN_VERSION,
  add,
  defineScenePlan,
  div,
  floor,
  geometryRef,
  input,
  intrinsic,
  konst,
  materialRef,
  mod,
  mul,
  sceneObjectRef,
  textureRef,
  type DrawItem,
  type MaterialDef,
  type SceneObject,
  type ScenePlan,
} from '../../../scene-plan';
import { assetId } from '../../../../core/ids';
import { realizeScenePlan, reconcileScenePlan } from '../scene-plan-realizer';

/** The `Grid of Squares` first proof target, built through the public API. */
function buildGridPlan(overrides?: { count?: number }): ScenePlan {
  const square = geometryRef('grid:square');
  const unlit = materialRef('grid:unlit-hsl');
  const grid = sceneObjectRef('grid:object');
  const index = intrinsic('index');
  const rank = intrinsic('rank');
  const time = input('time');
  const col = mod(index, konst(10));
  const row = floor(div(index, konst(10)));

  return defineScenePlan({
    version: SCENE_PLAN_VERSION,
    resources: {
      geometries: { [square]: { kind: 'rectangle', width: 0.08, height: 0.08 } },
      materials: {
        [unlit]: {
          kind: 'unlitColor',
          color: { space: 'hsl', h: add(rank, mul(time, konst(0.2))), s: konst(0.8), l: konst(0.6) },
        },
      },
      textures: {},
      computeResources: {},
      postChains: {},
    },
    objects: {
      [grid]: {
        geometry: square,
        material: unlit,
        instancing: {
          count: overrides?.count ?? 100,
          transform: {
            positionX: mul(col, konst(0.1)),
            positionY: mul(row, konst(0.1)),
            rotation: add(mul(index, konst(0.5)), mul(time, konst(2.0))),
          },
        },
      },
    },
    render: {
      camera: { kind: 'orthographic', halfExtentX: 0.6, halfExtentY: 0.6 },
      inputs: ['time'],
      draws: [{ target: 'previewCanvas', object: grid }],
      postChain: null,
    },
  });
}

describe('realizeScenePlan — Grid of Squares', () => {
  it('realizes one instanced mesh with the declared instance count', () => {
    const realized = realizeScenePlan(buildGridPlan({ count: 100 }));
    const meshes = realized.scene.children.filter((c): c is InstancedMesh => c instanceof InstancedMesh);
    expect(meshes).toHaveLength(1);
    expect(meshes[0].count).toBe(100);
    realized.dispose();
  });

  it('shades the instances with an unlit color NodeMaterial carrying color + position graphs', () => {
    const realized = realizeScenePlan(buildGridPlan());
    const mesh = realized.scene.children.find((c): c is InstancedMesh => c instanceof InstancedMesh)!;
    expect(mesh.material).toBeInstanceOf(MeshBasicNodeMaterial);
    const material = mesh.material as MeshBasicNodeMaterial;
    // Per-instance color and placement are TSL graphs, not CPU payload bags.
    expect(material.colorNode).not.toBeNull();
    expect(material.positionNode).not.toBeNull();
    realized.dispose();
  });

  it('frames the scene with an orthographic camera matching the plan half-extents', () => {
    const realized = realizeScenePlan(buildGridPlan());
    expect(realized.camera).toBeInstanceOf(OrthographicCamera);
    expect(realized.camera.left).toBe(-0.6);
    expect(realized.camera.right).toBe(0.6);
    expect(realized.camera.top).toBe(0.6);
    expect(realized.camera.bottom).toBe(-0.6);
    realized.dispose();
  });

  it('exposes one runtime uniform per declared input channel', () => {
    const realized = realizeScenePlan(buildGridPlan());
    expect([...realized.inputs.keys()]).toEqual(['time']);
    realized.dispose();
  });

  it('neutralizes per-instance matrices to identity so the material owns placement', () => {
    const realized = realizeScenePlan(buildGridPlan({ count: 3 }));
    const mesh = realized.scene.children.find((c): c is InstancedMesh => c instanceof InstancedMesh)!;
    // A zero matrix (the default allocation) would collapse instances; identity
    // means placement is delegated entirely to the material's positionNode.
    expect(mesh.instanceMatrix.array.slice(0, 16)).toEqual(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
    realized.dispose();
  });
});

/** A single textured quad whose material samples a resolved texture. */
function buildTexturedPlan(): ScenePlan {
  const quad = geometryRef('tile:quad');
  const textured = materialRef('tile:textured');
  const tex = textureRef('tile:texture');
  const object = sceneObjectRef('tile:object');
  return defineScenePlan({
    version: SCENE_PLAN_VERSION,
    resources: {
      geometries: { [quad]: { kind: 'rectangle', width: 0.1, height: 0.1 } },
      materials: { [textured]: { kind: 'texturedUnlit', texture: tex } },
      textures: { [tex]: { kind: 'asset', assetId: assetId('checker') } },
      computeResources: {},
      postChains: {},
    },
    objects: {
      [object]: {
        geometry: quad,
        material: textured,
        instancing: { count: 4, transform: { positionX: konst(0), positionY: konst(0), rotation: input('time') } },
      },
    },
    render: {
      camera: { kind: 'orthographic', halfExtentX: 1, halfExtentY: 1 },
      inputs: ['time'],
      draws: [{ target: 'previewCanvas', object }],
      postChain: null,
    },
  });
}

describe('realizeScenePlan — textured material', () => {
  it('shades a textured-unlit material from the resolved texture', () => {
    const resolved = new Map([[textureRef('tile:texture'), new Texture()]]);
    const realized = realizeScenePlan(buildTexturedPlan(), resolved);
    const mesh = realized.scene.children.find((c): c is InstancedMesh => c instanceof InstancedMesh)!;
    const material = mesh.material as MeshBasicNodeMaterial;
    expect(material.colorNode).not.toBeNull();
    realized.dispose();
  });

  it('fails loudly when a referenced texture was not resolved by the bridge', () => {
    expect(() => realizeScenePlan(buildTexturedPlan(), new Map())).toThrow(
      /texture .* was not resolved by the loading bridge/,
    );
  });
});

/** A single quad shaded by sampling a color LUT at a per-instance coord. */
function buildLutPlan(): ScenePlan {
  const quad = geometryRef('lut:quad');
  const lutMat = materialRef('lut:material');
  const lutTex = textureRef('lut:texture');
  const object = sceneObjectRef('lut:object');
  return defineScenePlan({
    version: SCENE_PLAN_VERSION,
    resources: {
      geometries: { [quad]: { kind: 'rectangle', width: 0.1, height: 0.1 } },
      materials: { [lutMat]: { kind: 'unlitColorLut', texture: lutTex, coord: intrinsic('rank') } },
      textures: {
        [lutTex]: { kind: 'data', width: 2, height: 1, pixels: [0.6, 0.1, -0.05, 1, 0.8, -0.1, 0.05, 1], filter: 'linear' },
      },
      computeResources: {},
      postChains: {},
    },
    objects: {
      [object]: {
        geometry: quad,
        material: lutMat,
        instancing: { count: 4, transform: { positionX: konst(0), positionY: konst(0), rotation: konst(0) } },
      },
    },
    render: {
      camera: { kind: 'orthographic', halfExtentX: 1, halfExtentY: 1 },
      inputs: [],
      draws: [{ target: 'previewCanvas', object }],
      postChain: null,
    },
  });
}

describe('realizeScenePlan — unlitColorLut material', () => {
  it('shades by sampling the resolved LUT texture (color node present)', () => {
    const resolved = new Map([[textureRef('lut:texture'), new Texture()]]);
    const realized = realizeScenePlan(buildLutPlan(), resolved);
    const mesh = realized.scene.children.find((c): c is InstancedMesh => c instanceof InstancedMesh)!;
    const material = mesh.material as MeshBasicNodeMaterial;
    expect(material.colorNode).not.toBeNull();
    realized.dispose();
  });

  it('fails loudly when the LUT texture was not resolved by the bridge', () => {
    expect(() => realizeScenePlan(buildLutPlan(), new Map())).toThrow(
      /texture .* was not resolved by the loading bridge/,
    );
  });
});

describe('realizeScenePlan — loud failure on malformed plans', () => {
  it('rejects an incompatible plan version', () => {
    const plan = { ...buildGridPlan(), version: 999 } as unknown as ScenePlan;
    expect(() => realizeScenePlan(plan)).toThrow(/incompatible ScenePlan version/);
  });

  it('rejects a dangling geometry handle', () => {
    const plan = buildGridPlan();
    const broken: ScenePlan = {
      ...plan,
      resources: { ...plan.resources, geometries: {} },
    };
    expect(() => realizeScenePlan(broken)).toThrow(/geometry resource .* is not defined/);
  });

  it('rejects a dangling scene-object handle', () => {
    const plan = buildGridPlan();
    const broken: ScenePlan = { ...plan, objects: {} };
    expect(() => realizeScenePlan(broken)).toThrow(/scene object .* is not defined/);
  });

  it('rejects a non-positive instance count', () => {
    expect(() => realizeScenePlan(buildGridPlan({ count: 0 }))).toThrow(/non-positive instance count/);
  });
});

/**
 * A plan with one instanced object per named ref. Each object's hue offset is a
 * baked const, so changing it changes the object's structure (its TSL graph),
 * while a stable ref + identical spec means the realized object is reusable.
 */
function buildScenePlan(specs: Record<string, { count: number; hue: number }>): ScenePlan {
  const square = geometryRef('shared:square');
  const time = input('time');
  const index = intrinsic('index');
  const materials: Record<string, MaterialDef> = {};
  const objects: Record<string, SceneObject> = {};
  const draws: DrawItem[] = [];
  for (const [name, spec] of Object.entries(specs)) {
    const matRef = materialRef(`${name}:unlit`);
    const objRef = sceneObjectRef(name);
    materials[matRef] = {
      kind: 'unlitColor',
      color: { space: 'hsl', h: konst(spec.hue), s: konst(0.8), l: konst(0.6) },
    };
    objects[objRef] = {
      geometry: square,
      material: matRef,
      instancing: {
        count: spec.count,
        transform: {
          positionX: mul(index, konst(0.1)),
          positionY: konst(0),
          rotation: mul(time, konst(2.0)),
        },
      },
    };
    draws.push({ target: 'previewCanvas', object: objRef });
  }
  return defineScenePlan({
    version: SCENE_PLAN_VERSION,
    resources: {
      geometries: { [square]: { kind: 'rectangle', width: 0.08, height: 0.08 } },
      materials: materials as ScenePlan['resources']['materials'],
      textures: {},
      computeResources: {},
      postChains: {},
    },
    objects: objects as ScenePlan['objects'],
    render: {
      camera: { kind: 'orthographic', halfExtentX: 1, halfExtentY: 1 },
      inputs: ['time'],
      draws,
      postChain: null,
    },
  });
}

function meshFor(scene: RealizedSceneLike, ref: string): InstancedMesh | undefined {
  return scene.objects.get(sceneObjectRef(ref))?.mesh;
}

// Minimal structural view of the realized scene the reuse tests assert against.
type RealizedSceneLike = ReturnType<typeof realizeScenePlan>;

describe('reconcileScenePlan — live-edit continuity', () => {
  it('reuses the same live Three object when an equivalent plan is reinstalled', () => {
    // time-pure tier: a recompile that produces a structurally identical plan
    // must keep the live mesh (its compiled TSL graph + instance buffers), so
    // time-driven animation does not restart.
    const prev = realizeScenePlan(buildScenePlan({ grid: { count: 25, hue: 0.3 } }));
    const meshBefore = meshFor(prev, 'grid');

    const next = reconcileScenePlan(prev, buildScenePlan({ grid: { count: 25, hue: 0.3 } }));
    expect(meshFor(next, 'grid')).toBe(meshBefore);
    next.dispose();
  });

  it('preserves the runtime input uniform node across an equivalent reinstall', () => {
    // The reused object's TSL graph captured the prev uniform node; that exact
    // node must remain the one the renderer writes each frame, or the reused
    // mesh would freeze at its last value.
    const prev = realizeScenePlan(buildScenePlan({ grid: { count: 25, hue: 0.3 } }));
    const timeBefore = prev.inputs.get('time');

    const next = reconcileScenePlan(prev, buildScenePlan({ grid: { count: 25, hue: 0.3 } }));
    expect(next.inputs.get('time')).toBe(timeBefore);
    next.dispose();
  });

  it('rebuilds only the object whose structure changed, reusing the rest', () => {
    // config tier: changing one object's baked const rebuilds that object;
    // unchanged siblings keep their live mesh.
    const prev = realizeScenePlan(
      buildScenePlan({ a: { count: 25, hue: 0.3 }, b: { count: 16, hue: 0.7 } }),
    );
    const meshA = meshFor(prev, 'a');
    const meshB = meshFor(prev, 'b');

    const next = reconcileScenePlan(
      prev,
      buildScenePlan({ a: { count: 25, hue: 0.3 }, b: { count: 16, hue: 0.9 } }),
    );
    expect(meshFor(next, 'a'), 'unchanged object should be reused').toBe(meshA);
    expect(meshFor(next, 'b'), 'changed object should be rebuilt').not.toBe(meshB);
    next.dispose();
  });

  it('rebuilds an object whose instance count changed', () => {
    const prev = realizeScenePlan(buildScenePlan({ grid: { count: 25, hue: 0.3 } }));
    const meshBefore = meshFor(prev, 'grid');

    const next = reconcileScenePlan(prev, buildScenePlan({ grid: { count: 36, hue: 0.3 } }));
    expect(meshFor(next, 'grid')).not.toBe(meshBefore);
    expect(meshFor(next, 'grid')!.count).toBe(36);
    next.dispose();
  });

  it('builds an added object and reuses the existing one (topology grows)', () => {
    const prev = realizeScenePlan(buildScenePlan({ a: { count: 25, hue: 0.3 } }));
    const meshA = meshFor(prev, 'a');

    const next = reconcileScenePlan(
      prev,
      buildScenePlan({ a: { count: 25, hue: 0.3 }, b: { count: 9, hue: 0.7 } }),
    );
    expect(meshFor(next, 'a'), 'existing object reused').toBe(meshA);
    expect(meshFor(next, 'b'), 'added object realized').toBeInstanceOf(InstancedMesh);
    expect(next.scene.children).toContain(meshFor(next, 'b'));
    next.dispose();
  });

  it('disposes and removes an object the new plan no longer draws (topology shrinks)', () => {
    const prev = realizeScenePlan(
      buildScenePlan({ a: { count: 25, hue: 0.3 }, b: { count: 9, hue: 0.7 } }),
    );
    const meshA = meshFor(prev, 'a');
    const meshB = meshFor(prev, 'b')!;

    const next = reconcileScenePlan(prev, buildScenePlan({ a: { count: 25, hue: 0.3 } }));
    expect(meshFor(next, 'a'), 'kept object reused').toBe(meshA);
    expect(next.objects.has(sceneObjectRef('b')), 'removed object dropped from map').toBe(false);
    expect(next.scene.children, 'removed mesh detached from scene').not.toContain(meshB);
    next.dispose();
  });

  it('reuses the camera when the camera plan is unchanged', () => {
    const prev = realizeScenePlan(buildScenePlan({ grid: { count: 25, hue: 0.3 } }));
    const cameraBefore = prev.camera;

    const next = reconcileScenePlan(prev, buildScenePlan({ grid: { count: 25, hue: 0.3 } }));
    expect(next.camera).toBe(cameraBefore);
    next.dispose();
  });
});
