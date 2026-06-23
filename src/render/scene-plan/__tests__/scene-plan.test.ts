/**
 * Contract tests for the backend-neutral ScenePlan.
 *
 * These assert plan SHAPE and HANDLE discipline, never Three implementation
 * details (there are none to assert — that is the point). The centerpiece is
 * building the first proof target, `Grid of Squares`
 * (design-docs/three-migration-first-proof-contract.md §"Required Compiler
 * Capabilities"), entirely through the public ScenePlan API: if the type can
 * represent that patch, ulu.3 has a lowering target and ulu.2 has a contract.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import {
  SCENE_PLAN_VERSION,
  defineScenePlan,
  geometryRef,
  materialRef,
  sceneObjectRef,
  konst,
  input,
  intrinsic,
  floor,
  mul,
  add,
  mod,
  div,
  type ScenePlan,
} from '../index';

const SCENE_PLAN_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Build the `Grid of Squares` proof target: a 10×10 grid of squares with
 * per-instance rotation and HSL color animated over time. Pure index/rank math;
 * no GridLayout block (design-docs/DEMO-PATCHES.md §"Grid of Squares").
 */
function buildGridOfSquares(): ScenePlan {
  const square = geometryRef('grid:square');
  const unlit = materialRef('grid:unlit-hsl');
  const grid = sceneObjectRef('grid:object');

  const index = intrinsic('index');
  const rank = intrinsic('rank');
  const time = input('time');

  // col = mod(index, 10); row = floor(index / 10)
  const col = mod(index, konst(10));
  const row = floor(div(index, konst(10)));

  return defineScenePlan({
    version: SCENE_PLAN_VERSION,
    resources: {
      geometries: { [square]: { kind: 'rectangle', width: 0.08, height: 0.08 } },
      materials: {
        [unlit]: {
          kind: 'unlitColor',
          color: {
            space: 'hsl',
            // hue = rank + time * 0.2
            h: add(rank, mul(time, konst(0.2))),
            s: konst(0.8),
            l: konst(0.6),
          },
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
          count: 100,
          transform: {
            // pos_x = col * 0.1, pos_y = row * 0.1
            positionX: mul(col, konst(0.1)),
            positionY: mul(row, konst(0.1)),
            // rotation = index * 0.5 + time * 2.0
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

describe('ScenePlan — Grid of Squares proof target', () => {
  const plan = buildGridOfSquares();

  it('declares the plan schema version', () => {
    expect(plan.version).toBe(SCENE_PLAN_VERSION);
  });

  it('declares one instance domain with count 100', () => {
    const grid = plan.objects[sceneObjectRef('grid:object')];
    expect(grid.instancing.count).toBe(100);
  });

  it('exposes index and rank as per-instance intrinsics in the transform', () => {
    const grid = plan.objects[sceneObjectRef('grid:object')];
    // rotation = index * 0.5 + time * 2.0 — index intrinsic + time input present.
    expect(JSON.stringify(grid.instancing.transform.rotation)).toContain('"intrinsic"');
    expect(JSON.stringify(grid.instancing.transform.rotation)).toContain('"index"');
  });

  it('binds time as a runtime input channel, not a compile-time constant', () => {
    expect(plan.render.inputs).toContain('time');
    const grid = plan.objects[sceneObjectRef('grid:object')];
    // The time term is an `input`, structurally distinct from a `const`.
    const rotation = JSON.stringify(grid.instancing.transform.rotation);
    expect(rotation).toContain('"input"');
    expect(rotation).toContain('"time"');
  });

  it('references one canonical rectangle geometry resource by handle', () => {
    const grid = plan.objects[sceneObjectRef('grid:object')];
    const geo = plan.resources.geometries[grid.geometry];
    expect(geo.kind).toBe('rectangle');
  });

  it('references one unlit HSL color material by handle', () => {
    const grid = plan.objects[sceneObjectRef('grid:object')];
    const mat = plan.resources.materials[grid.material];
    expect(mat.kind).toBe('unlitColor');
    expect(mat.color.space).toBe('hsl');
  });

  it('emits one draw item targeting the preview canvas', () => {
    expect(plan.render.draws).toHaveLength(1);
    expect(plan.render.draws[0].target).toBe('previewCanvas');
    expect(plan.render.draws[0].object).toBe(sceneObjectRef('grid:object'));
  });

  it('leaves deferred resource tables empty for the steel thread', () => {
    expect(plan.resources.textures).toEqual({});
    expect(plan.resources.computeResources).toEqual({});
    expect(plan.resources.postChains).toEqual({});
    expect(plan.render.postChain).toBeNull();
  });
});

describe('ScenePlan — handle discipline', () => {
  it('resolves a draw item to its scene object, and that object to its resources', () => {
    const plan = buildGridOfSquares();
    const draw = plan.render.draws[0];
    const object = plan.objects[draw.object];
    expect(object).toBeDefined();
    // Foreign-key resolution: object handles index into the resource tables.
    expect(plan.resources.geometries[object.geometry]).toBeDefined();
    expect(plan.resources.materials[object.material]).toBeDefined();
  });

  it('is fully JSON-serializable — no functions, no renderer objects', () => {
    const plan = buildGridOfSquares();
    const roundTripped = JSON.parse(JSON.stringify(plan));
    // A backend object (Three mesh/material) or a closure would not survive a
    // JSON round-trip unchanged. Structural equality proves the plan is data.
    expect(roundTripped).toEqual(plan);
  });
});

describe('ScenePlan — backend neutrality (source-level)', () => {
  it('imports nothing from the Rust boundary or any renderer backend', () => {
    const sources = readdirSync(SCENE_PLAN_DIR)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => readFileSync(join(SCENE_PLAN_DIR, f), 'utf8'));
    expect(sources.length).toBeGreaterThan(0);
    for (const src of sources) {
      // [LAW:one-source-of-truth] ScenePlan must not re-derive or depend on the
      // frozen Rust-boundary payload (no dual ownership).
      expect(src).not.toContain('boundary-contract');
      // [LAW:locality-or-seam] No Three / WASM coupling leaks into the plan types.
      expect(src).not.toMatch(/from ['"]three/);
      expect(src).not.toContain('render/wasm');
    }
  });
});
