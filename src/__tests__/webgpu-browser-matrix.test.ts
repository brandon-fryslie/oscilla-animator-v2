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
  runBrowserCheck: (check: {
    browserName: string;
    launcher: {
      launch: (options: { headless: boolean }) => Promise<{
        version: () => string;
        newPage: () => Promise<{
          on: (event: string, callback: (payload: unknown) => void) => void;
          goto: (url: string, options: { waitUntil: 'networkidle'; timeout: number }) => Promise<void>;
          waitForSelector: (selector: string, options: { timeout: number }) => Promise<void>;
          waitForFunction: (
            predicate: (probeKey: string) => string | null,
            probeKey: string,
            options: { timeout: number },
          ) => Promise<{ jsonValue: () => Promise<string> }>;
          evaluate: (
            callback: (
              payload: Record<string, unknown>,
            ) => Promise<Record<string, unknown>>,
            payload: Record<string, unknown>,
          ) => Promise<Record<string, unknown>>;
          close: () => Promise<void>;
        }>;
        close: () => Promise<void>;
      }>;
    };
    launchOptions: Record<string, unknown>;
    url: string;
    blocking: boolean;
  }) => Promise<unknown>;
  resolveManagedServerEndpoint: (url: string) => {
    host: string;
    port: string;
  };
}> {
  return import(browserMatrixModuleUrl);
}

describe('webgpu-browser-matrix resolveManagedServerEndpoint', () => {
  it('derives explicit host and port from URL overrides', async () => {
    const { resolveManagedServerEndpoint } = await loadBrowserMatrixModule();

    expect(resolveManagedServerEndpoint('http://localhost:6123/?showPreview=true')).toEqual({
      host: 'localhost',
      port: '6123',
    });
  });

  it('rejects unsupported URL protocols', async () => {
    const { resolveManagedServerEndpoint } = await loadBrowserMatrixModule();

    expect(() => resolveManagedServerEndpoint('file:///tmp/index.html')).toThrow(
      'Unsupported WEBGPU_MATRIX_URL protocol',
    );
  });
});

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

describe('webgpu-browser-matrix runBrowserCheck cleanup', () => {
  it('always closes page and browser when setup fails', async () => {
    const { runBrowserCheck } = await loadBrowserMatrixModule();
    let pageClosed = false;
    let browserClosed = false;

    const page = {
      on: () => {},
      goto: async () => {
        throw new Error('goto failed');
      },
      waitForSelector: async () => {},
      waitForFunction: async () => ({ jsonValue: async () => 'succeeded' }),
      evaluate: async () => ({
        hasNavigatorGpu: true,
        hasAdapter: true,
        hasCanvas: true,
        hasWebGPUContext: true,
        frameDeltasMs: [16],
        runtimeProbe: {
          present: true,
          bootstrapState: 'succeeded',
          bootstrapFailureMessage: null,
          bootstrapReadyBeforeSample: true,
          renderedFramesBeforeSample: 1,
          renderedFramesAfterSample: 2,
          frameAdvanceCount: 1,
        },
      }),
      close: async () => {
        pageClosed = true;
      },
    };

    const browser = {
      version: () => 'test',
      newPage: async () => page,
      close: async () => {
        browserClosed = true;
      },
    };

    const launcher = {
      launch: async () => browser,
    };

    await expect(runBrowserCheck({
      browserName: 'chromium',
      launcher,
      launchOptions: {},
      url: 'http://127.0.0.1:5784/?showPreview=true',
      blocking: true,
    })).rejects.toThrow('goto failed');

    expect(pageClosed).toBe(true);
    expect(browserClosed).toBe(true);
  });
});
