import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeBoundaryFixtureV1 } from '../RuntimeService';
import {
  createRuntimeBoundaryDumpBridge,
  installRuntimeBoundaryDumpBridge,
  readRuntimeBoundaryDumpBridge,
  RUNTIME_BOUNDARY_DUMP_GLOBAL_KEY,
} from '../runtime-boundary-dump-bridge';

function createFixture(): RuntimeBoundaryFixtureV1 {
  return {
    version: 1,
    capturedAtMs: 12345,
    install: {
      type: 'INSTALL_PIPELINE_V1',
      pipeline: {
        passes: [],
        sinkPointerMap: {},
        shapeBankWords: [1, 2, 3],
        shapeBankWordCount: 3,
        topologyIdByHandle: [7],
        sinkTableWords: [9, 8, 7],
        sinkTableWordCount: 3,
      },
    },
    frame: {
      type: 'PUBLISH_FRAME_INPUT_V1',
      frame: {
        width: 640,
        height: 360,
        zoom: 1,
        panX: 0,
        panY: 0,
        timeMs: 1000,
        inputMouseX: 10,
        inputMouseY: 20,
        inputMouseButtons: 0,
        inputAudioLow: 0,
        inputAudioMid: 0,
        inputAudioHigh: 0,
        inputGaugeActive: 0,
      },
    },
  };
}

describe('runtime boundary dump bridge', () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    });
    const host = globalThis as typeof globalThis & {
      [RUNTIME_BOUNDARY_DUMP_GLOBAL_KEY]?: unknown;
    };
    delete host[RUNTIME_BOUNDARY_DUMP_GLOBAL_KEY];
  });

  it('dumpFixtureJsonV1 serializes fixture-only JSON payload', () => {
    const fixture = createFixture();
    const bridge = createRuntimeBoundaryDumpBridge(() => fixture);

    const json = bridge.dumpFixtureJsonV1();
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(parsed).toEqual({
      install: fixture.install,
      frame: fixture.frame,
    });
    expect(parsed).not.toHaveProperty('capturedAtMs');
    expect(parsed).not.toHaveProperty('version');
  });

  it('copyFixtureJsonV1 writes fixture-only JSON to clipboard', async () => {
    const fixture = createFixture();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const bridge = createRuntimeBoundaryDumpBridge(() => fixture);

    const copied = await bridge.copyFixtureJsonV1();

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(copied);
    expect(JSON.parse(copied)).toEqual({
      install: fixture.install,
      frame: fixture.frame,
    });
  });

  it('installRuntimeBoundaryDumpBridge exposes canonical bridge on the global key', () => {
    const fixture = createFixture();
    const installed = installRuntimeBoundaryDumpBridge(() => fixture);
    const bridge = readRuntimeBoundaryDumpBridge();

    expect(bridge).toBe(installed);
    expect(bridge?.dumpFixtureV1()).toEqual(fixture);
  });
});
