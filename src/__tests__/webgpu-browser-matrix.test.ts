// @vitest-environment node

import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const browserMatrixModuleUrl = pathToFileURL(
  path.resolve('scripts/webgpu-browser-matrix.mjs'),
).href;

async function loadBrowserMatrixModule(): Promise<{
  summarizeGateResults: (results: Array<{
    blocking: boolean;
    status: string;
    passed: boolean;
  }>) => {
    skippedCount: number;
    blockingPassed: boolean;
    allBrowsersPassed: boolean;
  };
}> {
  return import(browserMatrixModuleUrl);
}

describe('webgpu-browser-matrix summarizeGateResults', () => {
  it('does not mark blocking gates passed when every blocking lane is skipped', async () => {
    const { summarizeGateResults } = await loadBrowserMatrixModule();

    expect(summarizeGateResults([
      { blocking: true, status: 'skipped', passed: false },
    ])).toEqual({
      skippedCount: 1,
      blockingPassed: false,
      allBrowsersPassed: false,
    });
  });

  it('marks blocking gates passed only when an executed blocking lane passes', async () => {
    const { summarizeGateResults } = await loadBrowserMatrixModule();

    expect(summarizeGateResults([
      { blocking: true, status: 'passed', passed: true },
      { blocking: false, status: 'skipped', passed: false },
    ])).toEqual({
      skippedCount: 1,
      blockingPassed: true,
      allBrowsersPassed: false,
    });
  });
});
