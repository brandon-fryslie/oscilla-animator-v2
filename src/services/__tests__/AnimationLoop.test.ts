import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnimationLoopState, executeAnimationFrame, startAnimationLoop } from '../AnimationLoop';
import { assertSchedulePhaseBoundaryStateReads, executeFrame } from '../../runtime';
import { createHealthMetrics } from '../../runtime/RuntimeState';

vi.mock('../../runtime', () => ({
  assertSchedulePhaseBoundaryStateReads: vi.fn(),
  executeFrame: vi.fn(() => {
    throw new Error('boom');
  }),
}));

function makeEmptyShapeBank() {
  return {
    data: new Uint32Array(1),
    volatilePtr: 0,
    staticBoundary: 0,
    topologyIdByHandle: new Uint32Array(1),
  };
}

describe('AnimationLoop', () => {
  const executeFrameMock = vi.mocked(executeFrame);
  const assertSchedulePhaseBoundaryStateReadsMock = vi.mocked(assertSchedulePhaseBoundaryStateReads);
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancelRaf = globalThis.cancelAnimationFrame;

  beforeEach(() => {
    assertSchedulePhaseBoundaryStateReadsMock.mockReset();
    executeFrameMock.mockImplementation(() => {
      throw new Error('boom');
    });
    let callback: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => {
      callback = cb;
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    (globalThis as any).__testFrameCallback = () => callback;
  });

  it('executes frame pipeline in fixed order: reset -> executeFrame -> render', () => {
    const arena = { reset: vi.fn(), getTotalBytes: () => 0 };
    const renderer = { render: vi.fn() };
    executeFrameMock.mockReturnValue({ version: 2, ops: [] } as any);

    const deps = {
      getCurrentProgram: () => ({}),
      getCurrentState: () => ({
        health: createHealthMetrics(),
        shapeBank: makeEmptyShapeBank(),
      }),
      getCanvas: () => ({ width: 100, height: 80 }),
      getRenderer: () => renderer,
      getArena: () => arena,
      store: {
        stepDebug: null,
        diagnostics: {
          recordJank: vi.fn(),
          updateFrameTiming: vi.fn(),
          updateMemoryStats: vi.fn(),
        },
        continuity: { updateFromRuntime: vi.fn() },
        viewport: { zoom: 1, pan: { x: 0, y: 0 }, setContentBounds: vi.fn() },
        events: { emit: vi.fn() },
        getPatchRevision: () => 1,
      },
    } as any;

    const state = createAnimationLoopState();
    executeAnimationFrame(16, deps, state);

    expect(arena.reset).toHaveBeenCalledTimes(1);
    expect(executeFrameMock).toHaveBeenCalledTimes(1);
    expect(executeFrameMock.mock.calls[0]).toHaveLength(4);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(deps.store.viewport.setContentBounds).toHaveBeenCalledWith(null);
    expect(arena.reset.mock.invocationCallOrder[0]).toBeLessThan(executeFrameMock.mock.invocationCallOrder[0]);
    expect(executeFrameMock.mock.invocationCallOrder[0]).toBeLessThan(renderer.render.mock.invocationCallOrder[0]);
  });

  it('renders canonical empty frame when frame acquisition returns null', () => {
    const arena = { reset: vi.fn(), getTotalBytes: () => 0 };
    const renderer = { render: vi.fn() };
    executeFrameMock.mockReturnValue(null as any);

    const deps = {
      getCurrentProgram: () => ({}),
      getCurrentState: () => ({
        health: createHealthMetrics(),
        shapeBank: makeEmptyShapeBank(),
      }),
      getCanvas: () => ({ width: 100, height: 80 }),
      getRenderer: () => renderer,
      getArena: () => arena,
      store: {
        stepDebug: null,
        diagnostics: {
          recordJank: vi.fn(),
          updateFrameTiming: vi.fn(),
          updateMemoryStats: vi.fn(),
        },
        continuity: { updateFromRuntime: vi.fn() },
        viewport: { zoom: 1, pan: { x: 0, y: 0 }, setContentBounds: vi.fn() },
        events: { emit: vi.fn() },
        getPatchRevision: () => 1,
      },
    } as any;

    const state = createAnimationLoopState();
    executeAnimationFrame(16, deps, state);

    const renderArg = renderer.render.mock.calls[0]?.[0];
    expect(renderArg.frame).toEqual({ version: 2, ops: [] });
  });

  it('enables cardinality slot write assertions when cardinality debug tracing is on', () => {
    const arena = { reset: vi.fn(), getTotalBytes: () => 0 };
    const renderer = { render: vi.fn() };
    executeFrameMock.mockReturnValue({ version: 2, ops: [] } as any);

    const deps = {
      getCurrentProgram: () => ({}),
      getCurrentState: () => ({
        health: createHealthMetrics(),
        shapeBank: makeEmptyShapeBank(),
      }),
      getCanvas: () => ({ width: 100, height: 80 }),
      getRenderer: () => renderer,
      getArena: () => arena,
      store: {
        debug: { enabled: true, traceCardinalitySolver: true },
        stepDebug: null,
        diagnostics: {
          recordJank: vi.fn(),
          updateFrameTiming: vi.fn(),
          updateMemoryStats: vi.fn(),
        },
        continuity: { updateFromRuntime: vi.fn() },
        viewport: { zoom: 1, pan: { x: 0, y: 0 }, setContentBounds: vi.fn() },
        events: { emit: vi.fn() },
        getPatchRevision: () => 1,
      },
    } as any;

    const state = createAnimationLoopState();
    executeAnimationFrame(16, deps, state);

    expect(executeFrameMock.mock.calls.length).toBeGreaterThan(0);
    const lastCall = executeFrameMock.mock.calls[executeFrameMock.mock.calls.length - 1];
    expect(lastCall?.[4]).toEqual({ assertCardinalitySlotWrites: true });
  });

  it('does not read coordinate payloads on CPU in frame hot path', () => {
    const arena = { reset: vi.fn(), getTotalBytes: () => 0 };
    const renderer = { render: vi.fn() };
    const cpuCoordinateTouch = vi.fn(() => {
      throw new Error('CPU coordinate scan is forbidden in animation hot path');
    });
    executeFrameMock.mockReturnValue({
      version: 2,
      ops: [
        {
          instances: { count: 3 },
          get points() {
            return cpuCoordinateTouch();
          },
          get bounds() {
            return cpuCoordinateTouch();
          },
        } as any,
      ],
    } as any);

    const deps = {
      getCurrentProgram: () => ({}),
      getCurrentState: () => ({
        health: createHealthMetrics(),
        shapeBank: makeEmptyShapeBank(),
      }),
      getCanvas: () => ({ width: 100, height: 80 }),
      getRenderer: () => renderer,
      getArena: () => arena,
      store: {
        stepDebug: null,
        diagnostics: {
          recordJank: vi.fn(),
          updateFrameTiming: vi.fn(),
          updateMemoryStats: vi.fn(),
        },
        continuity: { updateFromRuntime: vi.fn() },
        viewport: { zoom: 1, pan: { x: 0, y: 0 }, setContentBounds: vi.fn() },
        events: { emit: vi.fn() },
        getPatchRevision: () => 1,
      },
    } as any;

    const state = createAnimationLoopState();
    executeAnimationFrame(16, deps, state);

    // [LAW:dataflow-not-control-flow] Frame loop must remain GPU-first and
    // never branch into CPU coordinate extraction during orchestration.
    expect(cpuCoordinateTouch).not.toHaveBeenCalled();
    expect(deps.store.viewport.setContentBounds).toHaveBeenCalledWith(null);
  });

  it('forwards compiler draw-prep sink metadata to renderer input', () => {
    const arena = { reset: vi.fn(), getTotalBytes: () => 0 };
    const renderer = { render: vi.fn() };
    const drawPrepSinks = [{
      sinkIndex: 0,
      renderStepIndex: 0,
      instanceId: 'inst-0',
      indirectRecordIndex: 0,
      instanceCountMode: 'static',
      staticInstanceCount: 4,
    }] as const;
    executeFrameMock.mockReturnValue({ version: 2, ops: [] } as any);

    const deps = {
      getCurrentProgram: () => ({ drawPrepProgram: { sinks: drawPrepSinks } }),
      getCurrentState: () => ({
        health: createHealthMetrics(),
        shapeBank: makeEmptyShapeBank(),
      }),
      getCanvas: () => ({ width: 100, height: 80 }),
      getRenderer: () => renderer,
      getArena: () => arena,
      store: {
        stepDebug: null,
        diagnostics: {
          recordJank: vi.fn(),
          updateFrameTiming: vi.fn(),
          updateMemoryStats: vi.fn(),
        },
        continuity: { updateFromRuntime: vi.fn() },
        viewport: { zoom: 1, pan: { x: 0, y: 0 }, setContentBounds: vi.fn() },
        events: { emit: vi.fn() },
        getPatchRevision: () => 1,
      },
    } as any;

    const state = createAnimationLoopState();
    executeAnimationFrame(16, deps, state);

    const renderArg = renderer.render.mock.calls[0]?.[0];
    expect(Object.prototype.hasOwnProperty.call(renderArg ?? {}, 'drawPrepShaderWgsl')).toBe(false);
    expect(renderArg.drawPrepSinks).toEqual(drawPrepSinks);
  });

  it('derives renderer input channels from the canonical external snapshot', () => {
    const arena = { reset: vi.fn(), getTotalBytes: () => 0 };
    const renderer = { render: vi.fn() };
    executeFrameMock.mockReturnValue({ version: 2, ops: [] } as any);

    const channels = new Map<string, number>([
      ['mouse.x', 0.7],
      ['mouse.y', 0.2],
      ['mouse.button.left.held', 1],
      ['mouse.button.right.held', 1],
      ['audio.low', 0.1],
      ['audio.mid', 0.2],
      ['audio.high', 0.3],
      ['gauge.active', 1],
    ]);

    const deps = {
      getCurrentProgram: () => ({}),
      getCurrentState: () => ({
        health: createHealthMetrics(),
        shapeBank: makeEmptyShapeBank(),
        externalChannels: {
          snapshot: {
            getFloat: (name: string) => channels.get(name) ?? 0,
          },
        },
      }),
      getCanvas: () => ({ width: 100, height: 80 }),
      getRenderer: () => renderer,
      getArena: () => arena,
      store: {
        stepDebug: null,
        diagnostics: {
          recordJank: vi.fn(),
          updateFrameTiming: vi.fn(),
          updateMemoryStats: vi.fn(),
        },
        continuity: { updateFromRuntime: vi.fn() },
        viewport: { zoom: 1, pan: { x: 0, y: 0 }, setContentBounds: vi.fn() },
        events: { emit: vi.fn() },
        getPatchRevision: () => 1,
      },
    } as any;

    const state = createAnimationLoopState();
    executeAnimationFrame(16, deps, state);

    const renderArg = renderer.render.mock.calls[0]?.[0];
    expect(renderArg.inputMouseX).toBe(0.7);
    expect(renderArg.inputMouseY).toBe(0.2);
    expect(renderArg.inputMouseButtons).toBe(3);
    expect(renderArg.inputAudioLow).toBe(0.1);
    expect(renderArg.inputAudioMid).toBe(0.2);
    expect(renderArg.inputAudioHigh).toBe(0.3);
    expect(renderArg.inputGaugeActive).toBe(1);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    (globalThis as any).requestAnimationFrame = originalRaf;
    (globalThis as any).cancelAnimationFrame = originalCancelRaf;
    delete (globalThis as any).__testFrameCallback;
  });

  it('halts execution after first runtime exception', () => {
    const onError = vi.fn();
    const deps = {
      getCurrentProgram: () => ({}),
      getCurrentState: () => ({
        health: {
          prevRafTimestamp: null,
          frameDeltas: new Float64Array(60),
          frameDeltasIndex: 0,
          frameCountInWindow: 0,
          frameDeltaSum: 0,
          frameDeltaSumSq: 0,
          minFrameDelta: Infinity,
          maxFrameDelta: 0,
        },
        shapeBank: makeEmptyShapeBank(),
      }),
      getCanvas: () => ({ width: 100, height: 100 }),
      getRenderer: () => ({
        render: vi.fn(),
      }),
      getArena: () => ({ reset: vi.fn(), getTotalBytes: () => 0 }),
      store: {
        stepDebug: null,
        diagnostics: {
          recordJank: vi.fn(),
          updateFrameTiming: vi.fn(),
          updateMemoryStats: vi.fn(),
        },
        continuity: { updateFromRuntime: vi.fn() },
        viewport: { zoom: 1, pan: { x: 0, y: 0 }, setContentBounds: vi.fn() },
        events: { emit: vi.fn() },
        getPatchRevision: () => 1,
      },
    } as any;

    const loop = startAnimationLoop(deps, createAnimationLoopState(), onError);
    const firstFrame = (globalThis as any).__testFrameCallback() as FrameRequestCallback;
    firstFrame(0);

    expect(onError).toHaveBeenCalledTimes(1);
    // [LAW:dataflow-not-control-flow] Fail-stop means no subsequent frame scheduling after error.
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(loop.onCompileSuccess()).toBe(true);
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(2);
  });

  it('resumes after WebGPU renderer failure when compile success is signaled', () => {
    executeFrameMock.mockReturnValue({ version: 2, ops: [] } as any);
    const onError = vi.fn();
    const renderer = {
      render: vi.fn(() => {
        throw new Error('WebGPU pipeline failure');
      }),
    };
    const deps = {
      getCurrentProgram: () => ({}),
      getCurrentState: () => ({
        health: createHealthMetrics(),
        shapeBank: makeEmptyShapeBank(),
      }),
      getCanvas: () => ({ width: 100, height: 100 }),
      getRenderer: () => renderer,
      getArena: () => ({ reset: vi.fn(), getTotalBytes: () => 0 }),
      store: {
        stepDebug: null,
        diagnostics: {
          recordJank: vi.fn(),
          updateFrameTiming: vi.fn(),
          updateMemoryStats: vi.fn(),
        },
        continuity: { updateFromRuntime: vi.fn() },
        viewport: { zoom: 1, pan: { x: 0, y: 0 }, setContentBounds: vi.fn() },
        events: { emit: vi.fn() },
        getPatchRevision: () => 1,
      },
    } as any;

    const loop = startAnimationLoop(deps, createAnimationLoopState(), onError);
    const firstFrame = (globalThis as any).__testFrameCallback() as FrameRequestCallback;
    firstFrame(0);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(loop.onCompileSuccess()).toBe(true);
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(2);
  });

  it('compile success resets loop-owned state even without prior runtime error', () => {
    executeFrameMock.mockReturnValue({ version: 2, ops: [] } as any);
    const onError = vi.fn();
    const deps = {
      getCurrentProgram: () => ({}),
      getCurrentState: () => ({
        health: createHealthMetrics(),
        shapeBank: makeEmptyShapeBank(),
      }),
      getCanvas: () => ({ width: 100, height: 100 }),
      getRenderer: () => ({
        render: vi.fn(),
      }),
      getArena: () => ({ reset: vi.fn(), getTotalBytes: () => 0 }),
      store: {
        stepDebug: null,
        diagnostics: {
          recordJank: vi.fn(),
          updateFrameTiming: vi.fn(),
          updateMemoryStats: vi.fn(),
        },
        continuity: { updateFromRuntime: vi.fn() },
        viewport: { zoom: 1, pan: { x: 0, y: 0 }, setContentBounds: vi.fn() },
        events: { emit: vi.fn() },
        getPatchRevision: () => 1,
      },
    } as any;

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
    // Compile success should not duplicate frame scheduling when one frame is already queued.
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it('runs phase-boundary assertion on startup and compile boundaries', () => {
    executeFrameMock.mockReturnValue({ version: 2, ops: [] } as any);
    const onError = vi.fn();
    const currentProgram = {};
    const deps = {
      getCurrentProgram: () => currentProgram,
      getCurrentState: () => ({ health: createHealthMetrics(), shapeBank: makeEmptyShapeBank() }),
      getCanvas: () => ({ width: 100, height: 100 }),
      getRenderer: () => ({ render: vi.fn() }),
      getArena: () => ({ reset: vi.fn(), getTotalBytes: () => 0 }),
      store: {
        stepDebug: null,
        diagnostics: {
          recordJank: vi.fn(),
          updateFrameTiming: vi.fn(),
          updateMemoryStats: vi.fn(),
        },
        continuity: { updateFromRuntime: vi.fn() },
        viewport: { zoom: 1, pan: { x: 0, y: 0 }, setContentBounds: vi.fn() },
        events: { emit: vi.fn() },
        getPatchRevision: () => 1,
      },
    } as any;

    const loop = startAnimationLoop(deps, createAnimationLoopState(), onError);
    expect(assertSchedulePhaseBoundaryStateReadsMock).toHaveBeenCalledTimes(1);
    expect(assertSchedulePhaseBoundaryStateReadsMock).toHaveBeenLastCalledWith(currentProgram);

    loop.onCompileSuccess();
    expect(assertSchedulePhaseBoundaryStateReadsMock).toHaveBeenCalledTimes(2);
  });

  it('fails fast when required WebGPU loop dependencies are missing', () => {
    const onError = vi.fn();
    const deps = {
      getCurrentProgram: () => ({}),
      getCurrentState: () => ({
        health: {
          prevRafTimestamp: null,
          frameDeltas: new Float64Array(60),
          frameDeltasIndex: 0,
          frameCountInWindow: 0,
          frameDeltaSum: 0,
          frameDeltaSumSq: 0,
          minFrameDelta: Infinity,
          maxFrameDelta: 0,
        },
        shapeBank: makeEmptyShapeBank(),
      }),
      getCanvas: () => ({ width: 100, height: 100 }),
      getRenderer: () => null,
      getArena: () => ({ reset: vi.fn(), getTotalBytes: () => 0 }),
      store: {
        stepDebug: null,
        diagnostics: {
          recordJank: vi.fn(),
          updateFrameTiming: vi.fn(),
          updateMemoryStats: vi.fn(),
        },
        continuity: { updateFromRuntime: vi.fn() },
        viewport: { zoom: 1, pan: { x: 0, y: 0 }, setContentBounds: vi.fn() },
        events: { emit: vi.fn() },
        getPatchRevision: () => 1,
      },
    } as any;

    expect(() => startAnimationLoop(deps, createAnimationLoopState(), onError))
      .toThrow('WebGPU runtime contract');
  });
});
