import { expect, test } from '@playwright/test';

const RUNTIME_CONSOLE_PREFIX = '[runtimeConsole]';

function parseRuntimeConsolePayload(messageText: string): Record<string, unknown> | null {
  const markerIndex = messageText.indexOf(RUNTIME_CONSOLE_PREFIX);
  if (markerIndex < 0) return null;
  const payloadText = messageText.slice(markerIndex + RUNTIME_CONSOLE_PREFIX.length).trim();
  if (!payloadText.startsWith('{')) return null;
  return JSON.parse(payloadText) as Record<string, unknown>;
}

test.describe('Runtime Console Observability', () => {
  test('emits canonical heartbeat with telemetry and no fatal breadcrumb', async ({ page }) => {
    const runtimeMessages: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (message) => {
      const text = message.text();
      if (text.includes(RUNTIME_CONSOLE_PREFIX)) {
        runtimeMessages.push(text);
      }
    });
    page.on('pageerror', (error) => {
      pageErrors.push(error instanceof Error ? error.message : String(error));
    });

    await page.goto('/?runtimeConsole=true&showPreview=true');

    await expect
      .poll(
        () => runtimeMessages.filter((line) => line.includes('"kind":"runtime-heartbeat"')).length,
        {
        timeout: 8_000,
        message: 'runtimeConsole heartbeat was not emitted in time',
      })
      .toBeGreaterThan(0);

    const payloads = runtimeMessages
      .map((line) => {
        try {
          return parseRuntimeConsolePayload(line);
        } catch {
          return null;
        }
      })
      .filter((payload): payload is Record<string, unknown> => payload !== null);

    expect(payloads.length).toBeGreaterThan(0);

    const heartbeatPayloads = payloads.filter((payload) => payload.kind === 'runtime-heartbeat');
    expect(heartbeatPayloads.length).toBeGreaterThan(0);

    const latest = heartbeatPayloads[heartbeatPayloads.length - 1];
    expect(latest.kind).toBe('runtime-heartbeat');

    const telemetry = latest.telemetry as Record<string, unknown>;
    const stageTimings = telemetry.stageTimings as Record<string, unknown>;
    const dispatchCounters = telemetry.dispatchCounters as Record<string, unknown>;
    const resourceStats = telemetry.resourceStats as Record<string, unknown>;

    // [LAW:verifiable-goals] E2E gate validates canonical observability shape
    // so runtime telemetry regressions are deterministic test failures.
    expect(typeof stageTimings.inputMarshalMs).toBe('number');
    expect(typeof stageTimings.simulationDispatchMs).toBe('number');
    expect(typeof stageTimings.fluidPassChainMs).toBe('number');
    expect(typeof stageTimings.drawPrepMs).toBe('number');
    expect(typeof stageTimings.renderMs).toBe('number');
    expect(typeof stageTimings.swapMs).toBe('number');
    expect(typeof stageTimings.totalFrameMs).toBe('number');

    expect(typeof dispatchCounters.computeDispatchCount).toBe('number');
    expect(typeof dispatchCounters.computeWorkgroupCount).toBe('number');
    expect(typeof dispatchCounters.activeLaneCount).toBe('number');
    expect(typeof dispatchCounters.guardedLaneCount).toBe('number');

    expect(typeof resourceStats.shapeBankWordCount).toBe('number');
    expect(typeof resourceStats.sinkTableWordCount).toBe('number');
    expect(typeof resourceStats.indexedRecordCount).toBe('number');
    expect(typeof resourceStats.nonIndexedRecordCount).toBe('number');
    expect(typeof resourceStats.totalInstanceCount).toBe('number');
    expect(typeof resourceStats.canvasWidth).toBe('number');
    expect(typeof resourceStats.canvasHeight).toBe('number');
    expect(typeof resourceStats.pingPongIndex).toBe('number');

    const breadcrumb = latest.breadcrumb as { severity?: string } | null | undefined;
    expect(breadcrumb?.severity === 'fatal').toBe(false);
    expect(pageErrors).toEqual([]);
  });
});
