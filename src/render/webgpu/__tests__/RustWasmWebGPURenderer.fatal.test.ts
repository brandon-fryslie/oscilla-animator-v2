import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RustRendererGpuPass, RustRendererWorkerInboundMessage, RustRendererWorkerOutboundMessage } from '../../rust/worker-protocol';
import { clearRenderIssues, getRenderIssues } from '../../render-issues';
import { createWebGPURenderer } from '../RustWasmWebGPURenderer';

type MessageListener = (event: MessageEvent<RustRendererWorkerOutboundMessage>) => void;
type ErrorListener = (event: ErrorEvent) => void;

class FakeWorker {
  static instances: FakeWorker[] = [];

  readonly posted: RustRendererWorkerInboundMessage[] = [];
  private readonly messageListeners = new Set<MessageListener>();
  private readonly errorListeners = new Set<ErrorListener>();

  constructor(_url: URL, _options: WorkerOptions) {
    FakeWorker.instances.push(this);
  }

  postMessage(message: RustRendererWorkerInboundMessage): void {
    this.posted.push(message);
    if (message.type === 'BOOTSTRAP') {
      queueMicrotask(() => {
        this.emitMessage({ type: 'BOOTSTRAP_SUCCESS' });
      });
    }
  }

  terminate(): void {
    return;
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

function expectThrownError(action: () => void): Error {
  try {
    action();
  } catch (error) {
    return error as Error;
  }
  throw new Error('Expected action to throw');
}

describe('RustWasmWebGPURenderer fatal transition', () => {
  let originalNavigatorGpu: PropertyDescriptor | undefined;

  beforeEach(() => {
    clearRenderIssues();
    FakeWorker.instances.length = 0;
    vi.stubGlobal('Worker', FakeWorker as unknown as typeof Worker);
    originalNavigatorGpu = Object.getOwnPropertyDescriptor(globalThis.navigator, 'gpu');
    Object.defineProperty(globalThis.navigator, 'gpu', {
      configurable: true,
      value: {},
    });
  });

  afterEach(() => {
    clearRenderIssues();
    FakeWorker.instances.length = 0;
    if (originalNavigatorGpu) {
      Object.defineProperty(globalThis.navigator, 'gpu', originalNavigatorGpu);
    } else {
      Reflect.deleteProperty(globalThis.navigator, 'gpu');
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps the first fatal record and emits one fatal issue across repeated fatal events', async () => {
    const renderer = await createWebGPURenderer(makeCanvas());
    const worker = FakeWorker.instances[0];
    expect(worker).toBeDefined();
    worker!.emitMessage({ type: 'FATAL_ERROR', code: 'BOOT_FATAL', message: 'first fatal' });
    worker!.emitMessage({ type: 'DEVICE_LOST', code: 'DEVICE_LOST', reason: 'second fatal' });

    const fatalIssues = getRenderIssues().filter((issue) => {
      const detail = issue.detail as { kind?: string } | undefined;
      return detail?.kind === 'rendererFatal';
    });
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
    const passes: readonly RustRendererGpuPass[] = [
      {
        passId: 'test.compute',
        stage: 'compute',
        entryPoint: 'main',
        wgsl: '@compute @workgroup_size(1) fn main() {}',
      },
    ];

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

    let fatalIssues = getRenderIssues().filter((issue) => {
      const detail = issue.detail as { kind?: string } | undefined;
      return detail?.kind === 'rendererFatal';
    });
    expect(fatalIssues).toHaveLength(1);
    const fatalDetail = fatalIssues[0]?.detail as Record<string, unknown>;
    expect(fatalDetail.code).toBe('WORKER_ERROR');
    expect(fatalDetail.stage).toBe('rebuildGpuPipelines(1 passes)');
    expect(typeof fatalDetail.timestamp).toBe('number');
    expect(fatalDetail.cause).toBeInstanceOf(Error);

    worker!.emitMessage({ type: 'FATAL_ERROR', code: 'LATE_FATAL', message: 'late fatal' });
    fatalIssues = getRenderIssues().filter((issue) => {
      const detail = issue.detail as { kind?: string } | undefined;
      return detail?.kind === 'rendererFatal';
    });
    expect(fatalIssues).toHaveLength(1);

    const postFatalError = expectThrownError(() => renderer.setViewportFrame(makeViewportFrame()));
    expect(postFatalError).toBe(rebuildError as Error);
  });
});
