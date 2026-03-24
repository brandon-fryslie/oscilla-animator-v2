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
import type { CompiledGpuArtifactBundle, CompiledGpuPassArtifact } from '../compile-worker-protocol';
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

function makePass(passId: string): CompiledGpuPassArtifact {
  return {
    passId,
    stage: 'compute',
    entryPoint: 'main',
    wgsl: '@compute @workgroup_size(64) fn main() {}',
  };
}

function makeBundle(passId: string): CompiledGpuArtifactBundle {
  return {
    schemaVersion: 1,
    passes: [makePass(passId)],
    runtimeInstall: {
      drawPrep: {
        words: new Uint32Array([11, 22, 33]),
        wordCount: 3,
        sinkPointerMap: {
          '0:position': 'arena:slot:2',
          '0:color': 'arena:slot:3',
          '0:scale': 'arena:slot:4',
          '0:shape': 'arena:slot:1',
        },
      },
      shapeBank: {
        words: new Uint32Array([44, 55, 66, 77]),
        wordCount: 4,
        topologyIdByHandle: new Uint32Array([99, 0, 0, 0]),
      },
    },
  };
}

function makeRendererStub() {
  return {
    rebuildGpuPipelines: vi.fn<(...args: readonly unknown[]) => Promise<void>>(),
    installDrawPrepSinkPointerMap: vi.fn<(...args: readonly unknown[]) => Promise<void>>(),
    setGpuFaultCallback: vi.fn<(callback: unknown) => void>(),
    dispose: vi.fn<() => void>(),
    render: vi.fn<(payload: unknown) => void>(),
  };
}

describe('RuntimeService', () => {
  beforeEach(() => {
    hoisted.createWebGPURendererMock.mockReset();
  });

  it('leaves the active renderer in place when pipeline publication fails', async () => {
    const store = new RootStore();
    const service = new RuntimeService(store);
    const serviceAccess = service as unknown as {
      runtimeResourcesState: ReturnType<typeof makeActiveRuntimeState>;
      rendererExecutionState: 'active' | 'pausedByBreaker' | 'fatal';
      publishRendererPipelines: (artifacts: {
        readonly backendResult: { readonly kind: 'ok' };
        readonly compiledGpuBundle: CompiledGpuArtifactBundle;
      }) => Promise<void>;
    };
    const candidateBundle = makeBundle('candidate');
    const renderer = makeRendererStub();
    renderer.rebuildGpuPipelines.mockRejectedValue(new Error('reject install'));
    serviceAccess.runtimeResourcesState = makeActiveRuntimeState(renderer);
    serviceAccess.rendererExecutionState = 'active';

    await expect(
      serviceAccess.publishRendererPipelines({
        backendResult: { kind: 'ok' },
        compiledGpuBundle: candidateBundle,
      }),
    ).rejects.toThrow('reject install');

    expect(renderer.rebuildGpuPipelines).toHaveBeenCalledWith(candidateBundle.passes);
    expect(serviceAccess.runtimeResourcesState.runtime.renderer).toBe(renderer);
  });

  it('publishes worker-owned install metadata directly to renderer.render', async () => {
    const store = new RootStore();
    const service = new RuntimeService(store);
    const serviceAccess = service as unknown as {
      runtimeResourcesState: ReturnType<typeof makeActiveRuntimeState>;
      rendererExecutionState: 'active' | 'pausedByBreaker' | 'fatal';
      installRendererCanonicalAssets: (bundle: CompiledGpuArtifactBundle) => Promise<void>;
    };
    const renderer = makeRendererStub();
    const bundle = makeBundle('worker-owned-install');
    const canvas = { width: 640, height: 360 } as HTMLCanvasElement;
    serviceAccess.runtimeResourcesState = makeActiveRuntimeState(renderer, canvas);
    serviceAccess.rendererExecutionState = 'active';

    await serviceAccess.installRendererCanonicalAssets(bundle);

    expect(renderer.installDrawPrepSinkPointerMap).toHaveBeenCalledWith(
      bundle.runtimeInstall.drawPrep.sinkPointerMap,
    );

    expect(renderer.render).toHaveBeenCalledWith(expect.objectContaining({
      shapeBank: expect.objectContaining({
        data: bundle.runtimeInstall.shapeBank.words,
        volatilePtr: bundle.runtimeInstall.shapeBank.wordCount,
        topologyIdByHandle: bundle.runtimeInstall.shapeBank.topologyIdByHandle,
      }),
      drawPrepSinkTableV1: bundle.runtimeInstall.drawPrep.words,
      drawPrepSinkTableWordCount: bundle.runtimeInstall.drawPrep.wordCount,
    }));
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
