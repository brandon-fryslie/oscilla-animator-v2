import type { RenderShapeBankSource } from './WebGPUShapeBankManager';
import type { IndirectArgsReadbackSnapshot } from './WebGPUIndirectArgsInspector';
import {
  computeRustRendererShapeBankWordCapacity,
  computeRustRendererSinkTableWordCapacity,
  type RustRendererBootstrapConfig,
  type RustRendererSchedulerState,
  type RustRendererWorkerInboundMessage,
  type RustRendererWorkerOutboundMessage,
} from '../rust/worker-protocol';

interface RenderInput {
  readonly shapeBank: RenderShapeBankSource;
  readonly width: number;
  readonly height: number;
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
  readonly timeMs: number;
  readonly inputMouseX?: number;
  readonly inputMouseY?: number;
  readonly inputMouseButtons?: number;
  readonly inputAudioLow?: number;
  readonly inputAudioMid?: number;
  readonly inputAudioHigh?: number;
  readonly inputGaugeActive?: number;
  readonly drawPrepSinkTableV1?: Uint32Array;
  readonly drawPrepSinkTableWordCount: number;
}

const INPUT_SIGNAL_WORDS = 4;
const INPUT_FLOAT_WORDS = 32;
const INPUT_BUFFER_BYTES = (INPUT_SIGNAL_WORDS + INPUT_FLOAT_WORDS) * Float32Array.BYTES_PER_ELEMENT;

const INPUT_INDEX = Object.freeze({
  width: 0,
  height: 1,
  zoom: 2,
  panX: 3,
  panY: 4,
  timeMs: 5,
  mouseX: 6,
  mouseY: 7,
  mouseButtons: 8,
  audioLow: 9,
  audioMid: 10,
  audioHigh: 11,
  gaugeActive: 12,
  sinkTableWords: 13,
  shapeBankWords: 14,
} as const);

const DEFAULT_BOOTSTRAP_CONFIG: RustRendererBootstrapConfig = Object.freeze({
  maxParticles: 65_536,
  maxShapes: 65_536,
  debugReadbackHz: 5,
});

