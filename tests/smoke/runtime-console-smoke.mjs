#!/usr/bin/env node
import { chromium } from 'playwright';

const RUNTIME_CONSOLE_PREFIX = '[runtimeConsole]';
const DEFAULT_URL = 'http://localhost:5175/?runtimeConsole=true&showPreview=true';

function parseRuntimeConsolePayload(messageText) {
  const markerIndex = messageText.indexOf(RUNTIME_CONSOLE_PREFIX);
  if (markerIndex < 0) return null;
  const payloadText = messageText.slice(markerIndex + RUNTIME_CONSOLE_PREFIX.length).trim();
  if (!payloadText.startsWith('{')) return null;
  return JSON.parse(payloadText);
}

function assertFiniteNumber(value, context) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${context} must be a finite number`);
  }
}

function validateHeartbeat(payload) {
  if (!payload || payload.kind !== 'runtime-heartbeat') {
    throw new Error('runtime heartbeat payload missing kind=runtime-heartbeat');
  }

  const stageTimings = payload.telemetry?.stageTimings;
  const dispatchCounters = payload.telemetry?.dispatchCounters;
  const resourceStats = payload.telemetry?.resourceStats;

  // [LAW:verifiable-goals] Smoke gate validates deterministic telemetry fields
  // so runtime observability regressions fail with explicit diagnostics.
  assertFiniteNumber(stageTimings?.inputMarshalMs, 'telemetry.stageTimings.inputMarshalMs');
  assertFiniteNumber(stageTimings?.simulationDispatchMs, 'telemetry.stageTimings.simulationDispatchMs');
  assertFiniteNumber(stageTimings?.fluidPassChainMs, 'telemetry.stageTimings.fluidPassChainMs');
  assertFiniteNumber(stageTimings?.drawPrepMs, 'telemetry.stageTimings.drawPrepMs');
  assertFiniteNumber(stageTimings?.renderMs, 'telemetry.stageTimings.renderMs');
  assertFiniteNumber(stageTimings?.swapMs, 'telemetry.stageTimings.swapMs');
  assertFiniteNumber(stageTimings?.totalFrameMs, 'telemetry.stageTimings.totalFrameMs');

  assertFiniteNumber(dispatchCounters?.computeDispatchCount, 'telemetry.dispatchCounters.computeDispatchCount');
  assertFiniteNumber(dispatchCounters?.computeWorkgroupCount, 'telemetry.dispatchCounters.computeWorkgroupCount');
  assertFiniteNumber(dispatchCounters?.activeLaneCount, 'telemetry.dispatchCounters.activeLaneCount');
  assertFiniteNumber(dispatchCounters?.guardedLaneCount, 'telemetry.dispatchCounters.guardedLaneCount');

  assertFiniteNumber(resourceStats?.shapeBankWordCount, 'telemetry.resourceStats.shapeBankWordCount');
  assertFiniteNumber(resourceStats?.sinkTableWordCount, 'telemetry.resourceStats.sinkTableWordCount');
  assertFiniteNumber(resourceStats?.indexedRecordCount, 'telemetry.resourceStats.indexedRecordCount');
  assertFiniteNumber(resourceStats?.nonIndexedRecordCount, 'telemetry.resourceStats.nonIndexedRecordCount');
  assertFiniteNumber(resourceStats?.totalInstanceCount, 'telemetry.resourceStats.totalInstanceCount');
  assertFiniteNumber(resourceStats?.canvasWidth, 'telemetry.resourceStats.canvasWidth');
  assertFiniteNumber(resourceStats?.canvasHeight, 'telemetry.resourceStats.canvasHeight');
  assertFiniteNumber(resourceStats?.pingPongIndex, 'telemetry.resourceStats.pingPongIndex');

  if (payload.breadcrumb?.severity === 'fatal') {
    throw new Error(`fatal breadcrumb detected: [${payload.breadcrumb.code}] ${payload.breadcrumb.message}`);
  }
}

async function main() {
  const url = process.env.RUNTIME_DEBUG_URL ?? DEFAULT_URL;
  const timeoutMs = Number.parseInt(process.env.RUNTIME_SMOKE_TIMEOUT_MS ?? '7000', 10);
  const deadlineMs = Date.now() + (Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 7000);

  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-unsafe-webgpu'],
  });

  const page = await browser.newPage();
  const runtimeMessages = [];
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (message) => {
    const text = message.text();
    if (text.includes(RUNTIME_CONSOLE_PREFIX)) {
      runtimeMessages.push(text);
    }
    if (message.type() === 'error') {
      consoleErrors.push(text);
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error instanceof Error ? error.message : String(error));
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    while (
      !runtimeMessages.some((line) => line.includes('"kind":"runtime-heartbeat"'))
      && Date.now() < deadlineMs
    ) {
      await page.waitForTimeout(100);
    }

    if (!runtimeMessages.some((line) => line.includes('"kind":"runtime-heartbeat"'))) {
      throw new Error(`no runtime console heartbeat captured within ${timeoutMs}ms`);
    }

    const parsedPayloads = runtimeMessages
      .map((text) => {
        try {
          return parseRuntimeConsolePayload(text);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (parsedPayloads.length === 0) {
      throw new Error('runtime console lines captured, but none parsed as structured JSON payloads');
    }

    const heartbeatPayloads = parsedPayloads.filter((payload) => payload?.kind === 'runtime-heartbeat');
    const latestPayload = heartbeatPayloads.at(-1);
    if (!latestPayload) {
      throw new Error('runtime console JSON was captured, but no runtime-heartbeat payload was found');
    }
    validateHeartbeat(latestPayload);

    if (pageErrors.length > 0) {
      throw new Error(`page errors detected: ${pageErrors.join(' | ')}`);
    }

    const fatalConsoleError = consoleErrors.find((text) => /fatal|runtime_tick_failed|device_lost/i.test(text));
    if (fatalConsoleError) {
      throw new Error(`fatal/error console trace detected: ${fatalConsoleError}`);
    }

    console.log('[runtime-smoke] PASS', JSON.stringify({
      url,
      runtimeConsoleLines: runtimeMessages.length,
      consoleErrorCount: consoleErrors.length,
      pageErrorCount: pageErrors.length,
    }));
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[runtime-smoke] FAIL ${message}`);
  process.exit(1);
});
