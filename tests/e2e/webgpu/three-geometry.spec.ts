/**
 * tests/e2e/webgpu/three-geometry.spec.ts
 *
 * Visual proof for oscilla-pillars-scene-nt56.24 (size-correct point primitive +
 * non-square geometry): the two geometry-vocabulary gaps the nt56.8 demo fixtures
 * used to work around now render through their real primitives.
 *
 * - `point-dots` draws a ring of large, separated dots with `GeometryDef.point` —
 *   each a sized round disc (`CircleGeometry`), not a faked square quad.
 * - `kaleidoscope` draws its rosette with a non-square `rectangle`
 *   (`width !== height`, authored by DrawInstances `aspect`), so the copies read
 *   as spokes rather than squares.
 *
 * Both originate from the canonical Oscilla patch model compiled by
 * `compileScenePlan` and installed via the `createWebGPURenderer()` seam; no
 * hand-authored Three scene is on the path. [LAW:one-source-of-truth]
 *
 * MUST run headed: the Three device acquires lazily on the first frame and has no
 * headless WebGPU adapter.
 *
 * The PNG-decode/frame-diff machinery is shared with the other steel-thread
 * proofs in ./canvas-frame-proof.ts. [LAW:one-source-of-truth]
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

const ARTIFACT_DIR = resolve('artifacts/three-migration/nt56.24-geometry');
const FRAME_INTERVAL_MS = 400;
const BLACK_CHANNEL_THRESHOLD = 8;
const LEGACY_PATH = /PipelineInstallPayload|INSTALL_PIPELINE|rust worker|engine\.worker|boundary-contract|WASM renderer/i;

test.describe('Three native geometry vocabulary', () => {
  test('renders true round points and non-square rectangles through ThreeForkRenderer', async ({ page }) => {
    test.setTimeout(120_000);
    const issues = attachBrowserIssueCollector(page);
    mkdirSync(ARTIFACT_DIR, { recursive: true });

    // ── Point primitive: a ring of large, separated round dots, animated ──
    await awaitScenePlanRendering(page, 'point-dots');
    const pointCanvas = page.getByTestId('preview-canvas');
    const point0 = await captureFrame(pointCanvas, resolve(ARTIFACT_DIR, 'point-000.png'), BLACK_CHANNEL_THRESHOLD);
    await page.waitForTimeout(FRAME_INTERVAL_MS);
    const point1 = await captureFrame(pointCanvas, resolve(ARTIFACT_DIR, 'point-001.png'), BLACK_CHANNEL_THRESHOLD);

    // ── Non-square geometry: the kaleidoscope rosette as spokes, animated ──
    await awaitScenePlanRendering(page, 'kaleidoscope');
    const rectCanvas = page.getByTestId('preview-canvas');
    const nonSquare0 = await captureFrame(rectCanvas, resolve(ARTIFACT_DIR, 'non-square-000.png'), BLACK_CHANNEL_THRESHOLD);
    await page.waitForTimeout(FRAME_INTERVAL_MS);
    const nonSquare1 = await captureFrame(rectCanvas, resolve(ARTIFACT_DIR, 'non-square-001.png'), BLACK_CHANNEL_THRESHOLD);

    const deviceFaultIssues = issues.filter((i) => i.text.includes('THREE_DEVICE_INIT_FAILED'));
    const legacyPathIssues = issues.filter((i) => LEGACY_PATH.test(i.text));
    const bootstrapFailureIssues = issues.filter((i) => i.text.includes('Failed to initialize runtime:'));

    writeFileSync(
      resolve(ARTIFACT_DIR, 'summary.json'),
      `${JSON.stringify(
        {
          ticket: 'oscilla-pillars-scene-nt56.24',
          point: { fixture: 'point-dots', geometry: 'GeometryDef.point → CircleGeometry (round disc)', frames: { point0, point1 } },
          nonSquare: { fixture: 'kaleidoscope', geometry: 'GeometryDef.rectangle width!=height (aspect)', frames: { nonSquare0, nonSquare1 } },
          pointAnimated: point0.checksum !== point1.checksum,
          nonSquareAnimated: nonSquare0.checksum !== nonSquare1.checksum,
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

    // The point-based trace renders visible, time-animated content (ColorCycle reads time).
    expect(point0.nonBlack, 'point fixture frame 0 rendered blank').toBeGreaterThan(0);
    expect(point1.nonBlack, 'point fixture frame 1 rendered blank').toBeGreaterThan(0);
    expect(point0.checksum !== point1.checksum, 'point trace is not animating over time').toBe(true);

    // The non-square rosette renders visible, time-animated content.
    expect(nonSquare0.nonBlack, 'non-square fixture frame 0 rendered blank').toBeGreaterThan(0);
    expect(nonSquare1.nonBlack, 'non-square fixture frame 1 rendered blank').toBeGreaterThan(0);
    expect(nonSquare0.checksum !== nonSquare1.checksum, 'non-square rosette is not animating over time').toBe(true);
  });
});
