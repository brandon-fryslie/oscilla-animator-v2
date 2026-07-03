/**
 * tests/e2e/webgpu/three-accumulator.spec.ts
 *
 * Visual proof for oscilla-pillars-scene-nt56.18 (ScenePlan-native stateful-value
 * continuity): a `grid → WaveOffset(amplitude ← Accumulator, speed ← 0) → draw`
 * patch renders a wave whose amplitude is driven ONLY by an Accumulator — a value
 * that ramps by a fixed increment every frame. WaveOffset's time term is zeroed,
 * so the wave carries no time dependence; a pixel change between frames can only
 * come from the accumulator's renderer-owned cell advancing frame over frame.
 *
 * This isolates statefulness end-to-end (compiler → ScenePlan `states` → CPU state
 * advance → TSL `state` uniform → WebGPU): if the cell were not carried across
 * frames, the amplitude would be constant and the grid would sit still. That the
 * frames keep differing is the recurrence being closed at the frame boundary.
 * // [LAW:no-silent-failure]
 *
 * The render originates from the canonical Oscilla patch model
 * (`makeAccumulatorPatch`) compiled by `compileScenePlan` and installed via the
 * `createWebGPURenderer()` seam; no hand-authored Three scene is on the path.
 * // [LAW:one-source-of-truth]
 *
 * MUST run headed: the Three device acquires lazily on the first frame and has no
 * headless WebGPU adapter. PNG-decode/frame-diff machinery is shared with the
 * other steel-thread proofs in ./canvas-frame-proof.ts. // [LAW:one-source-of-truth]
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

const ARTIFACT_DIR = resolve('artifacts/three-migration/nt56.18-accumulator');
const FRAME_INTERVAL_MS = 350;
const BLACK_CHANNEL_THRESHOLD = 8;
const LEGACY_PATH = /PipelineInstallPayload|INSTALL_PIPELINE|rust worker|engine\.worker|boundary-contract|WASM renderer/i;

test.describe('Three native stateful accumulator', () => {
  test('renders a wave whose amplitude is driven only by accumulated state, animating frame over frame', async ({ page }) => {
    test.setTimeout(120_000);
    const issues = attachBrowserIssueCollector(page);
    mkdirSync(ARTIFACT_DIR, { recursive: true });

    await awaitScenePlanRendering(page, 'accumulator');
    const canvas = page.getByTestId('preview-canvas');

    // Three frames over time: the amplitude ramps as the accumulator advances, so
    // each frame differs from the last even though the render reads no live time.
    const f0 = await captureFrame(canvas, resolve(ARTIFACT_DIR, 'acc-000.png'), BLACK_CHANNEL_THRESHOLD);
    await page.waitForTimeout(FRAME_INTERVAL_MS);
    const f1 = await captureFrame(canvas, resolve(ARTIFACT_DIR, 'acc-001.png'), BLACK_CHANNEL_THRESHOLD);
    await page.waitForTimeout(FRAME_INTERVAL_MS);
    const f2 = await captureFrame(canvas, resolve(ARTIFACT_DIR, 'acc-002.png'), BLACK_CHANNEL_THRESHOLD);

    const deviceFaultIssues = issues.filter((i) => i.text.includes('THREE_DEVICE_INIT_FAILED'));
    const legacyPathIssues = issues.filter((i) => LEGACY_PATH.test(i.text));
    const bootstrapFailureIssues = issues.filter((i) => i.text.includes('Failed to initialize runtime:'));

    writeFileSync(
      resolve(ARTIFACT_DIR, 'summary.json'),
      `${JSON.stringify(
        {
          ticket: 'oscilla-pillars-scene-nt56.18',
          chain: 'InstanceGrid → WaveOffset(amplitude ← Accumulator, speed ← Constant 0) → SolidColor → DrawInstances',
          capability: 'renderer-owned stateful cell (Accumulator) advanced each frame, driving the wave amplitude',
          frames: { f0, f1, f2 },
          animatedFromState: f0.checksum !== f1.checksum && f1.checksum !== f2.checksum,
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

    // Every frame renders visible content.
    expect(f0.nonBlack, 'frame 0 rendered blank').toBeGreaterThan(0);
    expect(f1.nonBlack, 'frame 1 rendered blank').toBeGreaterThan(0);
    expect(f2.nonBlack, 'frame 2 rendered blank').toBeGreaterThan(0);

    // The only animator is the accumulator (time is zeroed), so a between-frame
    // change proves the renderer-owned cell is advancing and being read on the GPU.
    expect(f0.checksum !== f1.checksum, 'no motion between frames 0 and 1 — the accumulator cell is not advancing').toBe(true);
    expect(f1.checksum !== f2.checksum, 'no motion between frames 1 and 2 — the accumulator cell is not advancing').toBe(true);
  });
});
