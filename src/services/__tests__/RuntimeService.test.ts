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
import type { GpuFault } from '../../render';

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
  };
}

function makeRendererStub() {
  return {
    rebuildGpuPipelines: vi.fn<(...args: readonly unknown[]) => Promise<void>>(),
    setGpuFaultCallback: vi.fn<(callback: unknown) => void>(),
    dispose: vi.fn<() => void>(),
    render: vi.fn<(payload: unknown) => void>(),
  };
}

describe('RuntimeService', () => {
  beforeEach(() => {
    hoisted.createWebGPURendererMock.mockReset();
  });

  it('preserves the last-known-good GPU bundle when pipeline publication fails', async () => {
    const store = new RootStore();
    const service = new RuntimeService(store);
    const serviceAccess = service as unknown as {
      renderer: ReturnType<typeof makeRendererStub>;
      rendererExecutionState: 'active' | 'pausedByBreaker' | 'fatal';
      lastKnownGoodGpuBundle: CompiledGpuArtifactBundle | null;
      publishRendererPipelines: (artifacts: {
        readonly backendResult: { readonly kind: 'ok' };
        readonly compiledGpuBundle: CompiledGpuArtifactBundle;
      }) => Promise<void>;
    };
    const initialBundle = makeBundle('stable');
    const candidateBundle = makeBundle('candidate');
    const renderer = makeRendererStub();
    renderer.rebuildGpuPipelines.mockRejectedValue(new Error('reject install'));
    serviceAccess.renderer = renderer;
    serviceAccess.rendererExecutionState = 'active';
    serviceAccess.lastKnownGoodGpuBundle = initialBundle;

    await expect(
      serviceAccess.publishRendererPipelines({
        backendResult: { kind: 'ok' },
        compiledGpuBundle: candidateBundle,
      }),
    ).rejects.toThrow('reject install');

    expect(renderer.rebuildGpuPipelines).toHaveBeenCalledWith(candidateBundle.passes);
    expect(serviceAccess.lastKnownGoodGpuBundle).toBe(initialBundle);
  });

  it('rebuilds a fresh renderer from the last-known-good bundle after a fatal GPU fault', async () => {
    const store = new RootStore();
    const service = new RuntimeService(store);
    const serviceAccess = service as unknown as {
      arena: object | null;
      canvas: HTMLCanvasElement | null;
      renderer: ReturnType<typeof makeRendererStub> | null;
      rendererExecutionState: 'active' | 'pausedByBreaker' | 'fatal';
      lastKnownGoodGpuBundle: CompiledGpuArtifactBundle | null;
      rendererRecoveryPromise: Promise<void> | null;
      installRendererHotpathPlanes: (nowMs: number) => void;
      restartAnimationLoopAfterRecovery: () => void;
      handleGpuFault: (fault: GpuFault) => void;
    };
    const activeRenderer = makeRendererStub();
    const recoveredRenderer = makeRendererStub();
    const bundle = makeBundle('stable');
    hoisted.createWebGPURendererMock.mockResolvedValue(recoveredRenderer);
    serviceAccess.canvas = document.createElement('canvas');
    serviceAccess.arena = {};
    serviceAccess.renderer = activeRenderer;
    serviceAccess.rendererExecutionState = 'active';
    serviceAccess.lastKnownGoodGpuBundle = bundle;
    serviceAccess.installRendererHotpathPlanes = vi.fn();
    serviceAccess.restartAnimationLoopAfterRecovery = vi.fn();
    store.playback.play();

    serviceAccess.handleGpuFault({
      severity: 'fatal',
      code: 'WEBGPU_VALIDATION',
      message: 'bad shader',
      source: 'GPU_DRIVER',
      recoverable: false,
    });
    await serviceAccess.rendererRecoveryPromise;

    expect(store.playback.isPlaying).toBe(false);
    expect(activeRenderer.setGpuFaultCallback).toHaveBeenCalledWith(null);
    expect(activeRenderer.dispose).toHaveBeenCalledTimes(1);
    expect(hoisted.createWebGPURendererMock).toHaveBeenCalledTimes(1);
    expect(recoveredRenderer.rebuildGpuPipelines).toHaveBeenCalledWith(bundle.passes);
    expect(serviceAccess.renderer).toBe(recoveredRenderer);
    expect(serviceAccess.rendererExecutionState).toBe('active');
    expect(serviceAccess.installRendererHotpathPlanes).toHaveBeenCalledTimes(1);
    expect(serviceAccess.restartAnimationLoopAfterRecovery).toHaveBeenCalledTimes(1);
  });
});
