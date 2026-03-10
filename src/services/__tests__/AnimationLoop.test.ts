import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnimationLoopState, executeAnimationFrame, startAnimationLoop } from '../AnimationLoop';
import { assertSchedulePhaseBoundaryStateReads } from '../../runtime';

const runtimeProbeMocks = vi.hoisted(() => ({
  markRuntimeFrameAdvanced: vi.fn(),
}));

vi.mock('../../runtime', () => ({
  assertSchedulePhaseBoundaryStateReads: vi.fn(),
}));

vi.mock('../../testing/runtime-probe', () => ({
  markRuntimeFrameAdvanced: runtimeProbeMocks.markRuntimeFrameAdvanced,
}));

function makeDeps(overrides: Partial<any> = {}) {
  const renderer = {
    resizeCanvas: vi.fn(),
    setViewportFrame: vi.fn(),
    getLifecycleState: vi.fn(() => 'Running'),
    getLatestRuntimeTelemetry: vi.fn<() => Record<string, unknown> | null>(() => null),
    getInstalledGpuPassIds: vi.fn(() => []),
    getLatestSinkTableSample: vi.fn(() => null),
    render: vi.fn(),
  };
  const arena = {
    beginFrame: vi.fn(),
    endFrame: vi.fn(),
    reset: vi.fn(),
    getTotalBytes: () => 0,
  };
  const deps = {
    getCurrentProgram: () => ({}),
    getCurrentState: () => null,
    getCanvas: () => ({ width: 100, height: 80 }),
    getRenderer: () => renderer,
    getArena: () => arena,
    store: {
      demo: { currentFilename: null },
      debug: { enabled: false, traceCardinalitySolver: false },
      stepDebug: null,
      diagnostics: {
        recordJank: vi.fn(),
        updateFrameTiming: vi.fn(),
        updateMemoryStats: vi.fn(),
      },
      continuity: { updateFromRuntime: vi.fn() },
      viewport: {
        zoom: 1,
        pan: { x: 0, y: 0 },
        canvasWidth: 100,
        canvasHeight: 80,
        setContentBounds: vi.fn(),
      },
      events: { emit: vi.fn() },
      getPatchRevision: () => 1,
    },
  } as any;
  return { deps: { ...deps, ...overrides }, renderer, arena };
}
describe('AnimationLoop', () => {
  const assertSchedulePhaseBoundaryStateReadsMock = vi.mocked(assertSchedulePhaseBoundaryStateReads);
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancelRaf = globalThis.cancelAnimationFrame;

  beforeEach(() => {
    assertSchedulePhaseBoundaryStateReadsMock.mockReset();
    runtimeProbeMocks.markRuntimeFrameAdvanced.mockReset();
    let callback: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => {
      callback = cb;
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    (globalThis as any).__testFrameCallback = () => callback;
  });

  it('publishes canonical viewport frame to renderer worker boundary', () => {
    const { deps, renderer, arena } = makeDeps();
    executeAnimationFrame(16, deps, createAnimationLoopState());
    expect(renderer.resizeCanvas).toHaveBeenCalledWith(100, 80);
    expect(arena.beginFrame).toHaveBeenCalledTimes(1);
    expect(arena.endFrame).toHaveBeenCalledTimes(1);
    expect(renderer.setViewportFrame).toHaveBeenCalledWith({
      width: 100,
      height: 80,
      zoom: 1,
      panX: 0,
      panY: 0,
      timeMs: 16,
      inputMouseX: 0,
      inputMouseY: 0,
      inputMouseButtons: 0,
      inputAudioLow: 0,
      inputAudioMid: 0,
      inputAudioHigh: 0,
      inputGaugeActive: 0,
    });
    expect(runtimeProbeMocks.markRuntimeFrameAdvanced).toHaveBeenCalledWith(-1, 16);
  });

  it('commits external channel state and forwards mapped input values', () => {
    const commit = vi.fn();
    const getFloat = vi.fn((name: string) => ({
      'mouse.x': 0.25,
      'mouse.y': 0.75,
      'mouse.button.left.held': 1,
      'mouse.button.right.held': 0,
      'audio.low': 0.1,
      'audio.mid': 0.2,
      'audio.high': 0.3,
      'gauge.active': 0.4,
    })[name] ?? 0);
    const { deps, renderer } = makeDeps({
      getCurrentState: () => ({
        externalChannels: {
          commit,
          snapshot: { getFloat },
        },
      }),
    });

    executeAnimationFrame(16, deps, createAnimationLoopState());

    expect(commit).toHaveBeenCalledTimes(1);
    expect(renderer.setViewportFrame).toHaveBeenCalledWith(expect.objectContaining({
      inputMouseX: 0.25,
      inputMouseY: 0.75,
      inputMouseButtons: 1,
      inputAudioLow: 0.1,
      inputAudioMid: 0.2,
      inputAudioHigh: 0.3,
      inputGaugeActive: 0.4,
    }));
  });

  it('skips frame publication when no program is installed', () => {
    const { deps, renderer } = makeDeps({ getCurrentProgram: () => null });
    executeAnimationFrame(16, deps, createAnimationLoopState());
    expect(renderer.setViewportFrame).not.toHaveBeenCalled();
    expect(runtimeProbeMocks.markRuntimeFrameAdvanced).not.toHaveBeenCalled();
  });

  it('throws when renderer runtime input publication fails', () => {
    const { deps, renderer, arena } = makeDeps();
    renderer.setViewportFrame.mockImplementation(() => {
      throw new Error('renderer input unavailable');
    });
    expect(() => executeAnimationFrame(16, deps, createAnimationLoopState())).toThrow('renderer input unavailable');
    expect(arena.beginFrame).toHaveBeenCalledTimes(1);
    expect(arena.endFrame).toHaveBeenCalledTimes(1);
  });

  it('emits stats updates from renderer telemetry data on cadence window', () => {
    const statsSink = vi.fn();
    const { deps, renderer } = makeDeps({ onStatsUpdate: statsSink });
    renderer.getLatestRuntimeTelemetry.mockReturnValue({
      meanMs: 0.8,
      frameCount: 42,
      stageTimings: {
        totalFrameMs: 1.5,
      },
      resourceStats: {
        totalInstanceCount: 7,
        sinkTableWordCount: 64,
      },
    });
    const state = createAnimationLoopState();
    state.lastFpsUpdate = 0;
    const perfSpy = vi.spyOn(performance, 'now').mockReturnValue(1000);
    try {
      executeAnimationFrame(16, deps, state);
    } finally {
      perfSpy.mockRestore();
    }
    expect(statsSink).toHaveBeenCalledTimes(1);
    const line = statsSink.mock.calls[0]?.[0] as string;
    expect(line).toContain('FPS');
    expect(line).toContain('DrawOps: 7');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    (globalThis as any).requestAnimationFrame = originalRaf;
    (globalThis as any).cancelAnimationFrame = originalCancelRaf;
    delete (globalThis as any).__testFrameCallback;
  });

  it('halts execution after first runtime exception', () => {
    const onError = vi.fn();
    const { deps, renderer } = makeDeps();
    renderer.setViewportFrame.mockImplementation(() => {
      throw new Error('renderer input unavailable');
    });
    const loop = startAnimationLoop(deps, createAnimationLoopState(), onError);
    const firstFrame = (globalThis as any).__testFrameCallback() as FrameRequestCallback;
    firstFrame(0);
    expect(onError).toHaveBeenCalledTimes(1);
    // [LAW:dataflow-not-control-flow] Fail-stop means no subsequent frame scheduling after error.
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(loop.onCompileSuccess()).toBe(true);
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(2);
  });

  it('resumes after compile success is signaled', () => {
    const onError = vi.fn();
    const { deps, renderer } = makeDeps();
    renderer.setViewportFrame.mockImplementation(() => {
      throw new Error('renderer input unavailable');
    });
    const loop = startAnimationLoop(deps, createAnimationLoopState(), onError);
    const firstFrame = (globalThis as any).__testFrameCallback() as FrameRequestCallback;
    firstFrame(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(loop.onCompileSuccess()).toBe(true);
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(2);
  });

  it('compile success resets loop-owned state even without prior runtime error', () => {
    const onError = vi.fn();
    const { deps } = makeDeps();
    const state = createAnimationLoopState();
    state.frameCount = 99;
    state.fps = 42;
    state.execTime = 3.2;
    state.renderTime = 5.7;
    state.minFrameTime = 1.2;
    state.maxFrameTime = 9.8;
    state.frameTimeSum = 123;
    state.lastContinuityStoreUpdate = 777;
    const loop = startAnimationLoop(deps, state, onError);
    const resumed = loop.onCompileSuccess();
    expect(resumed).toBe(false);
    expect(state.frameCount).toBe(0);
    expect(state.fps).toBe(0);
    expect(state.execTime).toBe(0);
    expect(state.renderTime).toBe(0);
    expect(state.minFrameTime).toBe(Infinity);
    expect(state.maxFrameTime).toBe(0);
    expect(state.frameTimeSum).toBe(0);
    expect(state.lastContinuityStoreUpdate).toBe(0);
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it('runs phase-boundary assertion on startup and compile boundaries', () => {
    const onError = vi.fn();
    const currentProgram = {};
    const { deps } = makeDeps({ getCurrentProgram: () => currentProgram });
    const loop = startAnimationLoop(deps, createAnimationLoopState(), onError);
    expect(assertSchedulePhaseBoundaryStateReadsMock).toHaveBeenCalledTimes(1);
    expect(assertSchedulePhaseBoundaryStateReadsMock).toHaveBeenLastCalledWith(currentProgram);
    loop.onCompileSuccess();
    expect(assertSchedulePhaseBoundaryStateReadsMock).toHaveBeenCalledTimes(2);
  });

  it('fails fast when required WebGPU loop dependencies are missing', () => {
    const onError = vi.fn();
    const { deps } = makeDeps({ getRenderer: () => null });
    expect(() => startAnimationLoop(deps, createAnimationLoopState(), onError))
      .toThrow('WebGPU runtime contract');
  });

  it('fails fast when arena dependency is missing', () => {
    const onError = vi.fn();
    const { deps } = makeDeps({ getArena: () => null });
    expect(() => startAnimationLoop(deps, createAnimationLoopState(), onError))
      .toThrow('WebGPU runtime contract');
  });
});
