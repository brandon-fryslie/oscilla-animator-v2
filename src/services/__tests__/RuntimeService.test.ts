import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const compileWorkerCompile = vi.fn();
  const compileWorkerDispose = vi.fn();
  const compileAndSwap = vi.fn(async () => {});
  const createWebGPURenderer = vi.fn(async () => ({
    dispose: vi.fn(),
    render: vi.fn(),
  }));
  const assertWebGPUStartupContract = vi.fn();
  const setRenderIssueReporter = vi.fn();
  const getRenderIssues = vi.fn(() => []);
  const clearRenderIssues = vi.fn();
  const savePatchToStorage = vi.fn();
  const loadPatchFromStorage = vi.fn(() => null);
  const consumeTestDemoFilename = vi.fn(() => null);
  const startAnimationLoop = vi.fn(() => ({
    stop: vi.fn(),
    onCompileSuccess: vi.fn(() => false),
  }));
  const createAnimationLoopState = vi.fn(() => ({}));
  const createDomainChangeDetector = vi.fn(() => ({
    detectAndLogDomainChanges: vi.fn(),
    cleanup: vi.fn(),
  }));
  const createLiveRecompileController = vi.fn(() => ({
    setup: vi.fn(),
    cleanup: vi.fn(),
  }));
  const patchProgramConstants = vi.fn(() => null);
  const debugServiceClear = vi.fn();
  const setErrorReporter = vi.fn();

  return {
    compileWorkerCompile,
    compileWorkerDispose,
    compileAndSwap,
    createWebGPURenderer,
    assertWebGPUStartupContract,
    setRenderIssueReporter,
    getRenderIssues,
    clearRenderIssues,
    savePatchToStorage,
    loadPatchFromStorage,
    consumeTestDemoFilename,
    startAnimationLoop,
    createAnimationLoopState,
    createDomainChangeDetector,
    createLiveRecompileController,
    patchProgramConstants,
    debugServiceClear,
    setErrorReporter,
  };
});

vi.mock('../../render', () => ({
  assertWebGPUStartupContract: mocks.assertWebGPUStartupContract,
  createWebGPURenderer: mocks.createWebGPURenderer,
  setRenderIssueReporter: mocks.setRenderIssueReporter,
  getRenderIssues: mocks.getRenderIssues,
  clearRenderIssues: mocks.clearRenderIssues,
  RenderBufferArena: class {
    init(): void {}
    reset(): void {}
    getTotalBytes(): number { return 0; }
  },
}));

vi.mock('../CompileOrchestrator', () => ({
  compileAndSwap: mocks.compileAndSwap,
}));

vi.mock('../CompileWorkerClient', () => ({
  CompileWorkerClient: class {
    compile = mocks.compileWorkerCompile;
    dispose = mocks.compileWorkerDispose;
  },
  CompileSupersededError: class extends Error {},
}));

vi.mock('../PatchPersistence', () => ({
  loadPatchFromStorage: mocks.loadPatchFromStorage,
  savePatchToStorage: mocks.savePatchToStorage,
}));

vi.mock('../../testing/test-params', () => ({
  consumeTestDemoFilename: mocks.consumeTestDemoFilename,
}));

vi.mock('../DomainChangeDetector', () => ({
  createDomainChangeDetector: mocks.createDomainChangeDetector,
}));

vi.mock('../LiveRecompile', () => ({
  createLiveRecompileController: mocks.createLiveRecompileController,
}));

vi.mock('../ConstantPatcher', () => ({
  patchProgramConstants: mocks.patchProgramConstants,
}));

vi.mock('../DebugService', () => ({
  debugService: {
    clear: mocks.debugServiceClear,
  },
}));

vi.mock('../CompilationInspectorService', () => ({
  compilationInspector: {
    setErrorReporter: mocks.setErrorReporter,
  },
}));

vi.mock('../AnimationLoop', () => ({
  startAnimationLoop: mocks.startAnimationLoop,
  createAnimationLoopState: mocks.createAnimationLoopState,
}));

import { RuntimeService } from '../RuntimeService';

function makeStore() {
  const patch = { blocks: new Map(), edges: [] } as any;
  const diagnosticsLog = vi.fn();
  return {
    store: {
      diagnostics: {
        log: diagnosticsLog,
        recordCompilation: vi.fn(),
      },
      events: {
        emit: vi.fn(),
        on: vi.fn(() => () => {}),
      },
      settings: {
        register: vi.fn(),
        get: vi.fn(() => undefined),
      },
      demo: {
        selectDemo: vi.fn(() => false),
        loadDefault: vi.fn(),
        currentFilename: null,
        demos: [],
      },
      patch: {
        patch,
        loadPatch: vi.fn(),
        startPersistence: vi.fn(),
        stopPersistence: vi.fn(),
      },
      frontend: {
        updateFromFrontendResult: vi.fn(),
      },
      getPatchRevision: vi.fn(() => 7),
      playback: {
        isPlaying: false,
        pause: vi.fn(),
      },
    } as any,
    diagnosticsLog,
  };
}

describe('RuntimeService startup compile path', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  it('uses async worker compile and precomputed initial swap during init', async () => {
    mocks.compileWorkerCompile.mockResolvedValue({
      sourcePatchRevision: 7,
      frontendResult: {} as any,
      backendResult: null,
      compileDurationMs: 3,
    });

    const { store } = makeStore();
    const runtime = new RuntimeService(store);
    runtime.setCanvas(document.createElement('canvas'));

    const initPromise = runtime.init();
    await vi.advanceTimersByTimeAsync(60);
    await initPromise;

    expect(mocks.compileWorkerCompile).toHaveBeenCalledTimes(1);
    const compileRequest = mocks.compileWorkerCompile.mock.calls[0]?.[0] as {
      patchRevision: number;
    };
    expect(compileRequest.patchRevision).toBe(7);

    expect(mocks.compileAndSwap).toHaveBeenCalledTimes(1);
    const compileAndSwapCalls = mocks.compileAndSwap.mock.calls as unknown[][];
    const compileAndSwapCall = compileAndSwapCalls[0];
    expect(compileAndSwapCall).toBeDefined();
    const isInitial = compileAndSwapCall?.[1];
    const precomputed = compileAndSwapCall?.[2] as {
      sourcePatchRevision: number;
      compileDurationMs: number;
    } | undefined;
    expect(isInitial).toBe(true);
    expect(precomputed).toMatchObject({
      sourcePatchRevision: 7,
      compileDurationMs: 3,
    });
  });

  it('does not fall back to synchronous initial compile when worker compile fails', async () => {
    mocks.compileWorkerCompile.mockRejectedValue(new Error('worker unavailable'));

    const { store, diagnosticsLog } = makeStore();
    const runtime = new RuntimeService(store);
    runtime.setCanvas(document.createElement('canvas'));

    const initPromise = runtime.init();
    await vi.advanceTimersByTimeAsync(60);
    await initPromise;

    expect(mocks.compileAndSwap).not.toHaveBeenCalled();
    expect(diagnosticsLog).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        message: expect.stringContaining('Async compile'),
      }),
    );
  });
});
