/**
 * Lifecycle + seam tests for the Three-backed renderer.
 *
 * The GPU-bound draw path (device acquisition + `renderAsync`) needs a real
 * WebGPU adapter and is proven by ulu.5's `--no-headless` e2e — NOT here. What
 * is deterministic without a device is the seam contract: lazy device
 * acquisition (construction needs no GPU), plan-install validation, loud
 * sequencing errors, disposal, and the honest legacy-telemetry accessors. Those
 * are what keep `verify:renderer-shell` green when the app shell boots this
 * renderer headlessly.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import {
  SCENE_PLAN_VERSION,
  defineScenePlan,
  geometryRef,
  konst,
  materialRef,
  sceneObjectRef,
  textureRef,
  type ScenePlan,
} from '../../../scene-plan';
import { assetId } from '../../../../core/ids';
import { createAssetRegistry, type AssetMetadata } from '../../../../assets';
import { createWebGPURenderer } from '../../index';
import { ThreeForkRenderer } from '../ThreeForkRenderer';

// The static plans here reference no texture assets, so an empty registry is all
// the install path needs.
const emptyRegistry = createAssetRegistry([]);

// The Three backend implementation modules live one level up from __tests__.
const THREE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

// The renderer never touches the canvas until a device is acquired (first
// frame), so a structural stand-in is sufficient for the device-free contract.
const fakeCanvas = { width: 256, height: 256 } as unknown as HTMLCanvasElement;

function buildStaticPlan(version: number = SCENE_PLAN_VERSION): ScenePlan {
  const square = geometryRef('o:square');
  const unlit = materialRef('o:unlit');
  const object = sceneObjectRef('o:object');
  return {
    version,
    resources: {
      geometries: { [square]: { kind: 'rectangle', width: 1, height: 1 } },
      materials: {
        [unlit]: { kind: 'unlitColor', color: { space: 'rgb', r: konst(1), g: konst(0), b: konst(0) } },
      },
      textures: {},
      computeResources: {},
      postChains: {},
      states: {},
    },
    objects: {
      [object]: {
        geometry: square,
        material: unlit,
        instancing: { count: 1, transform: { positionX: konst(0), positionY: konst(0), rotation: konst(0) } },
      },
    },
    render: {
      camera: { kind: 'orthographic', halfExtentX: 1, halfExtentY: 1 },
      inputs: [],
      draws: [{ target: 'previewCanvas', object }],
      postChain: null,
    },
  } as ScenePlan;
}

/** A static plan whose single textured object references one texture asset. */
function buildTexturedPlan(referencedAssetId: string): ScenePlan {
  const square = geometryRef('o:square');
  const tex = textureRef('o:tex');
  const textured = materialRef('o:textured');
  const object = sceneObjectRef('o:object');
  return {
    version: SCENE_PLAN_VERSION,
    resources: {
      geometries: { [square]: { kind: 'rectangle', width: 1, height: 1 } },
      materials: { [textured]: { kind: 'texturedUnlit', texture: tex } },
      textures: { [tex]: { kind: 'asset', assetId: assetId(referencedAssetId) } },
      computeResources: {},
      postChains: {},
      states: {},
    },
    objects: {
      [object]: {
        geometry: square,
        material: textured,
        instancing: { count: 1, transform: { positionX: konst(0), positionY: konst(0), rotation: konst(0) } },
      },
    },
    render: {
      camera: { kind: 'orthographic', halfExtentX: 1, halfExtentY: 1 },
      inputs: [],
      draws: [{ target: 'previewCanvas', object }],
      postChain: null,
    },
  } as ScenePlan;
}

const modelAsset = (id: string): AssetMetadata => ({
  id: assetId(id),
  kind: 'model',
  label: id,
  source: { kind: 'url', url: `data:,${id}` },
});

describe('ThreeForkRenderer — lifecycle and seam', () => {
  it('constructs idle without acquiring a GPU device', () => {
    const renderer = new ThreeForkRenderer(fakeCanvas);
    expect(renderer.getLifecycleState()).toBe('idle');
  });

  it('installs a valid ScenePlan without a device', async () => {
    const renderer = new ThreeForkRenderer(fakeCanvas);
    await expect(renderer.installScenePlan(buildStaticPlan(), emptyRegistry)).resolves.toBeUndefined();
    renderer.dispose();
  });

  it('rejects an incompatible ScenePlan version on install', async () => {
    const renderer = new ThreeForkRenderer(fakeCanvas);
    await expect(renderer.installScenePlan(buildStaticPlan(2), emptyRegistry)).rejects.toThrow(
      /incompatible ScenePlan version/,
    );
  });

  it('rejects a plan whose texture references an unregistered asset, before any decode', async () => {
    const renderer = new ThreeForkRenderer(fakeCanvas);
    await expect(
      renderer.installScenePlan(buildTexturedPlan('ghost'), emptyRegistry),
    ).rejects.toThrow(/cannot install ScenePlan — unresolved asset references[\s\S]*'ghost'[\s\S]*not registered/);
  });

  it('rejects a plan whose texture asset has an undecodable kind, before any decode', async () => {
    const renderer = new ThreeForkRenderer(fakeCanvas);
    const registry = createAssetRegistry([modelAsset('mesh')]);
    await expect(
      renderer.installScenePlan(buildTexturedPlan('mesh'), registry),
    ).rejects.toThrow(/cannot install ScenePlan — unresolved asset references[\s\S]*'mesh'[\s\S]*no texture decoder/);
  });

  it('refuses to render before a plan is installed', async () => {
    const renderer = new ThreeForkRenderer(fakeCanvas);
    await expect(renderer.renderFrame({})).rejects.toThrow(/install a ScenePlan before rendering/);
  });

  it('reports the dead GPU-IR telemetry surface as empty, not fabricated', () => {
    const renderer = new ThreeForkRenderer(fakeCanvas);
    expect(renderer.getInstalledGpuPassIds()).toEqual([]);
    expect(renderer.getLatestRuntimeTelemetry()).toBeNull();
    expect(renderer.getLatestSinkTableSample()).toBeNull();
    expect(renderer.getLatestBoundaryFixturePayloadV1()).toBeNull();
  });

  it('refuses to install or render after disposal', async () => {
    const renderer = new ThreeForkRenderer(fakeCanvas);
    renderer.dispose();
    expect(renderer.getLifecycleState()).toBe('disposed');
    await expect(renderer.installScenePlan(buildStaticPlan(), emptyRegistry)).rejects.toThrow(/after dispose/);
    await expect(renderer.renderFrame({})).rejects.toThrow(/after dispose/);
  });
});

describe('createWebGPURenderer — app-facing seam', () => {
  it('returns a renderer that is idle until first use', async () => {
    const renderer = await createWebGPURenderer(fakeCanvas);
    expect(renderer.getLifecycleState()).toBe('idle');
    expect(typeof renderer.installScenePlan).toBe('function');
    expect(typeof renderer.renderFrame).toBe('function');
    renderer.dispose();
  });
});

describe('Three backend — no dependency on the frozen Rust boundary', () => {
  it('imports nothing from boundary-contract', () => {
    // [LAW:one-source-of-truth] ScenePlan is the sole assembly target; the Three
    //   backend must not reach into the frozen PipelineInstallPayload contract.
    const sources = readdirSync(THREE_DIR)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => readFileSync(join(THREE_DIR, f), 'utf8'));
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(source).not.toMatch(/boundary-contract/);
    }
  });
});
