import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RootStore } from '../../stores/RootStore';
import { RUNTIME_PROBE_GLOBAL_KEY } from '../../testing/runtime-probe';

type AnimationLoopModule = typeof import('../AnimationLoop');

type ProbeHost = typeof globalThis & {
  [RUNTIME_PROBE_GLOBAL_KEY]?: {
    heartbeat?: {
      publishedAtMs?: number | null;
      latest?: {
        kind?: string;
      } | null;
    };
  };
};

function probeHost(): ProbeHost {
  return globalThis as ProbeHost;
}

async function loadAnimationLoop(consoleEnabled: boolean): Promise<AnimationLoopModule> {
  vi.resetModules();
  vi.doMock('../../testing/test-params', () => ({
    isRuntimeConsoleEnabled: () => consoleEnabled,
  }));
  return import('../AnimationLoop');
}

function makeProgram(): AnimationLoopModule extends never ? never : object {
  return {
    schedule: {
      steps: [{ kind: 'render' }],
    },
    drawPrepProgram: {
      sinks: [{}],
    },
  };
}

function makeRenderer() {
  const telemetry = {
    meanMs: 16,
    stdDevMs: 1,
    sampleCount: 8,
    frameCount: 4,
    stageTimings: {
      inputMarshalMs: 1,
      simulationDispatchMs: 2,
      fluidPassChainMs: 3,
      drawPrepMs: 4,
      renderMs: 5,
      swapMs: 6,
      totalFrameMs: 21,
    },
    dispatchCounters: {
      computeDispatchCount: 3,
      computeWorkgroupCount: 64,
      activeLaneCount: 128,
      guardedLaneCount: 0,
    },
    resourceStats: {
      shapeBankWordCount: 10,
      sinkTableWordCount: 11,
      indexedRecordCount: 12,
      nonIndexedRecordCount: 13,
      totalInstanceCount: 14,
      canvasWidth: 640,
      canvasHeight: 360,
      pingPongIndex: 1,
    },
    lastEvent: { tag: 'tick' },
  };
  return {
    resizeCanvas: vi.fn<(width: number, height: number) => void>(),
    setViewportFrame: vi.fn<(payload: unknown) => void>(),
    getLifecycleState: vi.fn<() => string>(() => 'running'),
    getLatestRuntimeTelemetry: vi.fn(() => telemetry),
    getInstalledGpuPassIds: vi.fn(() => ['simulation']),
    getLatestSinkTableSample: vi.fn(() => ({ words: [1, 2, 3] })),
  };
}

function makeDeps(renderer: ReturnType<typeof makeRenderer>) {
  const store = new RootStore();
  return {
    getCurrentProgram: () => makeProgram() as never,
    getCurrentState: () => null,
    getCanvas: () => ({ width: 640, height: 360 }) as HTMLCanvasElement,
    getRenderer: () => renderer as never,
    getArena: () => ({
      beginFrame: vi.fn(),
      endFrame: vi.fn(),
    }) as never,
    store,
  };
}

describe('AnimationLoop heartbeat consumers', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    delete probeHost()[RUNTIME_PROBE_GLOBAL_KEY];
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../testing/test-params');
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
    delete probeHost()[RUNTIME_PROBE_GLOBAL_KEY];
  });

  it('reads showPreview at frame time so probe publication starts and stops without reload', async () => {
    const { createAnimationLoopState, executeAnimationFrame } = await loadAnimationLoop(false);
    const renderer = makeRenderer();
    const deps = makeDeps(renderer);
    const state = createAnimationLoopState();
    state.lastFpsUpdate = performance.now();

    executeAnimationFrame(1, deps, state);
    expect(probeHost()[RUNTIME_PROBE_GLOBAL_KEY]).toBeUndefined();

    window.history.replaceState({}, '', '/?showPreview=true');
    executeAnimationFrame(2, deps, state);
    expect(probeHost()[RUNTIME_PROBE_GLOBAL_KEY]?.heartbeat?.latest).toMatchObject({
      kind: 'runtime-heartbeat',
    });

    const publishedAtMs = probeHost()[RUNTIME_PROBE_GLOBAL_KEY]?.heartbeat?.publishedAtMs;
    window.history.replaceState({}, '', '/');
    executeAnimationFrame(3, deps, state);
    expect(probeHost()[RUNTIME_PROBE_GLOBAL_KEY]?.heartbeat?.publishedAtMs).toBe(publishedAtMs);
  });

  it('skips non-cadence heartbeat builds when only runtimeConsole is enabled', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { createAnimationLoopState, executeAnimationFrame } = await loadAnimationLoop(true);
    const renderer = makeRenderer();
    const deps = makeDeps(renderer);
    const state = createAnimationLoopState();
    state.lastFpsUpdate = performance.now();

    executeAnimationFrame(1, deps, state);
    expect(renderer.getLatestRuntimeTelemetry).not.toHaveBeenCalled();
    expect(consoleInfo).not.toHaveBeenCalled();

    state.lastFpsUpdate = performance.now() - 1000;
    executeAnimationFrame(2, deps, state);
    expect(renderer.getLatestRuntimeTelemetry).toHaveBeenCalled();
    expect(consoleInfo).toHaveBeenCalledWith(expect.stringContaining('[runtimeConsole]'));
  });
});
