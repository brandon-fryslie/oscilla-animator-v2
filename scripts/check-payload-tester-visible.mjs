#!/usr/bin/env node
/**
 * check-payload-tester-visible.mjs
 *
 * Smoke-checks payload-tester canonical boundary path end-to-end:
 * fixture install -> per-frame publication -> non-black canvas.
 *
 * Requires a running dev server.
 * Usage:
 *   APP_PORT=5784 node scripts/check-payload-tester-visible.mjs
 */

import { chromium } from '@playwright/test';

const appPort = process.env.APP_PORT ?? '5784';
const targetUrl = `http://127.0.0.1:${appPort}/payload-tester.html`;
const outputPath = process.env.PAYLOAD_TESTER_SCREENSHOT ?? '/tmp/oscilla-payload-tester-visible.png';

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
  await page.getByRole('button', { name: 'Visible Triangle' }).click({ timeout: 10_000 });
  await page.getByRole('button', { name: /Install \+ Run/ }).click({ timeout: 10_000 });
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
  await page.waitForTimeout(1000);

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
    return {
      ok: true,
      width,
      height,
      nonBlackPixels,
      totalPixels: width * height,
      ratio: nonBlackPixels / (width * height),
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

  await page.screenshot({ path: outputPath, fullPage: true });
  console.info(
    `PASS: payload tester visible output verified (nonBlackPixels=${sample.nonBlackPixels}, ratio=${sample.ratio.toFixed(6)})`,
  );
  console.info(`Screenshot: ${outputPath}`);
} finally {
  await browser.close();
}
