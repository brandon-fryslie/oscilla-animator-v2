import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnimationLoopState, executeAnimationFrame, startAnimationLoop } from '../AnimationLoop';
import { executeFrame } from '../../runtime';
import { createHealthMetrics } from '../../runtime/RuntimeState';

vi.mock('../../runtime', () => ({
  executeFrame: vi.fn(() => {
    throw new Error('boom');
  }),
}));

describe('AnimationLoop', () => {
  const executeFrameMock = vi.mocked(executeFrame);
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancelRaf = globalThis.cancelAnimationFrame;

  beforeEach(() => {
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

  it('forwards compiler draw-prep shader WGSL to renderer input', () => {
    const arena = { reset: vi.fn(), getTotalBytes: () => 0 };
    const renderer = { render: vi.fn() };
    const drawPrepShaderWgsl = '@compute @workgroup_size(1)\nfn cs_main() {}';
    executeFrameMock.mockReturnValue({ version: 2, ops: [] } as any);

    const deps = {
      getCurrentProgram: () => ({ drawPrepProgram: { wgsl: drawPrepShaderWgsl } }),
      getCurrentState: () => ({
        health: createHealthMetrics(),
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
    expect(renderArg.drawPrepShaderWgsl).toBe(drawPrepShaderWgsl);
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
