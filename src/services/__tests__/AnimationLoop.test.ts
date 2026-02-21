import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnimationLoopState, startAnimationLoop } from '../AnimationLoop';

vi.mock('../../runtime', () => ({
  executeFrame: vi.fn(() => {
    throw new Error('boom');
  }),
}));

describe('AnimationLoop', () => {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancelRaf = globalThis.cancelAnimationFrame;

  beforeEach(() => {
    let callback: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => {
      callback = cb;
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    (globalThis as any).__testFrameCallback = () => callback;
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
      getContext: () => ({
        setTransform: vi.fn(),
        fillStyle: '#000',
        fillRect: vi.fn(),
        save: vi.fn(),
        translate: vi.fn(),
        scale: vi.fn(),
        restore: vi.fn(),
      }),
      getArena: () => ({ reset: vi.fn(), getTotalAllocatedBytes: () => 0 }),
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

    startAnimationLoop(deps, createAnimationLoopState(), onError);
    const firstFrame = (globalThis as any).__testFrameCallback() as FrameRequestCallback;
    firstFrame(0);

    expect(onError).toHaveBeenCalledTimes(1);
    // [LAW:dataflow-not-control-flow] Fail-stop means no subsequent frame scheduling after error.
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);
  });
});
