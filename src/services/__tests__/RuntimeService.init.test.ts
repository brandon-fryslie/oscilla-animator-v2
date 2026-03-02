import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class FakeRenderBufferArena {
    init = vi.fn();
    getTotalBytes = vi.fn(() => 0);
  }

  class FakeCompileWorkerClient {
    compile = vi.fn();
    dispose = vi.fn();
  }

  class FakeAsyncCompilerService {
    subscribe = vi.fn(() => vi.fn());
    getState = vi.fn(() => 'idle');
    getLastErrorMessage = vi.fn(() => null);
    scheduleCompile = vi.fn();
    takeReadyArtifactsForSwap = vi.fn(() => null);
    markSwapComplete = vi.fn();
    markSwapFailed = vi.fn();
    dispose = vi.fn();
  }

  return {
    compileAndSwapMock: vi.fn(),
    createWebGPURendererMock: vi.fn(),
    assertWebGPUStartupContractMock: vi.fn(),
    loadPatchFromStorageMock: vi.fn(),
    savePatchToStorageMock: vi.fn(),
    consumeTestDemoFilenameMock: vi.fn(),
    markRuntimeBootstrapStartedMock: vi.fn(),
    markRuntimeBootstrapSucceededMock: vi.fn(),
    markRuntimeBootstrapFailedMock: vi.fn(),
    setRenderIssueReporterMock: vi.fn(),
    getRenderIssuesMock: vi.fn(() => []),
    clearRenderIssuesMock: vi.fn(),
    startAnimationLoopMock: vi.fn(() => ({
      stop: vi.fn(),
      onCompileSuccess: vi.fn(() => false),
    })),
    createAnimationLoopStateMock: vi.fn(() => ({
      frameCount: 0,
      lastFpsUpdate: 0,
      fps: 0,
      execTime: 0,
      renderTime: 0,
      minFrameTime: Infinity,
      maxFrameTime: 0,
      frameTimeSum: 0,
      lastContinuityStoreUpdate: 0,
    })),
    debugClearMock: vi.fn(),
    setCompilationInspectorErrorReporterMock: vi.fn(),
    liveRecompileSetupMock: vi.fn(),
    debugOnTrackedSpyScalarSlotsChangeMock: vi.fn(() => vi.fn()),
    debugGetTrackedSpyScalarSlotsMock: vi.fn(() => []),
    createDomainChangeDetectorCleanupMock: vi.fn(),
    FakeRenderBufferArena,
    FakeCompileWorkerClient,
    FakeAsyncCompilerService,
  };
});

vi.mock('../CompileOrchestrator', () => ({
  compileAndSwap: mocks.compileAndSwapMock,
}));

vi.mock('../../render', () => ({
  assertWebGPUStartupContract: mocks.assertWebGPUStartupContractMock,
  createWebGPURenderer: mocks.createWebGPURendererMock,
  RenderBufferArena: mocks.FakeRenderBufferArena,
  setRenderIssueReporter: mocks.setRenderIssueReporterMock,
  getRenderIssues: mocks.getRenderIssuesMock,
  clearRenderIssues: mocks.clearRenderIssuesMock,
}));

vi.mock('../PatchPersistence', () => ({
  loadPatchFromStorage: mocks.loadPatchFromStorageMock,
  savePatchToStorage: mocks.savePatchToStorageMock,
}));

vi.mock('../../testing/test-params', () => ({
  consumeTestDemoFilename: mocks.consumeTestDemoFilenameMock,
}));

vi.mock('../../testing/runtime-probe', () => ({
  markRuntimeBootstrapFailed: mocks.markRuntimeBootstrapFailedMock,
  markRuntimeBootstrapStarted: mocks.markRuntimeBootstrapStartedMock,
  markRuntimeBootstrapSucceeded: mocks.markRuntimeBootstrapSucceededMock,
}));

vi.mock('../CompileWorkerClient', () => ({
  CompileWorkerClient: mocks.FakeCompileWorkerClient,
}));

vi.mock('../DomainChangeDetector', () => ({
  createDomainChangeDetector: () => ({
    detectAndLogDomainChanges: vi.fn(),
    cleanup: mocks.createDomainChangeDetectorCleanupMock,
  }),
}));

vi.mock('../LiveRecompile', () => ({
  createLiveRecompileController: () => ({
    setup: mocks.liveRecompileSetupMock,
    cleanup: vi.fn(),
  }),
}));

vi.mock('../ConstantPatcher', () => ({
  patchProgramConstants: vi.fn(() => false),
}));

vi.mock('../DebugService', () => ({
  debugService: {
    clear: mocks.debugClearMock,
    onTrackedSpyScalarSlotsChange: mocks.debugOnTrackedSpyScalarSlotsChangeMock,
    getTrackedSpyScalarSlots: mocks.debugGetTrackedSpyScalarSlotsMock,
  },
}));

vi.mock('../CompilationInspectorService', () => ({
  compilationInspector: {
    setErrorReporter: mocks.setCompilationInspectorErrorReporterMock,
  },
}));

vi.mock('../AsyncCompilerService', () => ({
  AsyncCompilerService: mocks.FakeAsyncCompilerService,
}));

vi.mock('../AnimationLoop', () => ({
  startAnimationLoop: mocks.startAnimationLoopMock,
  createAnimationLoopState: mocks.createAnimationLoopStateMock,
}));

vi.mock('../../settings/tokens/debug-settings', () => ({
  debugSettings: { id: 'debug-settings' },
}));

