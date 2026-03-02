#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const BASE_URL = process.env.WEBGPU_MATRIX_URL ?? 'http://127.0.0.1:5174';
const DEFAULT_REPORT = process.env.WEBGPU_MATRIX_REPORT ?? 'artifacts/webgpu-browser-matrix.json';
const SAMPLE_FRAMES = Number.parseInt(process.env.WEBGPU_MATRIX_FRAMES ?? '180', 10);
const START_SERVER = (process.env.WEBGPU_MATRIX_START_SERVER ?? '1') !== '0';
const SERVER_TIMEOUT_MS = Number.parseInt(process.env.WEBGPU_MATRIX_SERVER_TIMEOUT_MS ?? '45000', 10);

function withPreviewParam(url) {
  const parsed = new URL(url);
  if (!parsed.searchParams.has('showPreview')) {
    parsed.searchParams.set('showPreview', 'true');
  }
  return parsed.toString();
}

const TARGET_URL = withPreviewParam(BASE_URL);

async function isHttpReady(url) {
  try {
    const response = await fetch(url, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForHttpReady(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isHttpReady(url)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for server: ${url}`);
}

async function startDevServer(url) {
  if (!START_SERVER) {
    return null;
  }

  if (await isHttpReady(url)) {
    process.stdout.write(`[matrix] Reusing existing dev server at ${url}\n`);
    return null;
  }

  const serverProcess = spawn(
    'pnpm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5174', '--strictPort'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    }
  );

  serverProcess.stdout?.on('data', (chunk) => {
    process.stdout.write(`[matrix:dev] ${chunk}`);
  });
  serverProcess.stderr?.on('data', (chunk) => {
    process.stderr.write(`[matrix:dev] ${chunk}`);
  });

  await waitForHttpReady(url, SERVER_TIMEOUT_MS);
  return serverProcess;
}

function computeStats(frameDeltasMs) {
  const sorted = [...frameDeltasMs].sort((a, b) => a - b);
  const avg = sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length);
  const p95Index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * 0.95)));
  const p95 = sorted[p95Index] ?? 0;
  return {
    sampleCount: sorted.length,
    avgFrameDeltaMs: Number(avg.toFixed(3)),
    p95FrameDeltaMs: Number(p95.toFixed(3)),
    avgFps: Number((1000 / Math.max(0.0001, avg)).toFixed(2)),
  };
}

async function runBrowserCheck({ browserName, launcher, launchOptions, url, blocking }) {
  const browser = await launcher.launch({ headless: true, ...launchOptions });
  const browserVersion = browser.version();
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  const startedAt = Date.now();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForSelector('canvas', { timeout: 30_000 });

  const probe = await page.evaluate(async (sampleFrames) => {
    const hasNavigatorGpu = Boolean(navigator.gpu);
    const adapter = hasNavigatorGpu ? await navigator.gpu.requestAdapter() : null;
    const hasAdapter = Boolean(adapter);
    const canvas = document.querySelector('canvas');
    const hasCanvas = Boolean(canvas);
    const hasWebGPUContext = Boolean(canvas?.getContext('webgpu'));

    const frameDeltasMs = [];
    await new Promise((resolve) => {
      let previous = performance.now();
      let remaining = Math.max(1, sampleFrames);
      const tick = (now) => {
        frameDeltasMs.push(now - previous);
        previous = now;
        remaining -= 1;
        if (remaining <= 0) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    return {
      hasNavigatorGpu,
      hasAdapter,
      hasCanvas,
      hasWebGPUContext,
      frameDeltasMs,
    };
  }, SAMPLE_FRAMES);

  await browser.close();

  const timing = computeStats(probe.frameDeltasMs);
  const readiness = {
    hasNavigatorGpu: probe.hasNavigatorGpu,
    hasAdapter: probe.hasAdapter,
    hasCanvas: probe.hasCanvas,
    hasWebGPUContext: probe.hasWebGPUContext,
    consoleErrorCount: consoleErrors.length,
    pageErrorCount: pageErrors.length,
  };

  // [LAW:verifiable-goals] The gate is deterministic and machine-checkable.
  // [LAW:no-silent-fallbacks] Any readiness failure is surfaced as a hard failed check.
  const passed =
    readiness.hasNavigatorGpu &&
    readiness.hasAdapter &&
    readiness.hasCanvas &&
    readiness.hasWebGPUContext &&
    readiness.consoleErrorCount === 0 &&
    readiness.pageErrorCount === 0;

  const failureReason =
    passed
      ? null
      : !readiness.hasNavigatorGpu
        ? 'webgpu_api_unavailable'
        : !readiness.hasAdapter
          ? 'webgpu_adapter_unavailable'
          : !readiness.hasWebGPUContext
            ? 'webgpu_context_unavailable'
            : readiness.consoleErrorCount > 0
              ? 'runtime_console_errors'
              : readiness.pageErrorCount > 0
                ? 'runtime_page_errors'
                : 'unknown';

  return {
    browser: browserName,
    blocking,
    browserVersion,
    url,
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    readiness,
    timing,
    errors: {
      console: consoleErrors,
      page: pageErrors,
    },
    failureReason,
    passed,
  };
}

async function main() {
  const devServer = await startDevServer(TARGET_URL);

  try {
    // [LAW:single-enforcer] Chromium is the canonical gating lane for W15.
    const checks = [
      {
        browserName: 'chromium',
        launcher: chromium,
        launchOptions: {
          args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader'],
        },
        url: TARGET_URL,
        blocking: true,
      },
    ];

    const results = [];
    for (const check of checks) {
      process.stdout.write(`[matrix] Running ${check.browserName} WebGPU check...\n`);
      // [LAW:dataflow-not-control-flow] Matrix executes the same check pipeline
      // for each browser; browser differences are data values in this list.
      try {
        results.push(await runBrowserCheck(check));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          browser: check.browserName,
          blocking: check.blocking,
          browserVersion: null,
          url: TARGET_URL,
          startedAt: new Date().toISOString(),
          durationMs: 0,
          readiness: {
            hasNavigatorGpu: false,
            hasAdapter: false,
            hasCanvas: false,
            hasWebGPUContext: false,
            consoleErrorCount: 0,
            pageErrorCount: 0,
          },
          timing: {
            sampleCount: 0,
            avgFrameDeltaMs: 0,
            p95FrameDeltaMs: 0,
            avgFps: 0,
          },
          errors: {
            console: [],
            page: [],
            setup: [message],
          },
          failureReason: 'browser_launch_failed',
          passed: false,
        });
      }
    }

    // [LAW:verifiable-goals] Keep an explicit full-matrix pass expression for static gate enforcement.
    const allBrowsersPassed = results.every((result) => result.passed);
    const report = {
      generatedAt: new Date().toISOString(),
      sampleFrames: SAMPLE_FRAMES,
      url: TARGET_URL,
      results,
      gatingBrowsers: results.filter((result) => result.blocking).map((result) => result.browser),
      nonBlockingBrowsers: results.filter((result) => !result.blocking).map((result) => result.browser),
      passed: results.filter((result) => result.blocking).every((result) => result.passed),
      hardPassed: allBrowsersPassed,
    };

    const reportPath = path.resolve(DEFAULT_REPORT);
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2));

    process.stdout.write(`[matrix] Report written: ${reportPath}\n`);
    for (const result of results) {
      process.stdout.write(
        `[matrix] ${result.browser}: ${result.passed ? 'PASS' : 'FAIL'} ` +
          `[${result.blocking ? 'blocking' : 'non-blocking'}] ` +
          `(gpu=${result.readiness.hasNavigatorGpu}, adapter=${result.readiness.hasAdapter}, ` +
          `context=${result.readiness.hasWebGPUContext}, ` +
          `avg=${result.timing.avgFrameDeltaMs}ms, p95=${result.timing.p95FrameDeltaMs}ms)\n`
      );
    }

    if (!report.passed) {
      process.exitCode = 1;
    }
  } finally {
    if (devServer) {
      devServer.kill('SIGTERM');
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[matrix] Failed: ${message}\n`);
  process.exit(1);
});
