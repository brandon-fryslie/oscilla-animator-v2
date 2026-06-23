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
  type ScenePlan,
} from '../../../scene-plan';
import { createWebGPURenderer } from '../../index';
import { ThreeForkRenderer } from '../ThreeForkRenderer';

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

describe('ThreeForkRenderer — lifecycle and seam', () => {
  it('constructs idle without acquiring a GPU device', () => {
    const renderer = new ThreeForkRenderer(fakeCanvas);
    expect(renderer.getLifecycleState()).toBe('idle');
  });

  it('installs a valid ScenePlan without a device', () => {
    const renderer = new ThreeForkRenderer(fakeCanvas);
    expect(() => renderer.installScenePlan(buildStaticPlan())).not.toThrow();
    renderer.dispose();
  });

  it('rejects an incompatible ScenePlan version on install', () => {
    const renderer = new ThreeForkRenderer(fakeCanvas);
    expect(() => renderer.installScenePlan(buildStaticPlan(2))).toThrow(/incompatible ScenePlan version/);
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
    expect(() => renderer.installScenePlan(buildStaticPlan())).toThrow(/after dispose/);
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
