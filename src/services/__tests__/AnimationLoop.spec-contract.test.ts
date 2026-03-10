import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createAnimationLoopState, executeAnimationFrame } from '../AnimationLoop';

const runtimeMocks = vi.hoisted(() => ({
  assertSchedulePhaseBoundaryStateReads: vi.fn(),
  executeFrame: vi.fn(),
  packDrawPrepSinkTableV1: vi.fn(() => null),
}));

vi.mock('../../runtime', () => ({
  assertSchedulePhaseBoundaryStateReads: runtimeMocks.assertSchedulePhaseBoundaryStateReads,
  executeFrame: runtimeMocks.executeFrame,
  packDrawPrepSinkTableV1: runtimeMocks.packDrawPrepSinkTableV1,
}));

vi.mock('../../testing/runtime-probe', () => ({
  markRuntimeFrameAdvanced: vi.fn(),
}));

function makeDeps() {
  const renderer = {
    resizeCanvas: vi.fn(),
    setViewportFrame: vi.fn(),
    render: vi.fn(),
    getLifecycleState: vi.fn(() => 'Running'),
    getLatestRuntimeTelemetry: vi.fn(() => null),
    getInstalledGpuPassIds: vi.fn(() => []),
    getLatestSinkTableSample: vi.fn(() => null),
  };
  const arena = {
    beginFrame: vi.fn(),
    endFrame: vi.fn(),
  };
  const state = {
    cache: { frameId: 1 },
    externalChannels: {
      commit: vi.fn(),
      snapshot: { getFloat: vi.fn(() => 0) },
    },
    arena: new Float32Array(16),
    shapeBank: {
      data: new Uint32Array(16),
      volatilePtr: 0,
      staticBoundary: 0,
      topologyIdByHandle: new Int32Array(16),
    },
  };
  return {
    renderer,
    deps: {
      getCurrentProgram: () => ({}),
      getCurrentState: () => state,
      getCanvas: () => ({ width: 100, height: 80 }),
      getRenderer: () => renderer,
      getArena: () => arena,
      store: {
        demo: { currentFilename: null },
        viewport: { zoom: 1, pan: { x: 0, y: 0 }, canvasWidth: 100, canvasHeight: 80 },
      },
    } as any,
  };
}

describe('AnimationLoop spec contract', () => {
  beforeEach(() => {
    runtimeMocks.executeFrame.mockReset();
    runtimeMocks.packDrawPrepSinkTableV1.mockReset();
    runtimeMocks.packDrawPrepSinkTableV1.mockReturnValue(null);
  });

  it('does not execute CPU schedule or sink packing in the RAF hot path', () => {
    const { deps } = makeDeps();

    executeAnimationFrame(16, deps, createAnimationLoopState());

    expect(runtimeMocks.executeFrame).not.toHaveBeenCalled();
    expect(runtimeMocks.packDrawPrepSinkTableV1).not.toHaveBeenCalled();
  });

  it('publishes per-frame data through setViewportFrame only (no renderer.render)', () => {
    const { deps, renderer } = makeDeps();

    executeAnimationFrame(16, deps, createAnimationLoopState());

    expect(renderer.setViewportFrame).toHaveBeenCalledTimes(1);
    expect(renderer.render).not.toHaveBeenCalled();
  });
});

