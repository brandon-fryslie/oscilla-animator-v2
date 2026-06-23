/**
 * tests/e2e/webgpu/three-textured-tiles.spec.ts
 *
 * Asset-bridge proof for the Three migration (oscilla-pillars-cleanup-ulu.4).
 * Boot the existing app shell, load the authored `Textured Tiles` patch, and
 * prove the preview canvas shows visible, time-animated, texture-mapped content
 * resolved through the Oscilla AssetRegistry + ThreeLoadingBridge — not an
 * inline image and not the legacy GPU-IR / Rust-worker / WASM path.
 *
 * The patch (`makeTexturedTilesPatch`) references its texture by stable AssetId;
 * `compileScenePlan` emits a TextureRef into the plan's textures table, and the
 * loading bridge decodes the registered asset before the scene realizes
 * (`?scenePlan=textured-tiles`). // [LAW:one-source-of-truth]
 *
 * MUST run headed: the Three device acquires lazily on the first frame and has no
 * headless WebGPU adapter (THREE_DEVICE_INIT_FAILED). The texture also loads
 * through a real `TextureLoader`, which needs a real browser image decode.
 * // [LAW:no-silent-failure]
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

const SELECTED_PATCH_ID = 'textured-tiles';
const SELECTED_PATCH_NAME = 'Textured Tiles';
const ARTIFACT_DIR = resolve('artifacts/three-migration/ulu.4-textured-tiles');
const FRAME_INTERVAL_MS = 400;
const BLACK_CHANNEL_THRESHOLD = 8;

test.describe('Three Textured Tiles asset bridge', () => {
  test('renders the authored Textured Tiles patch with assets resolved through the registry + loading bridge', async ({ page }) => {
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
    // The asset path must resolve cleanly: a registry miss or an undecodable
    // kind would surface as a loud error from the bridge.
    const assetResolutionIssues = issues.filter((issue) =>
      /unknown asset id|no texture decoder|was not resolved by the loading bridge|unsupported source kind/i.test(issue.text),
    );

    const frame0Blank = frame0.nonBlack === 0;
    const frame1Blank = frame1.nonBlack === 0;
    const framesDiffered = frame0.checksum !== frame1.checksum;

    const summary = {
      ticket: 'oscilla-pillars-cleanup-ulu.4',
      patch: { id: SELECTED_PATCH_ID, name: SELECTED_PATCH_NAME },
      previewBooted: probe?.bootstrap.state === 'succeeded',
      renderedFrameCount: probe?.loop.renderedFrameCount ?? 0,
      assetsResolvedThroughRegistry: assetResolutionIssues.length === 0,
      rendererThreeBacked: deviceFaultIssues.length === 0 && legacyPathIssues.length === 0,
      frames: {
        frame0: { nonBlack: frame0.nonBlack, checksum: frame0.checksum, size: `${frame0.width}x${frame0.height}` },
        frame1: { nonBlack: frame1.nonBlack, checksum: frame1.checksum, size: `${frame1.width}x${frame1.height}` },
      },
      framesDiffered,
      eitherFrameBlank: frame0Blank || frame1Blank,
      consoleErrors: issues.filter((issue) => issue.level === 'error').map((issue) => `${issue.source}: ${issue.text}`),
      deviceInitFailures: deviceFaultIssues.map((issue) => issue.text),
      legacyPathReferences: legacyPathIssues.map((issue) => issue.text),
      assetResolutionFailures: assetResolutionIssues.map((issue) => issue.text),
      generatedAt: new Date().toISOString(),
    };
    writeFileSync(resolve(ARTIFACT_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

    // ── Success signals ──
    expect(deviceFaultIssues, deviceFaultIssues.map((i) => i.text).join('\n')).toEqual([]);
    expect(bootstrapFailureIssues, bootstrapFailureIssues.map((i) => i.text).join('\n')).toEqual([]);
    expect(legacyPathIssues, legacyPathIssues.map((i) => i.text).join('\n')).toEqual([]);
    expect(assetResolutionIssues, assetResolutionIssues.map((i) => i.text).join('\n')).toEqual([]);
    expect(frame0Blank, 'frame 0 rendered blank').toBe(false);
    expect(frame1Blank, 'frame 1 rendered blank').toBe(false);
    expect(framesDiffered, 'the two frames are identical — time-driven animation is not active').toBe(true);
  });
});
