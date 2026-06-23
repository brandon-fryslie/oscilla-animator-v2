/**
 * tests/e2e/webgpu/three-grid-of-squares.spec.ts
 *
 * Steel-thread proof for the Three migration (oscilla-pillars-cleanup-ulu.5).
 * The canonical proof contract is design-docs/three-migration-first-proof-contract.md
 * §"Verification Contract": boot the existing app shell, load the authored
 * `Grid of Squares` patch, render it through the Three backend, and prove the
 * preview canvas shows visible, time-animated content — with no Rust worker,
 * WASM renderer, or PipelineInstallPayload on the path.
 *
 * The render content originates from the canonical Oscilla patch model
 * (`makeGridOfSquaresPatch`) compiled by `compileScenePlan` and installed via the
 * `createWebGPURenderer()` seam (`?scenePlan=grid-of-squares`); no hand-authored
 * Three scene exists on the path. // [LAW:one-source-of-truth]
 *
 * MUST run headed: the Three device acquires lazily on the first frame and has no
 * headless WebGPU adapter — headless reports a fatal GpuFault
 * (THREE_DEVICE_INIT_FAILED). // [LAW:no-silent-failure]
 *
 * Pixel proof reads the Playwright canvas screenshot, decoded with Node's
 * built-in zlib: a WebGPU swapchain canvas is not captured by an in-page
 * `drawImage`, but Playwright's compositor screenshots it faithfully.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { expect, test, type Page, type Locator } from '@playwright/test';
import { RUNTIME_PROBE_GLOBAL_KEY, type RuntimeProbeSnapshot } from '../../../src/testing/runtime-probe';

// The Three backend needs a real GPU adapter, which the default headless
// Chromium lacks. Run this proof headed.
test.use({
  headless: false,
  launchOptions: { args: ['--enable-unsafe-webgpu'] },
});

const SELECTED_PATCH_ID = 'grid-of-squares';
const SELECTED_PATCH_NAME = 'Grid of Squares';
const ARTIFACT_DIR = resolve('artifacts/three-migration/ulu.5-grid-of-squares');
const FRAME_INTERVAL_MS = 400;
// A black clear color means background channels are ~0; anything brighter is
// rendered grid content.
const BLACK_CHANNEL_THRESHOLD = 8;

interface BrowserIssue {
  readonly source: 'console' | 'pageerror';
  readonly level: 'warning' | 'error';
  readonly text: string;
}

function attachBrowserIssueCollector(page: Page): BrowserIssue[] {
  const issues: BrowserIssue[] = [];
  page.on('console', (message) => {
    const type = message.type();
    if (type !== 'warning' && type !== 'error') return;
    issues.push({ source: 'console', level: type, text: message.text() });
  });
  page.on('pageerror', (error: Error) => {
    issues.push({ source: 'pageerror', level: 'error', text: error.message });
  });
  return issues;
}

async function readRuntimeProbe(page: Page): Promise<RuntimeProbeSnapshot | null> {
  return await page.evaluate((probeKey) => {
    const host = window as typeof window & Record<string, unknown>;
    const probe = host[probeKey];
    return probe && typeof probe === 'object' ? (probe as RuntimeProbeSnapshot) : null;
  }, RUNTIME_PROBE_GLOBAL_KEY);
}

interface DecodedImage {
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly data: Uint8Array;
}

/** Minimal PNG decoder (8-bit, non-interlaced, color type 0/2/4/6). */
function decodePng(buffer: Buffer): DecodedImage {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < signature.length; i++) {
    if (buffer[i] !== signature[i]) throw new Error('not a PNG');
  }
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  let pos = 8;
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    const dataStart = pos + 8;
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer[dataStart + 8];
      colorType = buffer[dataStart + 9];
      interlace = buffer[dataStart + 12];
    } else if (type === 'IDAT') {
      idat.push(buffer.subarray(dataStart, dataStart + length));
    } else if (type === 'IEND') {
      break;
    }
    pos = dataStart + length + 4; // skip CRC
  }
  if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth}`);
  if (interlace !== 0) throw new Error('interlaced PNG unsupported');
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 0 ? 1 : -1;
  if (channels < 0) throw new Error(`unsupported PNG color type ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(height * stride);
  const paeth = (a: number, b: number, c: number): number => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[rp++];
      const a = x >= channels ? out[row + x - channels] : 0;
      const b = y > 0 ? out[row - stride + x] : 0;
      const c = x >= channels && y > 0 ? out[row - stride + x - channels] : 0;
      let recon: number;
      switch (filter) {
        case 0: recon = value; break;
        case 1: recon = value + a; break;
        case 2: recon = value + b; break;
        case 3: recon = value + ((a + b) >> 1); break;
        case 4: recon = value + paeth(a, b, c); break;
        default: throw new Error(`unknown PNG filter ${filter}`);
      }
      out[row + x] = recon & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

