import { expect, test, type Page } from '@playwright/test';
import { RUNTIME_PROBE_GLOBAL_KEY, type RuntimeProbeSnapshot } from '../../../src/testing/runtime-probe';

interface BrowserIssue {
  readonly source: 'console' | 'pageerror';
  readonly level: 'warning' | 'error';
  readonly text: string;
}

function attachBrowserIssueCollector(page: Page): BrowserIssue[] {
  const issues: BrowserIssue[] = [];

  page.on('console', (message) => {
    const type = message.type();
    if (type !== 'warning' && type !== 'error') {
      return;
    }
    issues.push({
      source: 'console',
      level: type,
      text: message.text(),
    });
  });

  page.on('pageerror', (error: Error) => {
    issues.push({
      source: 'pageerror',
      level: 'error',
      text: error.message,
    });
  });

  return issues;
}

async function readRuntimeProbe(page: Page): Promise<RuntimeProbeSnapshot | null> {
  return await page.evaluate((probeKey) => {
    const host = window as typeof window & Record<string, unknown>;
    const probe = host[probeKey];
    return probe && typeof probe === 'object' ? probe as RuntimeProbeSnapshot : null;
  }, RUNTIME_PROBE_GLOBAL_KEY);
}

test.describe('Demo bootstrap', () => {
  test('loads simple.hcl without runtime bootstrap failure and renders at least one frame', async ({ page }) => {
    const issues = attachBrowserIssueCollector(page);

    await page.goto('/?loadDemoPatch=simple.hcl&showPreview=true');

    // [LAW:verifiable-goals] Demo-load regression coverage must assert the
    // canonical runtime bootstrap probe instead of relying on incidental UI.
    await expect.poll(async () => {
      const probe = await readRuntimeProbe(page);
      return probe?.bootstrap.state ?? 'missing';
    }, {
      timeout: 20_000,
      message: 'runtime bootstrap never reached a terminal state',
    }).toBe('succeeded');

    await expect.poll(async () => {
      const probe = await readRuntimeProbe(page);
      return probe?.loop.renderedFrameCount ?? 0;
    }, {
      timeout: 20_000,
      message: 'runtime never rendered a frame after loading simple.hcl',
    }).toBeGreaterThan(0);

    const failureIssues = issues.filter((issue) => (
      issue.text.includes('Failed to initialize runtime:')
      || issue.text.includes('AnimationLoop: WebGPU runtime contract requires canvas, renderer, and arena')
    ));
    expect(failureIssues, failureIssues.map((issue) => `${issue.level}:${issue.source}: ${issue.text}`).join('\n')).toEqual([]);
  });
});
