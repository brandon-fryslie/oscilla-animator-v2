#!/usr/bin/env node
/**
 * check-payload-tester-visible.mjs
 *
 * Smoke-checks payload-tester canonical boundary path end-to-end:
 * fixture click auto-install -> per-frame publication -> visible canvas.
 *
 * Requires a running dev server.
 * Usage:
 *   APP_PORT=5784 PAYLOAD_TESTER_FIXTURE="Audio Reactive" node scripts/check-payload-tester-visible.mjs
 */

import { chromium } from '@playwright/test';

const appPort = process.env.APP_PORT ?? '5784';
const targetUrl = `http://127.0.0.1:${appPort}/payload-tester.html`;
const outputPath = process.env.PAYLOAD_TESTER_SCREENSHOT ?? '/tmp/oscilla-payload-tester-visible.png';
const fixtureName = process.env.PAYLOAD_TESTER_FIXTURE ?? 'Audio Reactive';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-webgpu'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

try {
  const response = await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30_000 });
  if (!response || !response.ok()) {
    fail(`unable to load ${targetUrl} (status=${response?.status() ?? 'n/a'})`);
  }

  await page.waitForSelector('canvas', { timeout: 20_000 });
  await Promise.race([
    page.getByText('Renderer ready', { exact: false }).waitFor({ timeout: 20_000 }),
    page.getByText('Renderer booting...', { exact: false }).waitFor({ timeout: 20_000 }),
    page.locator('text=/GPU fault|Renderer boot failed|Rust renderer requires/i').waitFor({ timeout: 20_000 }),
  ]);
  const statusText = await page.locator('body').innerText();
  if (!statusText.includes('Renderer ready')) {
    fail(`renderer did not reach ready state; status snapshot: ${statusText.slice(0, 300)}`);
  }
  await page.getByRole('button', { name: new RegExp(fixtureName, 'i') }).click({ timeout: 10_000 });
  await Promise.race([
    page.getByText(/Installed .* pass\(es\) and started frame publication/, { exact: false }).waitFor({
      timeout: 20_000,
    }),
    page.getByText(/Renderer error|Rust renderer boundary validation failed|GPU fault/i).waitFor({
      timeout: 20_000,
    }),
  ]);
  const postInstallStatus = await page.locator('body').innerText();
  if (!postInstallStatus.includes('Installed')) {
    fail(`install did not succeed; status snapshot: ${postInstallStatus.slice(0, 500)}`);
  }
  await page.waitForTimeout(fixtureName.toLowerCase().includes('audio') ? 1500 : 1000);

  const sample = await page.evaluate(() => {
    const src = document.querySelector('canvas');
    if (!(src instanceof HTMLCanvasElement)) {
      return { ok: false, reason: 'canvas element missing' };
    }

    const width = Math.max(1, Math.floor(src.clientWidth || src.width || 1));
    const height = Math.max(1, Math.floor(src.clientHeight || src.height || 1));
    const readback = document.createElement('canvas');
    readback.width = width;
    readback.height = height;
    const ctx = readback.getContext('2d');
    if (!ctx) {
      return { ok: false, reason: '2d context unavailable' };
    }
    ctx.drawImage(src, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    let nonBlackPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      if (r + g + b > 12) {
        nonBlackPixels += 1;
      }
    }
    let luminanceCount = 0;
    let luminanceMin = Number.POSITIVE_INFINITY;
    let luminanceMax = Number.NEGATIVE_INFINITY;
    let luminanceMean = 0;
    let luminanceM2 = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (luma <= 20) {
        continue;
      }
      luminanceCount += 1;
      if (luma < luminanceMin) luminanceMin = luma;
      if (luma > luminanceMax) luminanceMax = luma;
      const delta = luma - luminanceMean;
      luminanceMean += delta / luminanceCount;
      const delta2 = luma - luminanceMean;
      luminanceM2 += delta * delta2;
    }
    const luminanceStdDev = luminanceCount > 0
      ? Math.sqrt(luminanceM2 / luminanceCount)
      : 0;
    if (luminanceCount === 0) {
      luminanceMin = 0;
      luminanceMax = 0;
    }

    return {
      ok: true,
      width,
      height,
      nonBlackPixels,
      totalPixels: width * height,
      ratio: nonBlackPixels / (width * height),
      luminanceCount,
      luminanceStdDev,
      luminanceMin,
      luminanceMax,
    };
  });

  if (!sample.ok) {
    fail(`canvas sampling failed: ${sample.reason}`);
  }
  if (sample.nonBlackPixels <= 10) {
    fail(
      `canvas appears black (nonBlackPixels=${sample.nonBlackPixels}, totalPixels=${sample.totalPixels})`,
    );
  }
  if (fixtureName.toLowerCase().includes('audio')) {
    if (sample.luminanceCount < 200) {
      fail(`audio fixture produced too few lit pixels for luminance analysis (count=${sample.luminanceCount})`);
    }
    if (sample.luminanceStdDev < 8 || sample.luminanceMax - sample.luminanceMin < 28) {
      fail(
        `audio bars do not show expected lightness variation (stdDev=${sample.luminanceStdDev.toFixed(2)}, range=${(sample.luminanceMax - sample.luminanceMin).toFixed(2)})`,
      );
    }
  }

  await page.screenshot({ path: outputPath, fullPage: true });
  console.info(
    `PASS: payload tester visible output verified for "${fixtureName}" (nonBlackPixels=${sample.nonBlackPixels}, ratio=${sample.ratio.toFixed(6)}, luminanceStdDev=${sample.luminanceStdDev.toFixed(2)})`,
  );
  console.info(`Screenshot: ${outputPath}`);
} finally {
  await browser.close();
}