function coerceFinite(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

const MAX_UINT32 = 0xFFFF_FFFF;

function assertFiniteUint32(value: number, context: string): number {
  if (
    !Number.isFinite(value)
    || !Number.isInteger(value)
    || !Number.isSafeInteger(value)
    || value < 0
    || value > MAX_UINT32
  ) {
    throw new Error(`Rust renderer input contract violation: ${context} must be a uint32, got ${String(value)}`);
  }
  return value;
}


export function assertWebGPUStartupContract(canvas: HTMLCanvasElement): void {
  const gpu = (navigator as Navigator & { gpu?: unknown }).gpu;
  if (!gpu) {
    throw new Error('Rust renderer requires WebGPU (navigator.gpu is unavailable)');
  }
  if (typeof canvas.transferControlToOffscreen !== 'function') {
    throw new Error('Rust renderer requires OffscreenCanvas transfer support');
  }
  if (typeof Worker === 'undefined') {
    throw new Error('Rust renderer requires Dedicated Worker support');
  }
  if (typeof SharedArrayBuffer === 'undefined') {
    const isolated = typeof crossOriginIsolated === 'boolean' ? crossOriginIsolated : null;
    const secure = typeof isSecureContext === 'boolean' ? isSecureContext : null;
    const origin =
      typeof location !== 'undefined' ? `${location.protocol}//${location.host}` : 'unknown';
    throw new Error(
      `Rust renderer requires SharedArrayBuffer support ` +
        `(crossOriginIsolated=${String(isolated)}, isSecureContext=${String(secure)}, origin=${origin}). ` +
        `Serve with COOP/COEP headers and open via localhost or HTTPS.`,
    );
  }
}

/**
 * Worker-backed renderer facade.
 *
 * [LAW:one-way-deps] Main-thread runtime depends only on this facade; all GPU
 * execution ownership is pushed down into the worker + Rust WASM boundary.
 */
export class WebGPURenderer {
  private readonly worker: Worker;
  private readonly signalWords: Int32Array;
  private readonly inputWords: Float32Array;
  private readonly sharedShapeBankWords: Uint32Array;
  private readonly sharedSinkTableWords: Uint32Array;
  private bootstrapped = false;
  private disposed = false;
  private fatalError: Error | null = null;
  private lastResizeWidth = -1;
  private lastResizeHeight = -1;
  private latestTelemetry: { meanMs: number; stdDevMs: number; sampleCount: number; frameCount: number } | null = null;
  private lifecycleState: RustRendererSchedulerState = 'Booting';

  private constructor(
    worker: Worker,
    signalWords: Int32Array,
    inputWords: Float32Array,
    sharedShapeBankWords: Uint32Array,
    sharedSinkTableWords: Uint32Array,
  ) {
    this.worker = worker;
    this.signalWords = signalWords;
    this.inputWords = inputWords;
    this.sharedShapeBankWords = sharedShapeBankWords;
    this.sharedSinkTableWords = sharedSinkTableWords;
    this.worker.addEventListener('message', this.handleRuntimeMessage);
  }

  static async create(canvas: HTMLCanvasElement): Promise<WebGPURenderer> {
    assertWebGPUStartupContract(canvas);
    const offscreenCanvas = canvas.transferControlToOffscreen();
    const sharedInput = new SharedArrayBuffer(INPUT_BUFFER_BYTES);
    const signalWords = new Int32Array(sharedInput, 0, INPUT_SIGNAL_WORDS);
    const inputWords = new Float32Array(
      sharedInput,
      INPUT_SIGNAL_WORDS * Int32Array.BYTES_PER_ELEMENT,
      INPUT_FLOAT_WORDS,
    );
    const shapeBankWordCapacity = computeRustRendererShapeBankWordCapacity(DEFAULT_BOOTSTRAP_CONFIG);
    const sinkTableWordCapacity = computeRustRendererSinkTableWordCapacity(DEFAULT_BOOTSTRAP_CONFIG);
    const sharedShapeBank = new SharedArrayBuffer(shapeBankWordCapacity * Uint32Array.BYTES_PER_ELEMENT);
    const sharedSinkTable = new SharedArrayBuffer(sinkTableWordCapacity * Uint32Array.BYTES_PER_ELEMENT);
    const sharedShapeBankWords = new Uint32Array(sharedShapeBank);
    const sharedSinkTableWords = new Uint32Array(sharedSinkTable);

    const worker = new Worker(new URL('../rust/engine.worker.ts', import.meta.url), {
      type: 'module',
    });
    const renderer = new WebGPURenderer(
      worker,
      signalWords,
      inputWords,
      sharedShapeBankWords,
      sharedSinkTableWords,
    );
    await renderer.bootstrap(
      offscreenCanvas,
      sharedInput,
      sharedShapeBank,
      sharedSinkTable,
      DEFAULT_BOOTSTRAP_CONFIG,
    );
    return renderer;
  }

  render(input: RenderInput): void {
    if (this.fatalError) {
      throw this.fatalError;
    }
    if (this.disposed) {
      throw new Error('Rust renderer has been disposed');
    }
    if (!this.bootstrapped) {
      throw new Error('Rust renderer worker is not bootstrapped');
    }
    this.syncCanvasSize(input.width, input.height);

    // [LAW:dataflow-not-control-flow] Renderer updates one canonical shared
    // input buffer each frame. The worker hot path always executes and reads
    // from this buffer in fixed stage order.
    this.inputWords[INPUT_INDEX.width] = input.width;
    this.inputWords[INPUT_INDEX.height] = input.height;
    this.inputWords[INPUT_INDEX.zoom] = input.zoom;
    this.inputWords[INPUT_INDEX.panX] = input.panX;
    this.inputWords[INPUT_INDEX.panY] = input.panY;
    this.inputWords[INPUT_INDEX.timeMs] = input.timeMs;
    this.inputWords[INPUT_INDEX.mouseX] = coerceFinite(input.inputMouseX);
    this.inputWords[INPUT_INDEX.mouseY] = coerceFinite(input.inputMouseY);
    this.inputWords[INPUT_INDEX.mouseButtons] = coerceFinite(input.inputMouseButtons);
    this.inputWords[INPUT_INDEX.audioLow] = coerceFinite(input.inputAudioLow);
    this.inputWords[INPUT_INDEX.audioMid] = coerceFinite(input.inputAudioMid);
    this.inputWords[INPUT_INDEX.audioHigh] = coerceFinite(input.inputAudioHigh);
    this.inputWords[INPUT_INDEX.gaugeActive] = coerceFinite(input.inputGaugeActive);
    const shapeBankWords = this.syncShapeBankPlane(input.shapeBank);
    const sinkTableWords = this.syncSinkTablePlane(
      input.drawPrepSinkTableV1,
      input.drawPrepSinkTableWordCount,
    );
    this.inputWords[INPUT_INDEX.sinkTableWords] = sinkTableWords;
    this.inputWords[INPUT_INDEX.shapeBankWords] = shapeBankWords;
    Atomics.add(this.signalWords, 0, 1);
  }

  async readIndirectArgsDebugView(maxRecords: number = 0): Promise<IndirectArgsReadbackSnapshot> {
    return {
      capturedAtMs: performance.now(),
      recordCount: Math.max(0, Math.floor(maxRecords)),
      records: [],
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.worker.removeEventListener('message', this.handleRuntimeMessage);
    const message: RustRendererWorkerInboundMessage = { type: 'SHUTDOWN' };
    this.worker.postMessage(message);
    this.worker.terminate();
  }

  async rebuildSimulationPipeline(
    simulationWgsl: string,
  ): Promise<void> {
    if (this.fatalError) {
      throw this.fatalError;
    }
    if (!this.bootstrapped) {
      throw new Error('Rust renderer worker is not bootstrapped');
    }
    this.worker.postMessage({ type: 'PAUSE' } satisfies RustRendererWorkerInboundMessage);
    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const settle = (callback: () => void): void => {
          if (settled) return;
          settled = true;
          this.worker.removeEventListener('message', onMessage);
          callback();
        };
        const onMessage = (event: MessageEvent<RustRendererWorkerOutboundMessage>): void => {
          const payload = event.data;
          if (!payload) return;
          if (payload.type === 'REBUILD_SIMULATION_PIPELINE_SUCCESS') {
            settle(resolve);
            return;
          }
          if (payload.type === 'FATAL_ERROR') {
            settle(() => reject(new Error(`[${payload.code}] ${payload.message}`)));
          }
        };
        this.worker.addEventListener('message', onMessage);
        const message: RustRendererWorkerInboundMessage = {
          type: 'REBUILD_SIMULATION_PIPELINE',
          simulationWgsl,
        };
        this.worker.postMessage(message);
      });
    } finally {
      this.worker.postMessage({ type: 'RESUME' } satisfies RustRendererWorkerInboundMessage);
    }
  }

  getLatestRuntimeTelemetry(): { meanMs: number; stdDevMs: number; sampleCount: number; frameCount: number } | null {
    return this.latestTelemetry;
  }

  getLifecycleState(): RustRendererSchedulerState {
    return this.lifecycleState;
  }

  private syncShapeBankPlane(shapeBank: RenderShapeBankSource): number {
    const wordCount = assertFiniteUint32(shapeBank.volatilePtr, 'shapeBank.volatilePtr');
    if (wordCount > this.sharedShapeBankWords.length) {
      throw new Error(
        'Rust renderer input contract violation: shapeBank capacity exceeded ' +
          `(wordCount=${wordCount}, sharedCapacity=${this.sharedShapeBankWords.length})`,
      );
    }
    if (shapeBank.data.length < wordCount) {
      throw new Error(
        'Rust renderer input contract violation: shapeBank.data shorter than volatilePtr ' +
          `(dataLength=${shapeBank.data.length}, volatilePtr=${wordCount})`,
      );
    }
    if (wordCount > 0) {
      this.sharedShapeBankWords.set(shapeBank.data.subarray(0, wordCount), 0);
    }
    return wordCount;
  }

  private syncSinkTablePlane(sinkTableWords: Uint32Array | undefined, sinkTableWordCount: number): number {
    const wordCount = assertFiniteUint32(sinkTableWordCount, 'drawPrepSinkTableWordCount');
    if (wordCount === 0) {
      return 0;
    }
    if (!sinkTableWords) {
      throw new Error(
        'Rust renderer input contract violation: drawPrepSinkTableV1 is required when drawPrepSinkTableWordCount > 0',
      );
    }
    if (sinkTableWords.length < wordCount) {
      throw new Error(
        'Rust renderer input contract violation: drawPrepSinkTableV1 shorter than wordCount ' +
          `(tableLength=${sinkTableWords.length}, wordCount=${wordCount})`,
      );
    }
    if (wordCount > this.sharedSinkTableWords.length) {
      throw new Error(
        'Rust renderer input contract violation: sink table capacity exceeded ' +
          `(wordCount=${wordCount}, sharedCapacity=${this.sharedSinkTableWords.length})`,
      );
    }
    this.sharedSinkTableWords.set(sinkTableWords.subarray(0, wordCount), 0);
    return wordCount;
  }

  private async bootstrap(
    offscreenCanvas: OffscreenCanvas,
    sharedInput: SharedArrayBuffer,
    sharedShapeBank: SharedArrayBuffer,
    sharedSinkTable: SharedArrayBuffer,
    config: RustRendererBootstrapConfig,
  ): Promise<void> {
    const message: RustRendererWorkerInboundMessage = {
      type: 'BOOTSTRAP',
      canvas: offscreenCanvas,
      sharedInput,
      sharedShapeBank,
      sharedSinkTable,
      config,
    };

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        this.worker.removeEventListener('message', onMessage);
        this.worker.removeEventListener('error', onError);
        callback();
      };

      const onMessage = (event: MessageEvent<RustRendererWorkerOutboundMessage>): void => {
        const payload = event.data;
        if (!payload) return;
        if (payload.type === 'BOOTSTRAP_SUCCESS') {
          settle(() => {
            this.bootstrapped = true;
            resolve();
          });
          return;
        }
        if (payload.type === 'FATAL_ERROR') {
          settle(() => {
            this.fatalError = new Error(`[${payload.code}] ${payload.message}`);
            reject(this.fatalError);
          });
        }
      };

      const onError = (event: ErrorEvent): void => {
        settle(() => {
          this.fatalError = new Error(event.message || 'Rust renderer worker crashed');
          reject(this.fatalError);
        });
      };

      this.worker.addEventListener('message', onMessage);
      this.worker.addEventListener('error', onError);
      this.worker.postMessage(message, [offscreenCanvas]);
    });
  }

  private syncCanvasSize(width: number, height: number): void {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    if (safeWidth === this.lastResizeWidth && safeHeight === this.lastResizeHeight) {
      return;
    }
    this.lastResizeWidth = safeWidth;
    this.lastResizeHeight = safeHeight;
    const message: RustRendererWorkerInboundMessage = {
      type: 'RESIZE_CANVAS',
      width: safeWidth,
      height: safeHeight,
    };
    this.worker.postMessage(message);
  }

  private readonly handleRuntimeMessage = (event: MessageEvent<RustRendererWorkerOutboundMessage>): void => {
    const payload = event.data;
    if (!payload) return;
    if (payload.type === 'FATAL_ERROR') {
      this.fatalError = new Error(`[${payload.code}] ${payload.message}`);
      return;
    }
    if (payload.type === 'DEVICE_LOST') {
      this.lifecycleState = 'Lost';
      this.fatalError = new Error(`[${payload.code}] ${payload.reason}`);
      return;
    }
    if (payload.type === 'RUNTIME_EVENT') {
      if (payload.severity === 'fatal') {
        this.fatalError = new Error(`[${payload.code}] ${payload.message}`);
      }
      return;
    }
    if (payload.type === 'SCHEDULER_HEARTBEAT') {
      // [LAW:one-source-of-truth] Renderer mirrors scheduler state from
      // heartbeat packets instead of deriving lifecycle state client-side.
      this.lifecycleState = payload.state;
      this.latestTelemetry = {
        meanMs: payload.meanTickMs,
        stdDevMs: payload.stdDevTickMs,
        sampleCount: payload.sampleCount,
        frameCount: payload.frameCount,
      };
    }
  };
}

export async function createWebGPURenderer(canvas: HTMLCanvasElement): Promise<WebGPURenderer> {
  // [LAW:no-silent-fallbacks] WebGPU renderer creation is hard-fail only.
  // No legacy renderer path is allowed once worker+Rust cutover is selected.
  return WebGPURenderer.create(canvas);
}
