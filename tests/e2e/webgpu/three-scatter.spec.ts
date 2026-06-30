/**
 * tests/e2e/webgpu/three-scatter.spec.ts
 *
 * Visual proof for oscilla-pillars-scene-nt56.23 (hash/fract PlanExpr operator +
 * Scatter layout modifier): a `count → Scatter → ColorCycle → draw` patch renders
 * a pseudo-random point cloud through the Three backend, exercising the new
 * `hash` PlanExpr operator end-to-end (compiler → ScenePlan → TSL → WebGPU).
 *
 * The Scatter placement is a hash of each instance index, so the cloud is
 * pseudo-random rather than a lattice: a pixel difference between
 * `?scenePlan=scatter-cloud` and the gridded `?scenePlan=grid-of-squares` is the
 * scatter's effect, isolated. // [LAW:no-silent-failure]
 *
 * The render originates from the canonical Oscilla patch model
 * (`makeScatterCloudPatch`) compiled by `compileScenePlan` and installed via the
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

const ARTIFACT_DIR = resolve('artifacts/three-migration/nt56.23-scatter');
const FRAME_INTERVAL_MS = 400;
const BLACK_CHANNEL_THRESHOLD = 8;
const LEGACY_PATH = /PipelineInstallPayload|INSTALL_PIPELINE|rust worker|engine\.worker|boundary-contract|WASM renderer/i;

test.describe('Three native scatter cloud', () => {
  test('renders a hash-driven pseudo-random point cloud, animated, and visibly different from the gridded layout', async ({ page }) => {
    test.setTimeout(120_000);
    const issues = attachBrowserIssueCollector(page);
    mkdirSync(ARTIFACT_DIR, { recursive: true });

    // ── The scatter cloud renders, animated (ColorCycle reads time) ──
    await awaitScenePlanRendering(page, 'scatter-cloud');
    const canvas = page.getByTestId('preview-canvas');

    const scatter0 = await captureFrame(canvas, resolve(ARTIFACT_DIR, 'scatter-000.png'), BLACK_CHANNEL_THRESHOLD);
    await page.waitForTimeout(FRAME_INTERVAL_MS);
    const scatter1 = await captureFrame(canvas, resolve(ARTIFACT_DIR, 'scatter-001.png'), BLACK_CHANNEL_THRESHOLD);

    // ── The gridded layout, for the isolated-placement comparison ──
    await awaitScenePlanRendering(page, 'grid-of-squares');
    const grid = await captureFrame(
      page.getByTestId('preview-canvas'),
      resolve(ARTIFACT_DIR, 'grid-baseline.png'),
      BLACK_CHANNEL_THRESHOLD,
    );

    const deviceFaultIssues = issues.filter((i) => i.text.includes('THREE_DEVICE_INIT_FAILED'));
    const legacyPathIssues = issues.filter((i) => LEGACY_PATH.test(i.text));
    const bootstrapFailureIssues = issues.filter((i) => i.text.includes('Failed to initialize runtime:'));

    writeFileSync(
      resolve(ARTIFACT_DIR, 'summary.json'),
      `${JSON.stringify(
        {
          ticket: 'oscilla-pillars-scene-nt56.23',
          chain: 'InstanceCount → Scatter → ColorCycle → DrawInstances',
          operator: 'hash (PlanUnaryOp) realized as TSL hash()',
          frames: { scatter0, scatter1, grid },
          scatterAnimated: scatter0.checksum !== scatter1.checksum,
          scatterDiffersFromGrid: scatter0.checksum !== grid.checksum,
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

    // The scatter cloud renders visible, time-animated content (ColorCycle reads time).
    expect(scatter0.nonBlack, 'scatter frame 0 rendered blank').toBeGreaterThan(0);
    expect(scatter1.nonBlack, 'scatter frame 1 rendered blank').toBeGreaterThan(0);
    expect(scatter0.checksum !== scatter1.checksum, 'scatter cloud is not animating — ColorCycle reads time').toBe(true);

    // The hash placement is genuinely different from the gridded layout.
    expect(grid.nonBlack, 'baseline grid rendered blank').toBeGreaterThan(0);
    expect(scatter0.checksum !== grid.checksum, 'the scatter cloud produced the same pixels as the gridded layout').toBe(true);
  });
});
