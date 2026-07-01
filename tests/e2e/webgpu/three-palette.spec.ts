/**
 * tests/e2e/webgpu/three-palette.spec.ts
 *
 * Visual proof for the native palette color source (oscilla-pillars-scene-nt56.22).
 * Boots the app shell, loads the authored `color-palette` patch
 * (`?scenePlan=color-palette`), and proves the preview canvas shows visible,
 * time-animated content rendered through the Three backend — a grid colored by a
 * `ColorByIndex` palette LUT (a `{kind:'data'}` texture sampled with `nearest`
 * filter through the OKLab→display map), with no legacy GPU-IR / Rust path
 * engaged.
 *
 * The palette colors themselves are confirmed by eye from the captured frame;
 * this spec guards the boot + render + animation contract (the grid rotates over
 * time). The PNG-decode/frame-diff machinery is shared with the other steel-
 * thread proofs. // [LAW:one-source-of-truth]
 *
 * MUST run headed: the Three device acquires lazily and has no headless WebGPU
 * adapter. // [LAW:no-silent-failure]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  attachBrowserIssueCollector,
  awaitScenePlanRendering,
  captureFrame,
  readRuntimeProbe,
} from './canvas-frame-proof';

test.use({
  headless: false,
  launchOptions: { args: ['--enable-unsafe-webgpu'] },
});

const SELECTED_PATCH_ID = 'color-palette';
const ARTIFACT_DIR = resolve('artifacts/three-migration/nt56.22-palette');
const FRAME_INTERVAL_MS = 400;
const BLACK_CHANNEL_THRESHOLD = 8;

test.describe('Three native palette color source', () => {
  test('renders the grid colored by a ColorByIndex palette LUT through the Three backend, animated', async ({ page }) => {
    test.setTimeout(120_000);
    const issues = attachBrowserIssueCollector(page);

    await awaitScenePlanRendering(page, SELECTED_PATCH_ID);

    const canvas = page.getByTestId('preview-canvas');
    mkdirSync(ARTIFACT_DIR, { recursive: true });

    const frame0 = await captureFrame(canvas, resolve(ARTIFACT_DIR, 'frame-000.png'), BLACK_CHANNEL_THRESHOLD);
    await page.waitForTimeout(FRAME_INTERVAL_MS);
    const frame1 = await captureFrame(canvas, resolve(ARTIFACT_DIR, 'frame-001.png'), BLACK_CHANNEL_THRESHOLD);

    const probe = await readRuntimeProbe(page);

    const deviceFaultIssues = issues.filter((issue) => issue.text.includes('THREE_DEVICE_INIT_FAILED'));
    const legacyPathIssues = issues.filter((issue) =>
      /PipelineInstallPayload|INSTALL_PIPELINE|rust worker|engine\.worker|boundary-contract|WASM renderer/i.test(issue.text),
    );
    const bootstrapFailureIssues = issues.filter((issue) => issue.text.includes('Failed to initialize runtime:'));

    const frame0Blank = frame0.nonBlack === 0;
    const frame1Blank = frame1.nonBlack === 0;
    const framesDiffered = frame0.checksum !== frame1.checksum;

    writeFileSync(
      resolve(ARTIFACT_DIR, 'summary.json'),
      `${JSON.stringify(
        {
          ticket: 'oscilla-pillars-scene-nt56.22',
          patch: SELECTED_PATCH_ID,
          previewBooted: probe?.bootstrap.state === 'succeeded',
          renderedFrameCount: probe?.loop.renderedFrameCount ?? 0,
          frames: { frame0, frame1 },
          framesDiffered,
          consoleErrors: issues.filter((i) => i.level === 'error').map((i) => `${i.source}: ${i.text}`),
          generatedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
    );

    expect(deviceFaultIssues, deviceFaultIssues.map((i) => i.text).join('\n')).toEqual([]);
    expect(bootstrapFailureIssues, bootstrapFailureIssues.map((i) => i.text).join('\n')).toEqual([]);
    expect(legacyPathIssues, legacyPathIssues.map((i) => i.text).join('\n')).toEqual([]);
    expect(frame0Blank, 'frame 0 rendered blank').toBe(false);
    expect(frame1Blank, 'frame 1 rendered blank').toBe(false);
    expect(framesDiffered, 'the two frames are identical — time-driven animation is not active').toBe(true);
  });
});
