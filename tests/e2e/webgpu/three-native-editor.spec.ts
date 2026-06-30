/**
 * tests/e2e/webgpu/three-native-editor.spec.ts
 *
 * Proof for oscilla-pillars-scene-nt56.7: a patch authored in the native graph
 * editor renders live through the Three backend, and editing it recompiles and
 * updates the preview without tearing down the renderer or the animation loop.
 *
 * Path: `?scenePlan=editor` boots the live editor mode — the authored
 * `PillarPatch` in `PillarPatchStore` is compiled by `compileScenePlan` and
 * installed through the `createWebGPURenderer()` seam, with no Rust worker, WASM
 * renderer, or PipelineInstallPayload on the path. // [LAW:one-source-of-truth]
 *
 * MUST run headed: the Three device acquires lazily on the first frame and has no
 * headless WebGPU adapter. // [LAW:no-silent-failure]
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

const ARTIFACT_DIR = resolve('artifacts/three-migration/nt56.7-native-editor');
const FRAME_INTERVAL_MS = 400;
const BLACK_CHANNEL_THRESHOLD = 8;

const LEGACY_PATH = /PipelineInstallPayload|INSTALL_PIPELINE|rust worker|engine\.worker|boundary-contract|WASM renderer/i;

test.describe('Three native editor live preview', () => {
  test('renders the editor-authored seed patch through the Three backend with animated content', async ({ page }) => {
    test.setTimeout(120_000);
    const issues = attachBrowserIssueCollector(page);

    // ?scenePlan=editor + showPreview: the live editor compiles its seed patch
    // and drives the full-viewport preview canvas.
    await awaitScenePlanRendering(page, 'editor');

    const canvas = page.getByTestId('preview-canvas');
    mkdirSync(ARTIFACT_DIR, { recursive: true });

    const frame0 = await captureFrame(canvas, resolve(ARTIFACT_DIR, 'frame-000.png'), BLACK_CHANNEL_THRESHOLD);
    await page.waitForTimeout(FRAME_INTERVAL_MS);
    const frame1 = await captureFrame(canvas, resolve(ARTIFACT_DIR, 'frame-001.png'), BLACK_CHANNEL_THRESHOLD);

    const deviceFaultIssues = issues.filter((i) => i.text.includes('THREE_DEVICE_INIT_FAILED'));
    const legacyPathIssues = issues.filter((i) => LEGACY_PATH.test(i.text));
    const bootstrapFailureIssues = issues.filter((i) => i.text.includes('Failed to initialize runtime:'));

    writeFileSync(
      resolve(ARTIFACT_DIR, 'summary.json'),
      `${JSON.stringify(
        {
          ticket: 'oscilla-pillars-scene-nt56.7',
          mode: 'scenePlan=editor (live PillarPatchStore)',
          frames: { frame0, frame1 },
          framesDiffered: frame0.checksum !== frame1.checksum,
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
    expect(frame0.nonBlack, 'frame 0 rendered blank').toBeGreaterThan(0);
    expect(frame1.nonBlack, 'frame 1 rendered blank').toBeGreaterThan(0);
    expect(frame0.checksum !== frame1.checksum, 'frames identical — time-driven animation not active').toBe(true);
  });

  test('renders in the full editor layout and survives a live config edit with no errors', async ({ page }) => {
    test.setTimeout(120_000);
    const issues = attachBrowserIssueCollector(page);

    // Full editor layout: authoring panel + live preview. The runtime probe is
    // published only for showPreview sessions, so this test proves rendering
    // visually (canvas content) rather than via the probe.
    await page.goto('/?scenePlan=editor', { waitUntil: 'domcontentloaded' });

    const canvas = page.getByTestId('native-editor-canvas');
    await expect(canvas).toBeVisible();
    mkdirSync(ARTIFACT_DIR, { recursive: true });

    // The editor-authored seed patch renders live in the full editor layout.
    await expect
      .poll(
        async () => (await captureFrame(canvas, resolve(ARTIFACT_DIR, 'editor-boot.png'), BLACK_CHANNEL_THRESHOLD)).nonBlack,
        { timeout: 30_000, message: 'the editor preview never rendered content' },
      )
      .toBeGreaterThan(0);

    const beforeEdit = await captureFrame(canvas, resolve(ARTIFACT_DIR, 'edit-before.png'), BLACK_CHANNEL_THRESHOLD);

    // Edit the grid's row count: a live recompile + reinstall that must NOT
    // blank the preview (the renderer is not disposed; the loop is not restarted).
    const rows = page.getByTestId('native-config-grid-rows');
    await rows.fill('5');
    await rows.blur();
    await page.waitForTimeout(FRAME_INTERVAL_MS);

    const afterEdit = await captureFrame(canvas, resolve(ARTIFACT_DIR, 'edit-after.png'), BLACK_CHANNEL_THRESHOLD);

    const compileOrRuntimeErrors = issues.filter((i) => i.level === 'error' && !LEGACY_PATH.test(i.text));

    expect(beforeEdit.nonBlack, 'preview blank before edit').toBeGreaterThan(0);
    expect(afterEdit.nonBlack, 'preview blank after edit — recompile tore down the preview').toBeGreaterThan(0);
    expect(afterEdit.checksum !== beforeEdit.checksum, 'preview did not update after the edit').toBe(true);
    expect(compileOrRuntimeErrors, compileOrRuntimeErrors.map((i) => i.text).join('\n')).toEqual([]);
  });

  // oscilla-pillars-scene-nt56.9: a live edit reinstalls a new ScenePlan by
  // reconciling against the realized scene (reusing unchanged objects, rebuilding
  // changed ones) instead of tearing the scene down. After the reinstall,
  // time-driven animation must keep advancing — the edit must not freeze or
  // restart the loop. // [LAW:no-ambient-temporal-coupling]
  test('keeps time-driven animation advancing across a live reinstall', async ({ page }) => {
    test.setTimeout(120_000);
    const issues = attachBrowserIssueCollector(page);

    await page.goto('/?scenePlan=editor', { waitUntil: 'domcontentloaded' });
    const canvas = page.getByTestId('native-editor-canvas');
    await expect(canvas).toBeVisible();
    mkdirSync(ARTIFACT_DIR, { recursive: true });

    await expect
      .poll(
        async () => (await captureFrame(canvas, resolve(ARTIFACT_DIR, 'reinstall-boot.png'), BLACK_CHANNEL_THRESHOLD)).nonBlack,
        { timeout: 30_000, message: 'the editor preview never rendered content' },
      )
      .toBeGreaterThan(0);

    // Trigger a live reinstall (a config edit recompiles → reconcile install).
    const rows = page.getByTestId('native-config-grid-rows');
    await rows.fill('6');
    await rows.blur();
    await page.waitForTimeout(FRAME_INTERVAL_MS);

    // Two frames captured AFTER the reinstall must differ: the time-driven
    // animation is still running, so the reinstall did not freeze the loop.
    const post0 = await captureFrame(canvas, resolve(ARTIFACT_DIR, 'reinstall-post-0.png'), BLACK_CHANNEL_THRESHOLD);
    await page.waitForTimeout(FRAME_INTERVAL_MS);
    const post1 = await captureFrame(canvas, resolve(ARTIFACT_DIR, 'reinstall-post-1.png'), BLACK_CHANNEL_THRESHOLD);

    const compileOrRuntimeErrors = issues.filter((i) => i.level === 'error' && !LEGACY_PATH.test(i.text));

    expect(post0.nonBlack, 'preview blank after reinstall').toBeGreaterThan(0);
    expect(post1.nonBlack, 'preview blank after reinstall').toBeGreaterThan(0);
    expect(post1.checksum !== post0.checksum, 'animation frozen after reinstall — the loop did not keep advancing').toBe(true);
    expect(compileOrRuntimeErrors, compileOrRuntimeErrors.map((i) => i.text).join('\n')).toEqual([]);
  });
});
