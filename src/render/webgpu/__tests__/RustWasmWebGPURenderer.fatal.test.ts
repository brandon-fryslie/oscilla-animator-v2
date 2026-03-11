import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RustRendererGpuPass, RustRendererWorkerInboundMessage, RustRendererWorkerOutboundMessage } from '../../rust/worker-protocol';
import { clearRenderIssues, getRenderIssues } from '../../render-issues';
import { createWebGPURenderer } from '../RustWasmWebGPURenderer';

type MessageListener = (event: MessageEvent<RustRendererWorkerOutboundMessage>) => void;
type ErrorListener = (event: ErrorEvent) => void;

class FakeWorker {
  static instances: FakeWorker[] = [];

  readonly posted: RustRendererWorkerInboundMessage[] = [];
  terminateCount = 0;
  private terminated = false;
  private readonly messageListeners = new Set<MessageListener>();
  private readonly errorListeners = new Set<ErrorListener>();

  constructor(_url: URL, _options: WorkerOptions) {
    FakeWorker.instances.push(this);
  }

  postMessage(message: RustRendererWorkerInboundMessage): void {
    if (this.terminated) {
      throw new Error('InvalidStateError: Worker is terminated');
    }
    this.posted.push(message);
    if (message.type === 'BOOTSTRAP') {
      queueMicrotask(() => {
        this.emitMessage({ type: 'BOOTSTRAP_SUCCESS' });
      });
    }
  }

  terminate(): void {
    if (this.terminated) {
      throw new Error('InvalidStateError: Worker is already terminated');
    }
    this.terminated = true;
    this.terminateCount += 1;
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'message') {
      this.messageListeners.add(listener as MessageListener);
      return;
    }
    if (type === 'error') {
      this.errorListeners.add(listener as ErrorListener);
    }
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'message') {
      this.messageListeners.delete(listener as MessageListener);
      return;
    }
    if (type === 'error') {
      this.errorListeners.delete(listener as ErrorListener);
    }
  }

  emitMessage(payload: RustRendererWorkerOutboundMessage): void {
    const event = { data: payload } as MessageEvent<RustRendererWorkerOutboundMessage>;
    for (const listener of this.messageListeners) {
      listener(event);
    }
  }

  emitError(message: string): void {
    const event = { message } as ErrorEvent;
    for (const listener of this.errorListeners) {
      listener(event);
    }
  }
}

function makeCanvas(): HTMLCanvasElement {
  return {
    transferControlToOffscreen: () => ({}) as OffscreenCanvas,
  } as unknown as HTMLCanvasElement;
}

function makeViewportFrame() {
  return {
    width: 640,
    height: 360,
    zoom: 1,
    panX: 0,
    panY: 0,
    timeMs: 0,
    inputMouseX: 0,
    inputMouseY: 0,
    inputMouseButtons: 0,
    inputAudioLow: 0,
    inputAudioMid: 0,
    inputAudioHigh: 0,
    inputGaugeActive: 0,
  };
}

function makeComputePass(passId: string = 'test.compute'): RustRendererGpuPass {
  return {
    passId,
    stage: 'compute',
    entryPoint: 'main',
    wgsl: '@compute @workgroup_size(1) fn main() {}',
  };
}

function expectThrownError(action: () => void): Error {
  try {
    action();
  } catch (error) {
    return error as Error;
  }
  throw new Error('Expected action to throw');
}

function getRendererFatalIssues() {
  return getRenderIssues().filter((issue) => {
    const detail = issue.detail as { kind?: string } | undefined;
    return detail?.kind === 'rendererFatal';
  });
}

function getEngineErrorIssues() {
  return getRenderIssues().filter((issue) => {
    const detail = issue.detail as { kind?: string } | undefined;
    return detail?.kind === 'engineError';
  });
}

