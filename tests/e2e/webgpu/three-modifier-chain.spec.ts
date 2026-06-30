/**
 * tests/e2e/webgpu/three-modifier-chain.spec.ts
 *
 * Visual proof for oscilla-pillars-scene-nt56.4 (native modifier foundation): a
 * `source → modifier → modifier → draw` patch renders through the Three backend,
 * and the modifiers *visibly change* the output versus the same grid with no
 * modifiers.
 *
 * Both patches share the same `InstanceGrid` source, draw size, and camera; the
 * only difference is the `WaveOffset` (per-instance Y displacement) and
 * `Brightness` (luminance scale) modifiers in the chain. So a pixel difference
 * between `?scenePlan=instance-wave` and `?scenePlan=grid-of-squares` is the
 * modifiers' effect, isolated — the automated form of "toggling a modifier
 * visibly changes the output." // [LAW:no-silent-failure]
 *
 * The render originates from the canonical Oscilla patch model
 * (`makeInstanceWavePatch`) compiled by `compileScenePlan` and installed via the
 * `createWebGPURenderer()` seam; no hand-authored Three scene is on the path.
 * // [LAW:one-source-of-truth]
 *
 * MUST run headed: the Three device acquires lazily on the first frame and has no
 * headless WebGPU adapter.
 *
 * The PNG-decode/frame-diff machinery is shared with the other steel-thread
 * proofs in ./canvas-frame-proof.ts. // [LAW:one-source-of-truth]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  attachBrowserIssueCollector,
  awaitScenePlanRendering,
  captureFrame,
} from './canvas-frame-proof';

test.use({
  headless: false,
  launchOptions: { args: ['--enable-unsafe-webgpu'] },
});

const ARTIFACT_DIR = resolve('artifacts/three-migration/nt56.4-modifier-chain');
const FRAME_INTERVAL_MS = 400;
const BLACK_CHANNEL_THRESHOLD = 8;
const LEGACY_PATH = /PipelineInstallPayload|INSTALL_PIPELINE|rust worker|engine\.worker|boundary-contract|WASM renderer/i;

test.describe('Three native modifier chain', () => {
  test('renders a source → modifier → modifier → draw chain, animated, and visibly different from the un-modified grid', async ({ page }) => {
    test.setTimeout(120_000);
    const issues = attachBrowserIssueCollector(page);
    mkdirSync(ARTIFACT_DIR, { recursive: true });

    // ── The modifier chain renders, animated, through the Three backend ──
    await awaitScenePlanRendering(page, 'instance-wave');
    const canvas = page.getByTestId('preview-canvas');

    const wave0 = await captureFrame(canvas, resolve(ARTIFACT_DIR, 'wave-000.png'), BLACK_CHANNEL_THRESHOLD);
    await page.waitForTimeout(FRAME_INTERVAL_MS);
    const wave1 = await captureFrame(canvas, resolve(ARTIFACT_DIR, 'wave-001.png'), BLACK_CHANNEL_THRESHOLD);

    // ── The same grid with no modifiers, for the isolated-effect comparison ──
    await awaitScenePlanRendering(page, 'grid-of-squares');
    const grid = await captureFrame(
      page.getByTestId('preview-canvas'),
      resolve(ARTIFACT_DIR, 'grid-no-modifiers.png'),
      BLACK_CHANNEL_THRESHOLD,
    );

    const deviceFaultIssues = issues.filter((i) => i.text.includes('THREE_DEVICE_INIT_FAILED'));
    const legacyPathIssues = issues.filter((i) => LEGACY_PATH.test(i.text));
    const bootstrapFailureIssues = issues.filter((i) => i.text.includes('Failed to initialize runtime:'));

    writeFileSync(
      resolve(ARTIFACT_DIR, 'summary.json'),
      `${JSON.stringify(
        {
          ticket: 'oscilla-pillars-scene-nt56.4',
          chain: 'InstanceGrid → WaveOffset → Brightness → DrawInstances',
          frames: { wave0, wave1, grid },
          waveAnimated: wave0.checksum !== wave1.checksum,
          modifierChangedOutput: wave0.checksum !== grid.checksum,
          consoleErrors: issues.filter((i) => i.level === 'error').map((i) => `${i.source}: ${i.text}`),
          generatedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
    );

    // No legacy GPU-IR / Rust-worker / WASM path engaged.
    expect(deviceFaultIssues, deviceFaultIssues.map((i) => i.text).join('\n')).toEqual([]);
    expect(bootstrapFailureIssues, bootstrapFailureIssues.map((i) => i.text).join('\n')).toEqual([]);
    expect(legacyPathIssues, legacyPathIssues.map((i) => i.text).join('\n')).toEqual([]);

    // The modifier chain renders visible, time-animated content.
    expect(wave0.nonBlack, 'modifier-chain frame 0 rendered blank').toBeGreaterThan(0);
    expect(wave1.nonBlack, 'modifier-chain frame 1 rendered blank').toBeGreaterThan(0);
    expect(wave0.checksum !== wave1.checksum, 'modifier chain is not animating — the wave reads time').toBe(true);

    // The modifiers visibly change the output: same grid, +modifiers ⇒ different pixels.
    expect(grid.nonBlack, 'baseline grid rendered blank').toBeGreaterThan(0);
    expect(wave0.checksum !== grid.checksum, 'the modifier chain produced the same pixels as the un-modified grid').toBe(true);
  });
});
