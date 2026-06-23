/**
 * Integration tests for the ScenePlan compile path (ulu.3).
 *
 * The centerpiece compiles the authored `Grid of Squares` patch
 * (src/pillars/fixtures/grid-of-squares.ts) through `compileScenePlan` and
 * asserts it satisfies every "Required Compiler Capability" of the first proof
 * contract (design-docs/three-migration-first-proof-contract.md). Assertions
 * target what the plan *means* — not the exact PlanExpr tree shape — so the
 * lowering is free to refactor expression construction.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import { compileScenePlan } from '../index';
import { makeGridOfSquaresPatch } from '../../fixtures/grid-of-squares';
import { sceneObjectRef } from '../../../render/scene-plan';
import type { PillarPatch } from '../../types';
import type { ScenePlan } from '../../../render/scene-plan';

const SCENE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

function compileOk(patch: PillarPatch): ScenePlan {
  const result = compileScenePlan(patch);
  if (result.kind !== 'ok') {
    throw new Error(`Expected ok ScenePlan, got errors: ${result.errors.join('; ')}`);
  }
  return result.plan;
}

describe('compileScenePlan — Grid of Squares proof target', () => {
  const plan = compileOk(makeGridOfSquaresPatch());
  const object = plan.objects[sceneObjectRef('draw')];

  it('compiles the authored patch to an ok ScenePlan', () => {
    expect(plan.version).toBe(1);
    expect(object).toBeDefined();
  });

  it('declares one instance domain with count = 100 (rows × cols)', () => {
    expect(object.instancing.count).toBe(100);
  });

  it('exposes index and rank as per-instance intrinsics', () => {
    const transform = JSON.stringify(object.instancing.transform);
    expect(transform).toContain('"intrinsic"');
    expect(transform).toContain('"index"');
    const color = JSON.stringify(plan.resources.materials[object.material].color);
    expect(color).toContain('"rank"');
  });

  it('binds time as a derived runtime input channel, not a compile-time constant', () => {
    expect(plan.render.inputs).toEqual(['time']);
    const rotation = JSON.stringify(object.instancing.transform.rotation);
    expect(rotation).toContain('"input"');
    expect(rotation).toContain('"time"');
  });

  it('carries a per-instance transform with both position and rotation', () => {
    const { transform } = object.instancing;
    expect(transform.positionX).toBeDefined();
    expect(transform.positionY).toBeDefined();
    expect(transform.rotation).toBeDefined();
    // Position varies per instance: it references the index intrinsic.
    expect(JSON.stringify(transform.positionX)).toContain('"index"');
  });

  it('references one canonical rectangle geometry by handle', () => {
    const geo = plan.resources.geometries[object.geometry];
    expect(geo.kind).toBe('rectangle');
    if (geo.kind !== 'rectangle') return;
    expect(geo.width).toBe(0.08);
    expect(geo.height).toBe(0.08);
  });

  it('references one unlit HSL color material with a per-instance color payload', () => {
    const material = plan.resources.materials[object.material];
    expect(material.kind).toBe('unlitColor');
    expect(material.color.space).toBe('hsl');
  });

  it('emits one draw item targeting the preview canvas', () => {
    expect(plan.render.draws).toHaveLength(1);
    expect(plan.render.draws[0].target).toBe('previewCanvas');
    expect(plan.render.draws[0].object).toBe(sceneObjectRef('draw'));
  });

  it('frames the scene with an orthographic camera from the authored half-extents', () => {
    expect(plan.render.camera.kind).toBe('orthographic');
    expect(plan.render.camera.halfExtentX).toBe(0.6);
    expect(plan.render.camera.halfExtentY).toBe(0.6);
  });

  it('leaves the deferred resource tables empty', () => {
    expect(plan.resources.textures).toEqual({});
    expect(plan.resources.computeResources).toEqual({});
    expect(plan.resources.postChains).toEqual({});
    expect(plan.render.postChain).toBeNull();
  });

  it('is fully JSON-serializable — pure data, no renderer objects or closures', () => {
    const roundTripped = JSON.parse(JSON.stringify(plan));
    expect(roundTripped).toEqual(plan);
  });

  it('resolves draw → object → resources by handle', () => {
    const draw = plan.render.draws[0];
    const resolved = plan.objects[draw.object];
    expect(resolved).toBeDefined();
    expect(plan.resources.geometries[resolved.geometry]).toBeDefined();
    expect(plan.resources.materials[resolved.material]).toBeDefined();
  });
});

describe('compileScenePlan — loud failures', () => {
  it('reports an unknown block type', () => {
    const result = compileScenePlan({
      blocks: [{ id: 'x', kind: 'generator', type: 'NotARealBlock', config: {} }],
      edges: [],
    });
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.errors.join('\n')).toContain('NotARealBlock');
  });

  it('reports a draw block with no primary input edge', () => {
    const result = compileScenePlan({
      blocks: [
        { id: 'draw', kind: 'intent', type: 'DrawInstances',
          config: { size: 0.08, cameraHalfExtentX: 0.6, cameraHalfExtentY: 0.6 } },
      ],
      edges: [],
    });
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.errors.join('\n')).toMatch(/no primary input edge/);
  });

  it('reports a draw whose primary source is not an instance source', () => {
    const result = compileScenePlan({
      blocks: [
        { id: 'a', kind: 'intent', type: 'DrawInstances',
          config: { size: 0.08, cameraHalfExtentX: 0.6, cameraHalfExtentY: 0.6 } },
        { id: 'b', kind: 'intent', type: 'DrawInstances',
          config: { size: 0.08, cameraHalfExtentX: 0.6, cameraHalfExtentY: 0.6 } },
      ],
      edges: [{ id: 'e', source: 'a', target: 'b', inputSlot: 'primary', role: 'primary' }],
    });
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.errors.join('\n')).toMatch(/not an instance source/);
  });

  it('reports invalid generator config (collects all bad fields)', () => {
    const result = compileScenePlan({
      blocks: [
        { id: 'grid', kind: 'generator', type: 'InstanceGrid',
          config: { rows: -1, cols: 0, spacing: 0, rotationPerIndex: 'x',
            rotationPerTime: 1, huePerTime: 1, saturation: 1, lightness: 1 } },
      ],
      edges: [],
    });
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    const message = result.errors.join('\n');
    expect(message).toContain("'rows'");
    expect(message).toContain("'cols'");
    expect(message).toContain("'spacing'");
    expect(message).toContain("'rotationPerIndex'");
  });

  it('reports a patch with no draw block', () => {
    const result = compileScenePlan({
      blocks: [
        { id: 'grid', kind: 'generator', type: 'InstanceGrid',
          config: { rows: 10, cols: 10, spacing: 0.1, rotationPerIndex: 0.5,
            rotationPerTime: 2, huePerTime: 0.2, saturation: 0.8, lightness: 0.6 } },
      ],
      edges: [],
    });
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.errors.join('\n')).toMatch(/renders nothing/);
  });
});

describe('compileScenePlan — backend neutrality (source-level)', () => {
  it('imports nothing from the Rust boundary or any renderer backend', () => {
    const collect = (dir: string): string[] => {
      const out: string[] = [];
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '__tests__') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...collect(full));
        else if (entry.name.endsWith('.ts')) out.push(readFileSync(full, 'utf8'));
      }
      return out;
    };
    const sources = collect(SCENE_DIR);
    expect(sources.length).toBeGreaterThan(0);
    for (const src of sources) {
      // Assert the *imports*, not mere mentions: doc comments may discuss these
      // concepts ([LAW:behavior-not-structure] — test the dependency, not prose).
      // [LAW:one-source-of-truth] No dependency on the frozen Rust payload.
      expect(src).not.toMatch(/from ['"][^'"]*boundary-contract/);
      // [LAW:locality-or-seam] No Three / WASM coupling in the compiler output.
      expect(src).not.toMatch(/from ['"]three/);
      expect(src).not.toMatch(/from ['"][^'"]*render\/wasm/);
    }
  });
});