function makeSchedulerHeartbeat(state: 'Booting' | 'Running' | 'Paused' | 'Lost'): RustRendererWorkerOutboundMessage {
  return {
    type: 'SCHEDULER_HEARTBEAT',
    state,
    sequence: 1,
    emittedAtMs: 1,
    frameCount: 1,
    loopCount: 1,
    meanTickMs: 0,
    stdDevTickMs: 0,
    sampleCount: 1,
    lastTickMs: 0,
    lastSuccessMs: 0,
    telemetry: {
      stageTimings: {
        inputMarshalMs: 0,
        simulationDispatchMs: 0,
        fluidPassChainMs: 0,
        drawPrepMs: 0,
        renderMs: 0,
        swapMs: 0,
        totalFrameMs: 0,
      },
      dispatchCounters: {
        computeDispatchCount: 0,
        computeWorkgroupCount: 0,
        activeLaneCount: 0,
        guardedLaneCount: 0,
      },
      resourceStats: {
        shapeBankWordCount: 0,
        sinkTableWordCount: 0,
        indexedRecordCount: 0,
        nonIndexedRecordCount: 0,
        totalInstanceCount: 0,
        canvasWidth: 0,
        canvasHeight: 0,
        pingPongIndex: 0,
      },
    },
  };
}

function installRendererSuiteHooks(state: { originalNavigatorGpu: PropertyDescriptor | undefined }): void {
  beforeEach(() => {
    clearRenderIssues();
    FakeWorker.instances.length = 0;
    vi.stubGlobal('Worker', FakeWorker as unknown as typeof Worker);
    state.originalNavigatorGpu = Object.getOwnPropertyDescriptor(globalThis.navigator, 'gpu');
    Object.defineProperty(globalThis.navigator, 'gpu', {
      configurable: true,
      value: {},
    });
  });

  afterEach(() => {
    clearRenderIssues();
    FakeWorker.instances.length = 0;
    if (state.originalNavigatorGpu) {
      Object.defineProperty(globalThis.navigator, 'gpu', state.originalNavigatorGpu);
    } else {
      Reflect.deleteProperty(globalThis.navigator, 'gpu');
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
}

describe('RustWasmWebGPURenderer fatal transition', () => {
  const suiteState: { originalNavigatorGpu: PropertyDescriptor | undefined } = { originalNavigatorGpu: undefined };
  installRendererSuiteHooks(suiteState);

  it('keeps the first fatal record and emits one fatal issue across repeated fatal events', async () => {
    const renderer = await createWebGPURenderer(makeCanvas());
    const worker = FakeWorker.instances[0];
    expect(worker).toBeDefined();
    worker!.emitMessage({ type: 'FATAL_ERROR', code: 'BOOT_FATAL', message: 'first fatal' });
    worker!.emitMessage({ type: 'DEVICE_LOST', code: 'DEVICE_LOST', reason: 'second fatal' });

    const engineIssues = getEngineErrorIssues();
    expect(engineIssues).toHaveLength(2);
    const engineSources = engineIssues.map((issue) => {
      const detail = issue.detail as { source?: string } | undefined;
      return detail?.source;
    });
    expect(engineSources).toEqual(['BOOT_FATAL', 'DEVICE_LOST']);

    const fatalIssues = getRendererFatalIssues();
    expect(fatalIssues).toHaveLength(1);
    const detail = fatalIssues[0]?.detail as Record<string, unknown>;
    expect(detail.code).toBe('BOOT_FATAL');
    expect(detail.stage).toBe('WORKER');
    expect(detail.message).toBe('first fatal');
    expect(typeof detail.timestamp).toBe('number');
    expect(detail.cause).toBeInstanceOf(Error);
    expect(renderer.getLifecycleState()).toBe('Lost');

    const firstThrow = expectThrownError(() => renderer.setViewportFrame(makeViewportFrame()));
    const secondThrow = expectThrownError(() => renderer.setViewportFrame(makeViewportFrame()));
    expect(firstThrow).toBe(secondThrow);
    expect(firstThrow.message).toBe('[BOOT_FATAL] first fatal');
  });

  it('routes worker ack error through the fatal boundary once and keeps deterministic post-fatal errors', async () => {
    const renderer = await createWebGPURenderer(makeCanvas());
    const worker = FakeWorker.instances[0];
    expect(worker).toBeDefined();
    const passes: readonly RustRendererGpuPass[] = [makeComputePass()];

    const rebuildPromise = renderer.rebuildGpuPipelines(passes);
    worker!.emitError('worker crashed');
    let rebuildError: Error | null = null;
    try {
      await rebuildPromise;
    } catch (error) {
      rebuildError = error as Error;
    }
    expect(rebuildError).toBeInstanceOf(Error);
    expect(rebuildError?.message).toContain('worker crashed');

    let fatalIssues = getRendererFatalIssues();
    expect(fatalIssues).toHaveLength(1);
    const fatalDetail = fatalIssues[0]?.detail as Record<string, unknown>;
    expect(fatalDetail.code).toBe('WORKER_ERROR');
    expect(fatalDetail.stage).toBe('rebuildGpuPipelines(1 passes)');
    expect(typeof fatalDetail.timestamp).toBe('number');
    expect(fatalDetail.cause).toBeInstanceOf(Error);

    worker!.emitMessage({ type: 'FATAL_ERROR', code: 'LATE_FATAL', message: 'late fatal' });
    fatalIssues = getRendererFatalIssues();
    expect(fatalIssues).toHaveLength(1);

    const postFatalError = expectThrownError(() => renderer.setViewportFrame(makeViewportFrame()));
    expect(postFatalError).toBe(rebuildError as Error);
  });
});

describe('RustWasmWebGPURenderer fatal transition ack timeout path', () => {
  const suiteState: { originalNavigatorGpu: PropertyDescriptor | undefined } = { originalNavigatorGpu: undefined };
  installRendererSuiteHooks(suiteState);

  it('routes worker ack timeout through the fatal boundary once and keeps deterministic post-fatal errors', async () => {
    vi.useFakeTimers();
    try {
      const renderer = await createWebGPURenderer(makeCanvas());
      const passes: readonly RustRendererGpuPass[] = [makeComputePass('timeout.compute')];
      let rebuildError: Error | null = null;
      const rebuildPromise = renderer.rebuildGpuPipelines(passes).catch((error) => {
        rebuildError = error as Error;
      });

      await vi.runOnlyPendingTimersAsync();
      await rebuildPromise;

      expect(rebuildError).toBeInstanceOf(Error);
      const timeoutError = rebuildError ?? new Error('Expected rebuildGpuPipelines timeout error');
      expect(timeoutError.message).toContain('timed out');

      const fatalIssues = getRendererFatalIssues();
      expect(fatalIssues).toHaveLength(1);
      const fatalDetail = fatalIssues[0]?.detail as Record<string, unknown>;
      expect(fatalDetail.code).toBe('WORKER_ACK_TIMEOUT');
      expect(fatalDetail.stage).toBe('rebuildGpuPipelines(1 passes)');

      const postFatalError = expectThrownError(() => renderer.setViewportFrame(makeViewportFrame()));
      expect(postFatalError).toBe(timeoutError);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('RustWasmWebGPURenderer fatal transition ack message classification', () => {
  const suiteState: { originalNavigatorGpu: PropertyDescriptor | undefined } = { originalNavigatorGpu: undefined };
  installRendererSuiteHooks(suiteState);

  it('routes classified fatal ack message failures through the fatal boundary once', async () => {
    const renderer = await createWebGPURenderer(makeCanvas());
    const worker = FakeWorker.instances[0];
    expect(worker).toBeDefined();

    const passes: readonly RustRendererGpuPass[] = [makeComputePass('fatal-message.compute')];
    const rebuildPromise = renderer.rebuildGpuPipelines(passes);
    worker!.emitMessage({ type: 'FATAL_ERROR', code: 'ACK_FATAL', message: 'ack failed' });

    let rebuildError: Error | null = null;
    try {
      await rebuildPromise;
    } catch (error) {
      rebuildError = error as Error;
    }

    expect(rebuildError).toBeInstanceOf(Error);
    expect(rebuildError?.message).toContain('ack failed');

    const fatalIssues = getRendererFatalIssues();
    expect(fatalIssues).toHaveLength(1);
    const fatalDetail = fatalIssues[0]?.detail as Record<string, unknown>;
    expect(fatalDetail.code).toBe('ACK_FATAL');
    expect(fatalDetail.stage).toBe('WORKER');
  });

  it('keeps classified non-fatal ack message failures non-fatal', async () => {
    const renderer = await createWebGPURenderer(makeCanvas());
    const worker = FakeWorker.instances[0];
    expect(worker).toBeDefined();

    const passes: readonly RustRendererGpuPass[] = [makeComputePass('nonfatal-message.compute')];
    const rebuildPromise = renderer.rebuildGpuPipelines(passes);
    worker!.emitMessage({
      type: 'ENGINE_ERROR',
      source: 'WEBGPU_VALIDATION',
      message: 'recoverable ack failure',
      location: 'ACK',
      fatal: false,
    });

    let rebuildError: Error | null = null;
    try {
      await rebuildPromise;
    } catch (error) {
      rebuildError = error as Error;
    }

    expect(rebuildError).toBeInstanceOf(Error);
    expect(rebuildError?.message).toContain('WEBGPU_VALIDATION');
    expect(getRendererFatalIssues()).toHaveLength(0);
    expect(getEngineErrorIssues()).toHaveLength(1);
  });
});

describe('RustWasmWebGPURenderer fatal transition guardrails', () => {
  const suiteState: { originalNavigatorGpu: PropertyDescriptor | undefined } = { originalNavigatorGpu: undefined };
  installRendererSuiteHooks(suiteState);

  it('keeps lifecycle Lost even if heartbeat messages arrive after fatal', async () => {
    const renderer = await createWebGPURenderer(makeCanvas());
    const worker = FakeWorker.instances[0];
    expect(worker).toBeDefined();

    worker!.emitMessage({ type: 'FATAL_ERROR', code: 'BOOT_FATAL', message: 'first fatal' });
    expect(renderer.getLifecycleState()).toBe('Lost');
    worker!.emitMessage(makeSchedulerHeartbeat('Running'));

    expect(renderer.getLifecycleState()).toBe('Lost');
  });

  it('emits engineError for fatal ENGINE_ERROR and still applies terminate policy on repeated fatal transition', async () => {
    const renderer = await createWebGPURenderer(makeCanvas());
    const worker = FakeWorker.instances[0];
    expect(worker).toBeDefined();

    worker!.emitMessage({
      type: 'ENGINE_ERROR',
      source: 'WEBGPU_VALIDATION',
      message: 'fatal validation issue',
      location: 'WORKER',
      fatal: true,
    });

    expect(getEngineErrorIssues()).toHaveLength(1);
    expect(getRendererFatalIssues()).toHaveLength(1);

    const rendererAny = renderer as unknown as {
      markRendererFatal: (transition: {
        code: string;
        stage: string;
        message: string;
        timestamp: number;
        cause: Error;
        terminationPolicy: 'keep-worker-alive' | 'terminate-worker';
      }) => Error;
    };
    rendererAny.markRendererFatal({
      code: 'ACK_TIMEOUT',
      stage: 'rebuildGpuPipelines(1 passes)',
      message: 'late timeout after fatal',
      timestamp: 2,
      cause: new Error('late timeout after fatal'),
      terminationPolicy: 'terminate-worker',
    });

    expect(worker!.terminateCount).toBe(1);
  });

  it('dispose remains non-throwing when worker was already terminated by a fatal transition', async () => {
    const renderer = await createWebGPURenderer(makeCanvas());
    const worker = FakeWorker.instances[0];
    expect(worker).toBeDefined();

    const rendererAny = renderer as unknown as {
      markRendererFatal: (transition: {
        code: string;
        stage: string;
        message: string;
        timestamp: number;
        cause: Error;
        terminationPolicy: 'keep-worker-alive' | 'terminate-worker';
      }) => Error;
    };
    rendererAny.markRendererFatal({
      code: 'ACK_TIMEOUT',
      stage: 'rebuildGpuPipelines(1 passes)',
      message: 'worker already terminated',
      timestamp: 3,
      cause: new Error('worker already terminated'),
      terminationPolicy: 'terminate-worker',
    });
    expect(worker!.terminateCount).toBe(1);

    expect(() => renderer.dispose()).not.toThrow();
    expect(() => renderer.dispose()).not.toThrow();
    expect(worker!.terminateCount).toBe(1);
  });
});
