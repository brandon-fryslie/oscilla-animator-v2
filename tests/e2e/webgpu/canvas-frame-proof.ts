/**
 * tests/e2e/webgpu/canvas-frame-proof.ts
 *
 * Shared proof helpers for the Three-migration steel-thread e2es: collecting
 * browser console/page issues, reading the canonical runtime probe, and
 * decoding a WebGPU swapchain canvas screenshot to measure rendered content.
 *
 * A WebGPU swapchain canvas is NOT captured by an in-page `drawImage`, but
 * Playwright's compositor screenshots it faithfully; these helpers decode that
 * PNG with Node's built-in zlib and reduce it to a non-blank count plus a
 * position-weighted checksum, so a between-frame animation change registers.
 *
 * [LAW:one-source-of-truth] Every steel-thread proof (grid-of-squares,
 *   textured-tiles, …) shares this one decode/measure path rather than each
 *   spec carrying a divergent copy of the PNG decoder.
 */

import { inflateSync } from 'node:zlib';
import { expect, type Page, type Locator } from '@playwright/test';
import { RUNTIME_PROBE_GLOBAL_KEY, type RuntimeProbeSnapshot } from '../../../src/testing/runtime-probe';

export interface BrowserIssue {
  readonly source: 'console' | 'pageerror';
  readonly level: 'warning' | 'error';
  readonly text: string;
}

export function attachBrowserIssueCollector(page: Page): BrowserIssue[] {
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

export async function readRuntimeProbe(page: Page): Promise<RuntimeProbeSnapshot | null> {
  return await page.evaluate((probeKey) => {
    const host = window as typeof window & Record<string, unknown>;
    const probe = host[probeKey];
    return probe && typeof probe === 'object' ? (probe as RuntimeProbeSnapshot) : null;
  }, RUNTIME_PROBE_GLOBAL_KEY);
}

export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly data: Uint8Array;
}

/** Minimal PNG decoder (8-bit, non-interlaced, color type 0/2/4/6). */
export function decodePng(buffer: Buffer): DecodedImage {
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

export interface FrameStats {
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
export function frameStats(image: DecodedImage, blackThreshold: number): FrameStats {
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

/** Screenshot a canvas to `path` and reduce it to frame stats. */
export async function captureFrame(canvas: Locator, path: string, blackThreshold: number): Promise<FrameStats> {
  const buffer = await canvas.screenshot({ path });
  return frameStats(decodePng(buffer), blackThreshold);
}

/**
 * The shared steel-thread render gate: boot the app shell at the given scene
 * plan, prove the runtime bootstrap succeeds and the render loop advances. Polls
 * the canonical runtime probe, not incidental UI. [LAW:verifiable-goals]
 */
export async function awaitScenePlanRendering(page: Page, scenePlanId: string): Promise<void> {
  await page.goto(`/?scenePlan=${scenePlanId}&showPreview=true`, { waitUntil: 'domcontentloaded' });

  await expect
    .poll(async () => (await readRuntimeProbe(page))?.bootstrap.state ?? 'missing', {
      timeout: 30_000,
      message: 'runtime bootstrap never reached a terminal state',
    })
    .toBe('succeeded');

  await expect
    .poll(async () => (await readRuntimeProbe(page))?.loop.renderedFrameCount ?? 0, {
      timeout: 30_000,
      message: 'the ScenePlan render loop never advanced',
    })
    .toBeGreaterThan(2);
}