vi.mock('../../settings/tokens/compiler-flags-settings', () => ({
  compilerFlagsSettings: { id: 'compiler-flags-settings' },
}));

vi.mock('../../settings/tokens/app-settings', () => ({
  appSettings: { id: 'app-settings' },
}));

import { RuntimeService } from '../RuntimeService';

function makeStore() {
  return {
    settings: {
      register: vi.fn(),
      get: vi.fn(() => null),
    },
    demo: {
      selectDemo: vi.fn(() => true),
      loadDefault: vi.fn(),
      demos: [{ filename: 'default.demo' }],
      currentFilename: null,
    },
    patch: {
      patch: { blocks: new Map(), edges: [] },
      loadPatch: vi.fn(),
      startPersistence: vi.fn(),
      stopPersistence: vi.fn(),
    },
    diagnostics: {
      log: vi.fn(),
      recordCompilation: vi.fn(),
    },
    events: {
      emit: vi.fn(),
      on: vi.fn(() => vi.fn()),
    },
    getPatchRevision: vi.fn(() => 7),
    playback: {
      isPlaying: false,
      pause: vi.fn(),
    },
  };
}

describe('RuntimeService init probe transitions', () => {
  beforeEach(() => {
    mocks.compileAndSwapMock.mockReset();
    mocks.createWebGPURendererMock.mockReset();
    mocks.createWebGPURendererMock.mockResolvedValue({
      dispose: vi.fn(),
      readSpyScalars: vi.fn(),
    });
    mocks.assertWebGPUStartupContractMock.mockReset();
    mocks.loadPatchFromStorageMock.mockReset();
    mocks.loadPatchFromStorageMock.mockReturnValue(null);
    mocks.savePatchToStorageMock.mockReset();
    mocks.consumeTestDemoFilenameMock.mockReset();
    mocks.consumeTestDemoFilenameMock.mockReturnValue(null);
    mocks.markRuntimeBootstrapStartedMock.mockReset();
    mocks.markRuntimeBootstrapSucceededMock.mockReset();
    mocks.markRuntimeBootstrapFailedMock.mockReset();
    mocks.setRenderIssueReporterMock.mockReset();
    mocks.getRenderIssuesMock.mockReset();
    mocks.getRenderIssuesMock.mockReturnValue([]);
    mocks.clearRenderIssuesMock.mockReset();
    mocks.startAnimationLoopMock.mockClear();
    mocks.createAnimationLoopStateMock.mockClear();
    mocks.debugClearMock.mockReset();
    mocks.setCompilationInspectorErrorReporterMock.mockReset();
    mocks.liveRecompileSetupMock.mockReset();
    mocks.debugOnTrackedSpyScalarSlotsChangeMock.mockReset();
    mocks.debugOnTrackedSpyScalarSlotsChangeMock.mockReturnValue(vi.fn());
    mocks.debugGetTrackedSpyScalarSlotsMock.mockReset();
    mocks.debugGetTrackedSpyScalarSlotsMock.mockReturnValue([]);
    mocks.createDomainChangeDetectorCleanupMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('marks bootstrap success after successful initialization', async () => {
    mocks.compileAndSwapMock.mockResolvedValue(undefined);
    const store = makeStore();
    const runtime = new RuntimeService(store as any);
    runtime.setCanvas({} as HTMLCanvasElement);

    await runtime.init();

    expect(mocks.markRuntimeBootstrapStartedMock).toHaveBeenCalledTimes(1);
    expect(mocks.markRuntimeBootstrapSucceededMock).toHaveBeenCalledTimes(1);
    expect(mocks.markRuntimeBootstrapFailedMock).not.toHaveBeenCalled();
    expect(mocks.startAnimationLoopMock).toHaveBeenCalledTimes(1);
    expect(store.patch.startPersistence).toHaveBeenCalledTimes(1);
    expect(mocks.savePatchToStorageMock).toHaveBeenCalledWith(store.patch.patch, 0);
  });

  it('marks bootstrap failed with a descriptive message when initial compile fails', async () => {
    mocks.compileAndSwapMock.mockRejectedValue(new Error('compile exploded'));
    const store = makeStore();
    const runtime = new RuntimeService(store as any);
    runtime.setCanvas({} as HTMLCanvasElement);

    await runtime.init();

    expect(mocks.markRuntimeBootstrapStartedMock).toHaveBeenCalledTimes(1);
    expect(mocks.markRuntimeBootstrapSucceededMock).not.toHaveBeenCalled();
    expect(mocks.markRuntimeBootstrapFailedMock).toHaveBeenCalledWith(
      'initial_compile_failed: animation loop started but no program is ready',
    );
    expect(mocks.startAnimationLoopMock).toHaveBeenCalledTimes(1);
  });

  it('marks bootstrap failed and rethrows when initialization aborts before startup completes', async () => {
    const store = makeStore();
    const runtime = new RuntimeService(store as any);

    await expect(runtime.init()).rejects.toThrow(
      'RuntimeService: preview canvas is required before initialization',
    );

    expect(mocks.markRuntimeBootstrapStartedMock).toHaveBeenCalledTimes(1);
    expect(mocks.markRuntimeBootstrapSucceededMock).not.toHaveBeenCalled();
    expect(mocks.markRuntimeBootstrapFailedMock).toHaveBeenCalledWith(
      'RuntimeService: preview canvas is required before initialization',
    );
    expect(mocks.startAnimationLoopMock).not.toHaveBeenCalled();
  });
});
