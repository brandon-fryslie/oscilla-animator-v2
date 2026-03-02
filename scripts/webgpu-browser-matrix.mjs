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
const BUILD_FIRST = (process.env.WEBGPU_MATRIX_BUILD_FIRST ?? '1') !== '0';
const SERVER_MODE = process.env.WEBGPU_MATRIX_SERVER_MODE ?? 'preview';
const SERVER_TIMEOUT_MS = Number.parseInt(process.env.WEBGPU_MATRIX_SERVER_TIMEOUT_MS ?? '45000', 10);
const FAIL_ON_SKIP = (process.env.WEBGPU_MATRIX_FAIL_ON_SKIP ?? (process.env.CI ? '1' : '0')) !== '0';
const ALLOW_SERVER_REUSE = (process.env.WEBGPU_MATRIX_ALLOW_SERVER_REUSE ?? (process.env.CI ? '0' : '1')) !== '0';
const SKIP_CHROMIUM = (process.env.WEBGPU_MATRIX_SKIP_CHROMIUM ?? '0') === '1';

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

async function runCommand(command, args, label) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    child.stdout?.on('data', (chunk) => {
      process.stdout.write(`[matrix:${label}] ${chunk}`);
    });
    child.stderr?.on('data', (chunk) => {
      process.stderr.write(`[matrix:${label}] ${chunk}`);
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${label} failed (command=${command} ${args.join(' ')}, code=${code}, signal=${signal ?? 'none'})`,
        ),
      );
    });
  });
}

async function startManagedServer(url) {
  if (!START_SERVER) {
    return null;
  }

  const urlReady = await isHttpReady(url);
  if (urlReady) {
    if (!ALLOW_SERVER_REUSE) {
      throw new Error(
        `Server already running at ${url}; refusing reuse (WEBGPU_MATRIX_ALLOW_SERVER_REUSE=0).`,
      );
    }
    process.stdout.write(`[matrix] Reusing existing server at ${url}\n`);
    return null;
  }

  // [LAW:single-enforcer] Browser matrix owns prerequisite orchestration:
  // build -> serve -> probe in one deterministic pipeline.
  if (BUILD_FIRST) {
    await runCommand('pnpm', ['run', 'build'], 'build');
  }

  const serverArgs =
    SERVER_MODE === 'dev'
      ? ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5174', '--strictPort']
      : ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', '5174', '--strictPort'];

  const serverProcess = spawn('pnpm', serverArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  serverProcess.stdout?.on('data', (chunk) => {
    process.stdout.write(`[matrix:${SERVER_MODE}] ${chunk}`);
  });
  serverProcess.stderr?.on('data', (chunk) => {
    process.stderr.write(`[matrix:${SERVER_MODE}] ${chunk}`);
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

function getChecks() {
  return [
    {
      browserName: 'chromium',
      launcher: chromium,
      launchOptions: {
        args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader'],
      },
      url: TARGET_URL,
      blocking: true,
      skipReason: SKIP_CHROMIUM ? 'disabled_by_env_WEBGPU_MATRIX_SKIP_CHROMIUM' : null,
    },
  ];
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

    const readProbe = () => {
      const host = globalThis;
      const value = host.__OSCILLA_RUNTIME_PROBE__;
      return value && typeof value === 'object' ? value : null;
    };
    const probeBefore = readProbe();
    const beforeFrameCount =
      typeof probeBefore?.loop?.renderedFrameCount === 'number'
        ? probeBefore.loop.renderedFrameCount
        : null;

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

    const probeAfter = readProbe();
    const afterFrameCount =
      typeof probeAfter?.loop?.renderedFrameCount === 'number'
        ? probeAfter.loop.renderedFrameCount
        : null;
    const frameAdvanceCount =
      beforeFrameCount === null || afterFrameCount === null ? null : afterFrameCount - beforeFrameCount;

    return {
      hasNavigatorGpu,
      hasAdapter,
      hasCanvas,
      hasWebGPUContext,
      frameDeltasMs,
      runtimeProbe: {
        present: probeAfter !== null,
        bootstrapState:
          typeof probeAfter?.bootstrap?.state === 'string' ? probeAfter.bootstrap.state : null,
        bootstrapFailureMessage:
          typeof probeAfter?.bootstrap?.failureMessage === 'string'
            ? probeAfter.bootstrap.failureMessage
            : null,
        renderedFramesBeforeSample: beforeFrameCount,
        renderedFramesAfterSample: afterFrameCount,
        frameAdvanceCount,
      },
    };
  }, SAMPLE_FRAMES);

  await browser.close();

  const timing = computeStats(probe.frameDeltasMs);
  const readiness = {
    hasNavigatorGpu: probe.hasNavigatorGpu,
    hasAdapter: probe.hasAdapter,
    hasCanvas: probe.hasCanvas,
    hasWebGPUContext: probe.hasWebGPUContext,
    runtimeProbePresent: probe.runtimeProbe.present,
    bootstrapSucceeded: probe.runtimeProbe.bootstrapState === 'succeeded',
    frameAdvanceDetected:
      typeof probe.runtimeProbe.frameAdvanceCount === 'number' && probe.runtimeProbe.frameAdvanceCount > 0,
    runtimeProbe: probe.runtimeProbe,
    consoleErrorCount: consoleErrors.length,
    pageErrorCount: pageErrors.length,
  };

  // [LAW:verifiable-goals] Gate verdict derives from explicit prerequisites and
  // runtime evidence captured in one deterministic probe result.
  // [LAW:no-silent-fallbacks] Missing bootstrap/frame progress is a hard failure.
  const passed =
    readiness.hasNavigatorGpu &&
    readiness.hasAdapter &&
    readiness.hasCanvas &&
    readiness.hasWebGPUContext &&
    readiness.runtimeProbePresent &&
    readiness.bootstrapSucceeded &&
    readiness.frameAdvanceDetected &&
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
            : !readiness.runtimeProbePresent
              ? 'runtime_probe_missing'
              : !readiness.bootstrapSucceeded
                ? 'runtime_bootstrap_not_succeeded'
                : !readiness.frameAdvanceDetected
                  ? 'runtime_frames_not_advancing'
                  : readiness.consoleErrorCount > 0
                    ? 'runtime_console_errors'
                    : readiness.pageErrorCount > 0
                      ? 'runtime_page_errors'
                      : 'unknown';

  return {
    browser: browserName,
    blocking,
    status: passed ? 'passed' : 'failed',
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
    skipped: false,
  };
}

function makeSkippedResult(check) {
  return {
    browser: check.browserName,
    blocking: check.blocking,
    status: 'skipped',
    browserVersion: null,
    url: TARGET_URL,
    startedAt: new Date().toISOString(),
    durationMs: 0,
    readiness: {
      hasNavigatorGpu: false,
      hasAdapter: false,
      hasCanvas: false,
      hasWebGPUContext: false,
      runtimeProbePresent: false,
      bootstrapSucceeded: false,
      frameAdvanceDetected: false,
      runtimeProbe: null,
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
      setup: [],
    },
    failureReason: check.skipReason,
    passed: false,
    skipped: true,
  };
}

async function main() {
  const managedServer = await startManagedServer(TARGET_URL);

  try {
    // [LAW:single-enforcer] Chromium is the canonical blocking lane for W15.
    const checks = getChecks();

    const results = [];
    for (const check of checks) {
      process.stdout.write(`[matrix] Running ${check.browserName} WebGPU check...\n`);
      if (check.skipReason) {
        results.push(makeSkippedResult(check));
        continue;
      }

      // [LAW:dataflow-not-control-flow] The check pipeline is fixed; check
      // differences are expressed as data in the `checks` list.
      try {
        results.push(await runBrowserCheck(check));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          browser: check.browserName,
          blocking: check.blocking,
          status: 'failed',
          browserVersion: null,
          url: TARGET_URL,
          startedAt: new Date().toISOString(),
          durationMs: 0,
          readiness: {
            hasNavigatorGpu: false,
            hasAdapter: false,
            hasCanvas: false,
            hasWebGPUContext: false,
            runtimeProbePresent: false,
            bootstrapSucceeded: false,
            frameAdvanceDetected: false,
            runtimeProbe: null,
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
          skipped: false,
        });
      }
    }

    const skippedCount = results.filter((result) => result.status === 'skipped').length;
    const blockingChecks = results.filter((result) => result.blocking && result.status !== 'skipped');
    const blockingPassed = blockingChecks.every((result) => result.passed);
    const allBrowsersPassed = results.every((result) => result.status === 'passed');
    const report = {
      generatedAt: new Date().toISOString(),
      sampleFrames: SAMPLE_FRAMES,
      url: TARGET_URL,
      server: {
        startServer: START_SERVER,
        buildFirst: BUILD_FIRST,
        mode: SERVER_MODE,
        allowReuse: ALLOW_SERVER_REUSE,
      },
      skipPolicy: {
        failOnSkip: FAIL_ON_SKIP,
      },
      results,
      skippedCount,
      gatingBrowsers: results.filter((result) => result.blocking).map((result) => result.browser),
      nonBlockingBrowsers: results.filter((result) => !result.blocking).map((result) => result.browser),
      passed: blockingPassed,
      hardPassed: allBrowsersPassed,
    };

    const reportPath = path.resolve(DEFAULT_REPORT);
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2));

    process.stdout.write(`[matrix] Report written: ${reportPath}\n`);
    for (const result of results) {
      const statusLabel =
        result.status === 'skipped' ? 'SKIP' : result.passed ? 'PASS' : 'FAIL';
      process.stdout.write(
        `[matrix] ${result.browser}: ${statusLabel} ` +
          `[${result.blocking ? 'blocking' : 'non-blocking'}] ` +
          `(gpu=${result.readiness.hasNavigatorGpu}, adapter=${result.readiness.hasAdapter}, ` +
          `context=${result.readiness.hasWebGPUContext}, bootstrap=${result.readiness.bootstrapSucceeded}, ` +
          `frames=${result.readiness.frameAdvanceDetected}, ` +
          `avg=${result.timing.avgFrameDeltaMs}ms, p95=${result.timing.p95FrameDeltaMs}ms)\n`,
      );
    }

    if (FAIL_ON_SKIP && skippedCount > 0) {
      process.stderr.write(
        `[matrix] Failed: ${skippedCount} browser checks were skipped and fail-on-skip is enabled.\n`,
      );
      process.exitCode = 1;
      return;
    }

    if (!report.passed) {
      process.exitCode = 1;
    }
  } finally {
    if (managedServer) {
      managedServer.kill('SIGTERM');
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[matrix] Failed: ${message}\n`);
  process.exit(1);
});
