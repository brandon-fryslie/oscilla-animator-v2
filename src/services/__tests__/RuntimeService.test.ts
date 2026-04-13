import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  createWebGPURendererMock: vi.fn(),
}));

vi.mock('../../render', async () => {
  const actual = await vi.importActual<typeof import('../../render')>('../../render');
  return {
    ...actual,
    createWebGPURenderer: hoisted.createWebGPURendererMock,
  };
});

import { RuntimeService } from '../RuntimeService';
import { RootStore } from '../../stores/RootStore';

function makeActiveRuntimeState(
  renderer: ReturnType<typeof makeRendererStub>,
  canvas: HTMLCanvasElement = { width: 640, height: 360 } as HTMLCanvasElement,
) {
  return {
    kind: 'active' as const,
    runtime: {
      canvas,
      renderer,
      arena: {} as never,
    },
  };
}

function makeRendererStub() {
  return {
    applyInstallPipeline: vi.fn<(...args: readonly unknown[]) => Promise<void>>(),
    publishFrameInput: vi.fn<(payload: unknown) => void>(),
    setGpuFaultCallback: vi.fn<(callback: unknown) => void>(),
    dispose: vi.fn<() => void>(),
    render: vi.fn<(payload: unknown) => void>(),
  };
}

describe('RuntimeService', () => {
  beforeEach(() => {
    hoisted.createWebGPURendererMock.mockReset();
  });

  it('disposes the renderer and preserves app state after a fatal GPU fault', async () => {
    const store = new RootStore();
    const service = new RuntimeService(store);
    const serviceAccess = service as unknown as {
      runtimeResourcesState:
        | ReturnType<typeof makeActiveRuntimeState>
        | {
          readonly kind: 'faulted';
          readonly fault: { readonly code: string };
        };
      rendererExecutionState: 'active' | 'pausedByBreaker' | 'fatal';
      handleGpuFault: (fault: {
        severity: 'fatal';
        code: string;
        message: string;
        source: string;
        recoverable: false;
      }) => void;
    };
    const activeRenderer = makeRendererStub();
    serviceAccess.runtimeResourcesState = makeActiveRuntimeState(activeRenderer);
    serviceAccess.rendererExecutionState = 'active';
    store.playback.play();

    serviceAccess.handleGpuFault({
      severity: 'fatal',
      code: 'WEBGPU_VALIDATION',
      message: 'bad shader',
      source: 'GPU_DRIVER',
      recoverable: false,
    });

    expect(store.playback.isPlaying).toBe(false);
    expect(activeRenderer.setGpuFaultCallback).toHaveBeenCalledWith(null);
    expect(activeRenderer.dispose).toHaveBeenCalledTimes(1);
    expect(hoisted.createWebGPURendererMock).not.toHaveBeenCalled();
    expect(serviceAccess.runtimeResourcesState.kind).toBe('faulted');
    expect(serviceAccess.rendererExecutionState).toBe('fatal');
    expect(store.diagnostics.logs.at(-1)?.message).toBe(
      'Fatal GPU fault [GPU_DRIVER/WEBGPU_VALIDATION] stopped rendering. Patch and editor state were preserved.',
    );
  });
});
