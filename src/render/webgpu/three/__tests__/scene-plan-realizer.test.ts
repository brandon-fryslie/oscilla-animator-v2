/**
 * Behavioral tests for the ScenePlan → Three scene-graph realizer.
 *
 * These assert WHAT realization produces (a scene with the right instanced
 * draw, camera framing, declared inputs) and that a malformed plan fails LOUDLY
 * — never how the TSL graph is shaped internally. Realization is pure CPU work,
 * so no GPU device is needed: the actual draw is proven by ulu.5's `--no-headless`
 * e2e, not here.
 */

import { InstancedMesh, MeshBasicNodeMaterial, OrthographicCamera } from 'three/webgpu';
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
  type ScenePlan,
} from '../../../scene-plan';
import { realizeScenePlan } from '../scene-plan-realizer';

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
