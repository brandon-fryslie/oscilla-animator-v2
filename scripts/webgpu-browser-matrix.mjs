#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { truncateForLog } from './matrix-utils.mjs';

const BASE_URL = process.env.WEBGPU_MATRIX_URL ?? 'http://127.0.0.1:5784';
const DEFAULT_REPORT = process.env.WEBGPU_MATRIX_REPORT ?? 'artifacts/webgpu-browser-matrix.json';
const parsePositiveIntegerEnv = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  const isValid = Number.isFinite(parsed) && parsed > 0;
  return isValid ? parsed : fallback;
};
const SAMPLE_FRAMES = parsePositiveIntegerEnv(process.env.WEBGPU_MATRIX_FRAMES, 180);
const SAMPLE_TIMEOUT_MS = parsePositiveIntegerEnv(process.env.WEBGPU_MATRIX_SAMPLE_TIMEOUT_MS, 10000);
const START_SERVER = (process.env.WEBGPU_MATRIX_START_SERVER ?? '1') !== '0';
const BUILD_FIRST = (process.env.WEBGPU_MATRIX_BUILD_FIRST ?? '1') !== '0';
const SERVER_MODE = process.env.WEBGPU_MATRIX_SERVER_MODE ?? 'preview';
const SERVER_TIMEOUT_MS = parsePositiveIntegerEnv(process.env.WEBGPU_MATRIX_SERVER_TIMEOUT_MS, 45000);
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

function resolveManagedServerEndpoint(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `Unsupported WEBGPU_MATRIX_URL protocol "${parsed.protocol}". Expected http: or https:.`,
    );
  }
  // [LAW:one-source-of-truth] Managed server host/port derive once from URL.
  const host = parsed.hostname;
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
  return { host, port };
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
    await runCommand('pnpm', ['run', 'build:rust-renderer'], 'build-rust-renderer');
    await runCommand('pnpm', ['run', 'build'], 'build');
  }

  const { host: managedHost, port: managedPort } = resolveManagedServerEndpoint(url);
  const serverArgs =
    SERVER_MODE === 'dev'
      ? ['run', 'dev', '--', '--host', managedHost, '--port', managedPort, '--strictPort']
      : ['exec', 'vite', 'preview', '--host', managedHost, '--port', managedPort, '--strictPort'];

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

async function stopManagedServer(serverProcess) {
  if (!serverProcess) {
    return;
  }
  if (serverProcess.exitCode !== null) {
    return;
  }

  // [LAW:no-silent-fallbacks] Server shutdown is explicit with bounded waits;
  // if graceful termination fails, hard-kill to avoid hanging CI gates.
  const awaitExit = (timeoutMs) => new Promise((resolve) => {
    let settled = false;
    let timeoutId = null;
    const finish = (exited) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      resolve(exited);
    };
    serverProcess.once('exit', () => finish(true));
    timeoutId = setTimeout(() => finish(false), timeoutMs);
  });

  try {
    serverProcess.kill('SIGTERM');
  } catch {
    // Ignore race/shutdown signal errors; process may have already exited.
  }
  const exited = await awaitExit(5000);
  if (exited) {
    return;
  }
  try {
    serverProcess.kill('SIGKILL');
  } catch {
    // Ignore race/shutdown signal errors; process may have already exited.
  }
  await awaitExit(2000);
}