interface FrameStats {
  readonly width: number;
  readonly height: number;
  readonly nonBlack: number;
  readonly checksum: number;
}

/**
 * Non-blank count (pixels brighter than the black clear color) plus a
 * position-weighted content checksum, so a rotation/hue change between frames
 * registers as a different value.
 */
function frameStats(image: DecodedImage, blackThreshold: number): FrameStats {
  const { data, channels, width, height } = image;
  let nonBlack = 0;
  let checksum = 0;
  for (let i = 0, p = 0; i < data.length; i += channels, p++) {
    const r = data[i];
    const g = channels > 1 ? data[i + 1] : r;
    const b = channels > 2 ? data[i + 2] : r;
    if (r > blackThreshold || g > blackThreshold || b > blackThreshold) nonBlack++;
    checksum = (checksum + (r * 3 + g * 5 + b * 7) * ((p % 4096) + 1)) >>> 0;
  }
  return { width, height, nonBlack, checksum };
}

async function captureFrame(canvas: Locator, fileName: string): Promise<FrameStats> {
  const buffer = await canvas.screenshot({ path: resolve(ARTIFACT_DIR, fileName) });
  return frameStats(decodePng(buffer), BLACK_CHANNEL_THRESHOLD);
}

test.describe('Three Grid of Squares steel thread', () => {
  test('renders the authored Grid of Squares patch through the Three backend with visible, animated content', async ({ page }) => {
    // Headed boot pays a cold vite start, WASM bootstrap, and Three device
    // acquisition; the probe polls below hold the real success criteria.
    test.setTimeout(120_000);
    const issues = attachBrowserIssueCollector(page);

    await page.goto(`/?scenePlan=${SELECTED_PATCH_ID}&showPreview=true`, {
      waitUntil: 'domcontentloaded',
    });

    // [LAW:verifiable-goals] Boot is proven by the canonical runtime probe, not
    //   incidental UI: the ScenePlan steel thread marks bootstrap succeeded once
    //   the plan compiles and installs.
    await expect
      .poll(async () => (await readRuntimeProbe(page))?.bootstrap.state ?? 'missing', {
        timeout: 30_000,
        message: 'runtime bootstrap never reached a terminal state',
      })
      .toBe('succeeded');

    // Wait for several frames so time has advanced between our two samples.
    await expect
      .poll(async () => (await readRuntimeProbe(page))?.loop.renderedFrameCount ?? 0, {
        timeout: 30_000,
        message: 'the ScenePlan render loop never advanced',
      })
      .toBeGreaterThan(2);

    const canvas = page.getByTestId('preview-canvas');
    mkdirSync(ARTIFACT_DIR, { recursive: true });

    const frame0 = await captureFrame(canvas, 'frame-000.png');
    await page.waitForTimeout(FRAME_INTERVAL_MS);
    const frame1 = await captureFrame(canvas, 'frame-001.png');

    const probe = await readRuntimeProbe(page);

    // A render appears with no legacy GPU-IR / Rust-worker / WASM path engaged.
    const deviceFaultIssues = issues.filter((issue) => issue.text.includes('THREE_DEVICE_INIT_FAILED'));
    const legacyPathIssues = issues.filter((issue) =>
      /PipelineInstallPayload|INSTALL_PIPELINE|rust worker|engine\.worker|boundary-contract|WASM renderer/i.test(issue.text),
    );
    const bootstrapFailureIssues = issues.filter((issue) => issue.text.includes('Failed to initialize runtime:'));

    const frame0Blank = frame0.nonBlack === 0;
    const frame1Blank = frame1.nonBlack === 0;
    const framesDiffered = frame0.checksum !== frame1.checksum;

    const summary = {
      ticket: 'oscilla-pillars-cleanup-ulu.5',
      patch: { id: SELECTED_PATCH_ID, name: SELECTED_PATCH_NAME },
      previewBooted: probe?.bootstrap.state === 'succeeded',
      renderedFrameCount: probe?.loop.renderedFrameCount ?? 0,
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
      generatedAt: new Date().toISOString(),
    };
    writeFileSync(resolve(ARTIFACT_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

    // ── Success signals (three-migration-first-proof-contract.md) ──
    expect(deviceFaultIssues, deviceFaultIssues.map((i) => i.text).join('\n')).toEqual([]);
    expect(bootstrapFailureIssues, bootstrapFailureIssues.map((i) => i.text).join('\n')).toEqual([]);
    expect(legacyPathIssues, legacyPathIssues.map((i) => i.text).join('\n')).toEqual([]);
    expect(frame0Blank, 'frame 0 rendered blank').toBe(false);
    expect(frame1Blank, 'frame 1 rendered blank').toBe(false);
    expect(framesDiffered, 'the two frames are identical — time-driven animation is not active').toBe(true);
  });
});
