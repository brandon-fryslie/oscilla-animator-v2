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

import { buildSceneRegistry, compileScenePlan } from '../index';
import { ALL_SCENE_BLOCKS } from '../blocks';
import { makeGridOfSquaresPatch } from '../../fixtures/grid-of-squares';
import { makeTexturedTilesPatch, TEXTURED_TILES_ASSETS } from '../../fixtures/textured-tiles';
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

  it('exposes index as a per-instance intrinsic in the transform', () => {
    const transform = JSON.stringify(object.instancing.transform);
    expect(transform).toContain('"intrinsic"');
    expect(transform).toContain('"index"');
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

  it('references one unlit rgb color material from the SolidColor block', () => {
    const material = plan.resources.materials[object.material];
    expect(material.kind).toBe('unlitColor');
    if (material.kind !== 'unlitColor') return;
    // The opaque SolidColor block mints an rgb ColorBinding behind the seam.
    expect(material.color.space).toBe('rgb');
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

describe('compileScenePlan — textured tiles asset path', () => {
  const plan = compileOk(makeTexturedTilesPatch());
  const object = plan.objects[sceneObjectRef('draw')];

  it('emits one texture resource referencing the patch asset by id', () => {
    const textures = Object.values(plan.resources.textures);
    expect(textures).toHaveLength(1);
    expect(textures[0]).toEqual({ kind: 'asset', assetId: TEXTURED_TILES_ASSETS[0].id });
  });

  it('shades the draw with a textured-unlit material referencing the texture handle', () => {
    const material = plan.resources.materials[object.material];
    expect(material.kind).toBe('texturedUnlit');
    if (material.kind !== 'texturedUnlit') return;
    expect(plan.resources.textures[material.texture]).toBeDefined();
  });

  it('keeps the textured plan JSON-serializable', () => {
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
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
    expect(message).toContain('(InstanceGrid)');
  });

  it('reports a patch with no draw block', () => {
    const result = compileScenePlan({
      blocks: [
        { id: 'grid', kind: 'generator', type: 'InstanceGrid',
          config: { rows: 10, cols: 10, spacing: 0.1, rotationPerIndex: 0.5,
            rotationPerTime: 2 } },
      ],
      edges: [],
    });
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.errors.join('\n')).toMatch(/renders nothing/);
  });
});

describe('scene block contract — catalog and registration', () => {
  it('publishes catalog metadata for palette ports and config fields', () => {
    const registry = buildSceneRegistry(ALL_SCENE_BLOCKS);
    const catalog = registry.catalog;

    expect(catalog.map((block) => block.displayName)).toEqual([
      'Instance Grid',
      'Wave Offset',
      'Solid Color',
      'Brightness',
      'Draw Instances',
    ]);
    expect(catalog.flatMap((block) => block.ports.map((port) => port.value))).toEqual([
      'instanceBundle', // InstanceGrid output
      'instanceBundle', // WaveOffset input
      'instanceBundle', // WaveOffset output
      'instanceBundle', // SolidColor input
      'instanceBundle', // SolidColor output
      'instanceBundle', // Brightness input
      'instanceBundle', // Brightness output
      'instanceBundle', // DrawInstances input
      'materialShell', // DrawInstances output
    ]);
    expect(catalog.flatMap((block) => block.configFields.map((field) => field.key))).toEqual([
      'rows',
      'cols',
      'spacing',
      'rotationPerIndex',
      'rotationPerTime',
      'amplitude',
      'frequency',
      'speed',
      'color',
      'factor',
      'size',
      'cameraHalfExtentX',
      'cameraHalfExtentY',
      'textureAssetId',
    ]);
  });

  it('rejects registration without the required scene block contract metadata', () => {
    const malformed = {
      type: 'MalformedSceneBlock',
      role: 'draw',
      catalog: {
        displayName: '',
        category: 'draw',
        ports: [],
      },
      configSchema: undefined,
      readConfig: () => null,
      contribute: () => ({ role: 'draw', shell: {} }),
    };

    expect(() =>
      buildSceneRegistry([malformed as unknown as (typeof ALL_SCENE_BLOCKS)[number]]),
    ).toThrow(/catalog\.displayName.*catalog\.ports.*configSchema/);
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
      expect(src).not.toMatch(/from ['"][^'"]*block-api/);
      expect(src).not.toMatch(/import\s+[^;]*(ExprIR|SourceBundle|RosterEntry)[^;]*from/);
      // [LAW:locality-or-seam] No Three / WASM coupling in the compiler output.
      expect(src).not.toMatch(/from ['"]three/);
      expect(src).not.toMatch(/from ['"][^'"]*render\/wasm/);
    }
  });
});