function computeStats(frameDeltasMs) {
  if (frameDeltasMs.length === 0) {
    return {
      sampleCount: 0,
      avgFrameDeltaMs: 0,
      p95FrameDeltaMs: 0,
      avgFps: 0,
    };
  }
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

function failureHintForReason(failureReason) {
  switch (failureReason) {
    case 'webgpu_api_unavailable':
      return 'navigator.gpu is unavailable (runner/browser lacks WebGPU exposure).';
    case 'webgpu_adapter_unavailable':
      return 'requestAdapter() returned null (no GPU adapter available to WebGPU).';
    case 'webgpu_context_unavailable':
      return 'canvas.getContext("webgpu") failed; WebGPU context was not created.';
    case 'runtime_probe_missing':
      return 'Runtime probe was not published on window (startup path likely did not initialize preview runtime).';
    case 'runtime_bootstrap_not_succeeded':
      return 'Runtime bootstrap probe did not reach succeeded state.';
    case 'runtime_frames_not_advancing':
      return 'Runtime probe frame counter did not advance during sampling window.';
    case 'runtime_console_errors':
      return 'Runtime emitted console errors during probe run.';
    case 'runtime_page_errors':
      return 'Runtime emitted uncaught page errors during probe run.';
    case 'browser_launch_failed':
      return 'Browser process failed before runtime probe could execute.';
    default:
      return 'No mapped hint for this failure reason.';
  }
}

function logDetailedResult(result) {
  const failureReason = result.failureReason ?? 'unknown';
  const bootstrapState = result.readiness?.runtimeProbe?.bootstrapState ?? null;
  const bootstrapFailureMessage =
    result.readiness?.runtimeProbe?.bootstrapFailureMessage ?? null;
  const frameAdvanceCount = result.readiness?.runtimeProbe?.frameAdvanceCount ?? null;

  process.stderr.write(
    `[matrix] detail ${result.browser}: reason=${failureReason}; ` +
      `bootstrapState=${bootstrapState ?? 'null'}; ` +
      `bootstrapFailure=${bootstrapFailureMessage ? truncateForLog(bootstrapFailureMessage) : 'null'}; ` +
      `frameAdvanceCount=${frameAdvanceCount ?? 'null'}; ` +
      `consoleErrors=${result.errors?.console?.length ?? 0}; ` +
      `pageErrors=${result.errors?.page?.length ?? 0}; ` +
      `setupErrors=${result.errors?.setup?.length ?? 0}\n`,
  );
  process.stderr.write(
    `[matrix] hint ${result.browser}: ${failureHintForReason(failureReason)}\n`,
  );

  const consoleError = result.errors?.console?.[0];
  if (consoleError) {
    process.stderr.write(
      `[matrix] ${result.browser} console[0]: ${truncateForLog(consoleError)}\n`,
    );
  }
  const pageError = result.errors?.page?.[0];
  if (pageError) {
    process.stderr.write(
      `[matrix] ${result.browser} page[0]: ${truncateForLog(pageError)}\n`,
    );
  }
  const setupError = result.errors?.setup?.[0];
  if (setupError) {
    process.stderr.write(
      `[matrix] ${result.browser} setup[0]: ${truncateForLog(setupError)}\n`,
    );
  }
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
  const startedAt = Date.now();
  const consoleErrors = [];
  const pageErrors = [];
  let browser = null;
  let page = null;
  let browserVersion = null;

  try {
    browser = await launcher.launch({ headless: true, ...launchOptions });
    browserVersion = browser.version();
    page = await browser.newPage();

    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector('canvas', { timeout: 30_000 });
    const runtimeProbeStateExpr = () => {
      const host = globalThis;
      const names = Object.getOwnPropertyNames(host);
      for (let index = 0; index < names.length; index += 1) {
        let candidate;
        try {
          candidate = host[names[index]];
        } catch {
          continue;
        }
        if (!candidate || typeof candidate !== 'object') {
          continue;
        }
        if (candidate.version !== 1) {
          continue;
        }
        const bootstrap = candidate.bootstrap;
        const loop = candidate.loop;
        if (!bootstrap || !loop) {
          continue;
        }
        if (typeof loop.renderedFrameCount !== 'number') {
          continue;
        }
        const state = bootstrap.state;
        if (state === 'succeeded' || state === 'failed') {
          return state;
        }
      }
      return null;
    };
    // [LAW:no-silent-fallbacks] Wait for a terminal bootstrap state so failed
    // startup surfaces immediately instead of timing out the full sample window.
    const bootstrapReadyBeforeSample = await page
      .waitForFunction(runtimeProbeStateExpr, null, { timeout: 30_000 })
      .then((handle) => handle.jsonValue())
      .then((state) => state === 'succeeded')
      .catch(() => false);

    const probe = await page.evaluate(async ({
      sampleFrames,
      sampleTimeoutMs,
      bootstrapReadyBeforeSample,
    }) => {
      const hasNavigatorGpu = Boolean(navigator.gpu);
      const adapter = hasNavigatorGpu ? await navigator.gpu.requestAdapter() : null;
      const hasAdapter = Boolean(adapter);
      const canvas = document.querySelector('canvas');
      const hasCanvas = Boolean(canvas);
      const contextProbe = (() => {
        if (!canvas) {
          return { hasWebGPUContext: false, webgpuContextProbe: 'canvas_missing' };
        }
        try {
          return {
            hasWebGPUContext: Boolean(canvas.getContext('webgpu')),
            webgpuContextProbe: 'main_canvas',
          };
        } catch (error) {
          const errorName =
            error && typeof error === 'object' && 'name' in error
              ? String(error.name)
              : '';
          const isTransferredOffscreen =
            errorName === 'InvalidStateError';
          // [LAW:one-source-of-truth] OffscreenCanvas transfer moves WebGPU
          // context ownership to worker runtime, so probe state is canonical.
          return {
            hasWebGPUContext: isTransferredOffscreen,
            webgpuContextProbe: isTransferredOffscreen ? 'offscreen_transferred' : 'context_probe_error',
          };
        }
      })();

      const readProbe = () => {
        const names = Object.getOwnPropertyNames(globalThis);
        for (let index = 0; index < names.length; index += 1) {
          let value;
          try {
            value = globalThis[names[index]];
          } catch {
            continue;
          }
          if (!value || typeof value !== 'object') {
            continue;
          }
          if (value.version !== 1) {
            continue;
          }
          const bootstrap = value.bootstrap;
          const loop = value.loop;
          if (!bootstrap || !loop) {
            continue;
          }
          if (typeof loop.renderedFrameCount !== 'number') {
            continue;
          }
          if (
            bootstrap.state === 'not_started' ||
            bootstrap.state === 'starting' ||
            bootstrap.state === 'succeeded' ||
            bootstrap.state === 'failed'
          ) {
            return value;
          }
        }
        return null;
      };
      const probeBefore = readProbe();
      const beforeFrameCount =
        typeof probeBefore?.loop?.renderedFrameCount === 'number'
          ? probeBefore.loop.renderedFrameCount
          : null;

      const frameDeltasMs = [];
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) {
            return;
          }
          settled = true;
          resolve();
        };
        let previous = performance.now();
        let remaining = bootstrapReadyBeforeSample ? Math.max(1, sampleFrames) : 0;
        if (remaining <= 0) {
          finish();
          return;
        }
        const timeoutId = setTimeout(finish, Math.max(1, sampleTimeoutMs));
        const tick = (now) => {
          if (settled) {
            return;
          }
          frameDeltasMs.push(now - previous);
          previous = now;
          remaining -= 1;
          if (remaining <= 0) {
            clearTimeout(timeoutId);
            finish();
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
        hasWebGPUContext: contextProbe.hasWebGPUContext,
        webgpuContextProbe: contextProbe.webgpuContextProbe,
        frameDeltasMs,
        runtimeProbe: {
          present: probeAfter !== null,
          bootstrapState:
            typeof probeAfter?.bootstrap?.state === 'string' ? probeAfter.bootstrap.state : null,
          bootstrapFailureMessage:
            typeof probeAfter?.bootstrap?.failureMessage === 'string'
              ? probeAfter.bootstrap.failureMessage
              : null,
          bootstrapReadyBeforeSample,
          renderedFramesBeforeSample: beforeFrameCount,
          renderedFramesAfterSample: afterFrameCount,
          frameAdvanceCount,
        },
      };
    }, {
      sampleFrames: SAMPLE_FRAMES,
      sampleTimeoutMs: SAMPLE_TIMEOUT_MS,
      bootstrapReadyBeforeSample,
    });

    const timing = computeStats(probe.frameDeltasMs);
    const readiness = {
      hasNavigatorGpu: probe.hasNavigatorGpu,
      hasAdapter: probe.hasAdapter,
      hasCanvas: probe.hasCanvas,
      hasWebGPUContext: probe.hasWebGPUContext,
      webgpuContextProbe: probe.webgpuContextProbe,
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
        setup: [],
      },
      failureReason,
      passed,
      skipped: false,
    };
  } finally {
    // [LAW:no-silent-fallbacks] Browser resources are always closed, even on
    // probe/setup failures, so gate runs cannot leak and hang CI workers.
    if (page) {
      await page.close().catch(() => undefined);
    }
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
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
      webgpuContextProbe: 'skipped',
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

function summarizeGateResults(results) {
  const skippedCount = results.filter((result) => result.status === 'skipped').length;
  const blockingChecks = results.filter((result) => result.blocking && result.status !== 'skipped');
  // [LAW:verifiable-goals] A blocking verdict requires at least one executed
  // blocking result; an empty set cannot prove readiness.
  const blockingPassed =
    blockingChecks.length > 0 && blockingChecks.every((result) => result.passed);
  const allBrowsersPassed =
    results.length > 0 && results.every((result) => result.status === 'passed');
  return { skippedCount, blockingPassed, allBrowsersPassed };
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
            webgpuContextProbe: 'launch_failed',
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

    const { skippedCount, blockingPassed, allBrowsersPassed } = summarizeGateResults(results);
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
      if (!result.passed || result.status === 'skipped') {
        // [LAW:verifiable-goals] Failure diagnostics are emitted with explicit
        // machine-captured probe evidence so CI failures are actionable.
        logDetailedResult(result);
      }
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
    await stopManagedServer(managedServer);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`[matrix] Failed: ${message}\n`);
    process.exit(1);
  });
}

export {
  computeStats,
  getChecks,
  makeSkippedResult,
  resolveManagedServerEndpoint,
  runBrowserCheck,
  summarizeGateResults,
};
