import type { RenderShapeBankSource } from './WebGPUShapeBankManager';
import type { IndirectArgsReadbackSnapshot } from './WebGPUIndirectArgsInspector';
import { isRuntimeConsoleEnabled } from '../../testing/test-params';
import {
  computeRustRendererShapeBankWordCapacity,
  computeRustRendererSinkTableWordCapacity,
  type RustRendererBootstrapConfig,
  type RustRendererGpuPass,
  type RustRendererSchedulerState,
  type RustRendererWorkerInboundMessage,
  type RustRendererWorkerOutboundMessage,
} from '../rust/worker-protocol';
import {
  RUNTIME_INPUT_BUFFER_BYTES,
  RUNTIME_INPUT_FLOAT_WORDS,
  RUNTIME_INPUT_INDEX,
  RUNTIME_INPUT_SIGNAL_WORDS,
  type RuntimeSharedPlanes,
} from '../rust/runtime-input-layout';

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

export interface RuntimeEventBreadcrumb {
  readonly severity: 'error' | 'fatal';
  readonly code: string;
  readonly stage: string;
  readonly message: string;
  readonly emittedAtMs: number;
}

export interface RustRendererRuntimeTelemetry {
  readonly meanMs: number;
  readonly stdDevMs: number;
  readonly sampleCount: number;
  readonly frameCount: number;
  readonly stageTimings: {
    readonly inputMarshalMs: number;
    readonly simulationDispatchMs: number;
    readonly fluidPassChainMs: number;
    readonly drawPrepMs: number;
    readonly renderMs: number;
    readonly swapMs: number;
    readonly totalFrameMs: number;
  };
  readonly dispatchCounters: {
    readonly computeDispatchCount: number;
    readonly computeWorkgroupCount: number;
    readonly activeLaneCount: number;
    readonly guardedLaneCount: number;
  };
  readonly resourceStats: {
    readonly shapeBankWordCount: number;
    readonly sinkTableWordCount: number;
    readonly indexedRecordCount: number;
    readonly nonIndexedRecordCount: number;
    readonly totalInstanceCount: number;
    readonly canvasWidth: number;
    readonly canvasHeight: number;
    readonly pingPongIndex: number;
  };
  readonly lastEvent: RuntimeEventBreadcrumb | null;
}

export interface SinkTableDebugSample {
  readonly sinkTableWordCount: number;
  readonly totalRecords: number;
  readonly firstRecord: {
    readonly instanceCount: number;
    readonly firstInstance: number;
    readonly positionBaseOffset: number;
    readonly positionLaneStride: number;
    readonly positionComponentStride: number;
    readonly colorBaseOffset: number;
    readonly colorLaneStride: number;
    readonly colorComponentStride: number;
    readonly scaleModeCode: number;
    readonly scaleValueOrBaseOffset: number;
    readonly scaleLaneStride: number;
    readonly scaleComponentStride: number;
  } | null;
}

const DEFAULT_BOOTSTRAP_CONFIG: RustRendererBootstrapConfig = Object.freeze({
  maxParticles: 65_536,
  maxShapes: 65_536,
  debugReadbackHz: 0,
});

function coerceFinite(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

const MAX_UINT32 = 0xFFFF_FFFF;
const RUNTIME_CONSOLE_ENABLED = isRuntimeConsoleEnabled();
const WORKER_RESPONSE_TIMEOUT_MS = 10_000;
const FLUID_PASS_ORDER = [
  'fluid.splat',
  'fluid.curl',
  'fluid.vorticity',
  'fluid.divergence',
  'fluid.pressure',
  'fluid.gradient-subtract',
  'fluid.advect',
  'fluid.present',
] as const;

function getRuntimeBootstrapConfig(): RustRendererBootstrapConfig {
  if (!RUNTIME_CONSOLE_ENABLED) return DEFAULT_BOOTSTRAP_CONFIG;
  return {
    ...DEFAULT_BOOTSTRAP_CONFIG,
    // [LAW:single-enforcer] Debug readback cadence is configured once at
    // renderer bootstrap when runtimeConsole diagnostics are enabled.
    debugReadbackHz: 6,
  };
}

function escapeRegex(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function previewWgsl(wgsl: string, maxLines: number = 4): string {
  return wgsl
    .split('\n')
    .slice(0, maxLines)
    .map((line) => line.trim())
    .join(' | ');
}

function hashWgslSource(wgsl: string): string {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < wgsl.length; index++) {
    hash ^= wgsl.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function parseWgslU32Constant(wgsl: string, name: string): number | null {
  const pattern = new RegExp(`const\\s+${escapeRegex(name)}\\s*:\\s*u32\\s*=\\s*(\\d+)u\\s*;`);
  const match = wgsl.match(pattern);
  if (!match) return null;
  const parsed = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractPassDebugConstants(wgsl: string): Record<string, number> {
  const keys = [
    'ACTIVE_LANES',
    'GRID_WIDTH',
    'GRID_HEIGHT',
    'CP_OFFSET',
    'CP_LANE_STRIDE',
    'CP_COMPONENT_STRIDE',
    'COLOR_OFFSET',
    'COLOR_LANE_STRIDE',
    'COLOR_COMPONENT_STRIDE',
    'SCALE_OFFSET',
    'SCALE_LANE_STRIDE',
    'SCALE_COMPONENT_STRIDE',
  ] as const;
  const constants: Record<string, number> = {};
  for (const key of keys) {
    const value = parseWgslU32Constant(wgsl, key);
    if (value !== null) {
      constants[key] = value;
    }
  }
  return constants;
}

function validateGpuPass(pass: RustRendererGpuPass, index: number): RustRendererGpuPass {
  if (typeof pass.passId !== 'string' || pass.passId.trim().length === 0) {
    throw new Error(`Rust renderer GPU pass contract violation: passes[${index}].passId is required`);
  }
  if (pass.stage !== 'compute') {
    throw new Error(
      `Rust renderer GPU pass contract violation: pass "${pass.passId}" has unsupported stage "${String(pass.stage)}"`,
    );
  }
  if (typeof pass.entryPoint !== 'string' || pass.entryPoint.trim().length === 0) {
    throw new Error(`Rust renderer GPU pass contract violation: pass "${pass.passId}" is missing entryPoint`);
  }
  if (typeof pass.wgsl !== 'string' || pass.wgsl.trim().length === 0) {
    throw new Error(`Rust renderer GPU pass contract violation: pass "${pass.passId}" is missing WGSL source`);
  }
  if (pass.wgsl.toLowerCase().includes("won't compile")) {
    throw new Error(
      `Rust renderer GPU pass contract violation: pass "${pass.passId}" contains placeholder invalid WGSL (${previewWgsl(pass.wgsl)})`,
    );
  }
  if (!pass.wgsl.includes('@compute')) {
    throw new Error(
      `Rust renderer GPU pass contract violation: pass "${pass.passId}" is missing @compute entry annotation`,
    );
  }
  const entryPattern = new RegExp(`\\bfn\\s+${escapeRegex(pass.entryPoint)}\\s*\\(`);
  if (!entryPattern.test(pass.wgsl)) {
    throw new Error(
      `Rust renderer GPU pass contract violation: pass "${pass.passId}" is missing fn ${pass.entryPoint}(...)`,
    );
  }
  return pass;
}

function validateGpuPassBundle(passes: readonly RustRendererGpuPass[]): readonly RustRendererGpuPass[] {
  if (passes.length === 0) {
    throw new Error('Rust renderer GPU pass contract violation: pass bundle must contain at least one pass');
  }
  const validated = passes.map((pass, index) => validateGpuPass(pass, index));
  const seenPassIds = new Set<string>();
  const seenEntryPoints = new Set<string>();
  for (const pass of validated) {
    if (seenPassIds.has(pass.passId)) {
      throw new Error(`Rust renderer GPU pass contract violation: duplicate passId "${pass.passId}"`);
    }
    seenPassIds.add(pass.passId);
    if (seenEntryPoints.has(pass.entryPoint)) {
      throw new Error(`Rust renderer GPU pass contract violation: duplicate entryPoint "${pass.entryPoint}"`);
    }
    seenEntryPoints.add(pass.entryPoint);
  }

  const fluidPassIds = validated.filter((pass) => pass.passId.startsWith('fluid.')).map((pass) => pass.passId);
  if (fluidPassIds.length > 0) {
    if (!fluidPassIds.includes('fluid.present')) {
      throw new Error('Rust renderer GPU pass contract violation: fluid pass bundle must include "fluid.present"');
    }
    let cursor = -1;
    for (const passId of fluidPassIds) {
      const nextIndex = FLUID_PASS_ORDER.indexOf(passId as (typeof FLUID_PASS_ORDER)[number]);
      if (nextIndex === -1) {
        throw new Error(`Rust renderer GPU pass contract violation: unknown fluid passId "${passId}"`);
      }
      if (nextIndex < cursor) {
        throw new Error(
          `Rust renderer GPU pass contract violation: fluid pass "${passId}" is out of canonical order`,
        );
      }
      cursor = nextIndex;
    }
  }
  return validated;
}

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
  private latestTelemetry: RustRendererRuntimeTelemetry | null = null;
  private lifecycleState: RustRendererSchedulerState = 'Booting';
  private latestRuntimeEvent: RuntimeEventBreadcrumb | null = null;
  private lastInstalledPassIds: readonly string[] = [];
  private latestSinkTableSample: SinkTableDebugSample | null = null;
  private renderInputDebugLogged = false;
  private sinkTableDebugLogCounter = 0;
  private readonly emittedHealthWarningCodes = new Set<string>();

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
    const sharedInput = new SharedArrayBuffer(RUNTIME_INPUT_BUFFER_BYTES);
    const signalWords = new Int32Array(sharedInput, 0, RUNTIME_INPUT_SIGNAL_WORDS);
    const inputWords = new Float32Array(
      sharedInput,
      RUNTIME_INPUT_SIGNAL_WORDS * Int32Array.BYTES_PER_ELEMENT,
      RUNTIME_INPUT_FLOAT_WORDS,
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
      getRuntimeBootstrapConfig(),
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
    this.inputWords[RUNTIME_INPUT_INDEX.width] = input.width;
    this.inputWords[RUNTIME_INPUT_INDEX.height] = input.height;
    this.inputWords[RUNTIME_INPUT_INDEX.zoom] = input.zoom;
    this.inputWords[RUNTIME_INPUT_INDEX.panX] = input.panX;
    this.inputWords[RUNTIME_INPUT_INDEX.panY] = input.panY;
    this.inputWords[RUNTIME_INPUT_INDEX.timeMs] = input.timeMs;
    this.inputWords[RUNTIME_INPUT_INDEX.mouseX] = coerceFinite(input.inputMouseX);
    this.inputWords[RUNTIME_INPUT_INDEX.mouseY] = coerceFinite(input.inputMouseY);
    this.inputWords[RUNTIME_INPUT_INDEX.mouseButtons] = coerceFinite(input.inputMouseButtons);
    this.inputWords[RUNTIME_INPUT_INDEX.audioLow] = coerceFinite(input.inputAudioLow);
    this.inputWords[RUNTIME_INPUT_INDEX.audioMid] = coerceFinite(input.inputAudioMid);
    this.inputWords[RUNTIME_INPUT_INDEX.audioHigh] = coerceFinite(input.inputAudioHigh);
    this.inputWords[RUNTIME_INPUT_INDEX.gaugeActive] = coerceFinite(input.inputGaugeActive);
    const shapeBankWords = this.syncShapeBankPlane(input.shapeBank);
    const sinkTableWords = this.syncSinkTablePlane(
      input.drawPrepSinkTableV1,
      input.drawPrepSinkTableWordCount,
    );
    if (RUNTIME_CONSOLE_ENABLED && !this.renderInputDebugLogged && input.drawPrepSinkTableV1 && sinkTableWords > 0) {
      this.renderInputDebugLogged = true;
      const headerWords = 8;
      const base = headerWords;
      const sample = {
        sinkTableWordCount: sinkTableWords,
        totalRecords: input.drawPrepSinkTableV1[1] ?? 0,
        firstRecord: {
          instanceCount: input.drawPrepSinkTableV1[base + 4] ?? 0,
          firstInstance: input.drawPrepSinkTableV1[base + 5] ?? 0,
          positionBaseOffset: input.drawPrepSinkTableV1[base + 8] ?? 0,
          positionLaneStride: input.drawPrepSinkTableV1[base + 9] ?? 0,
          positionComponentStride: input.drawPrepSinkTableV1[base + 10] ?? 0,
          colorBaseOffset: input.drawPrepSinkTableV1[base + 11] ?? 0,
          colorLaneStride: input.drawPrepSinkTableV1[base + 12] ?? 0,
          colorComponentStride: input.drawPrepSinkTableV1[base + 13] ?? 0,
          scaleModeCode: input.drawPrepSinkTableV1[base + 14] ?? 0,
          scaleValueOrBaseOffset: input.drawPrepSinkTableV1[base + 15] ?? 0,
          scaleLaneStride: input.drawPrepSinkTableV1[base + 16] ?? 0,
          scaleComponentStride: input.drawPrepSinkTableV1[base + 17] ?? 0,
        },
      } satisfies SinkTableDebugSample;
      this.latestSinkTableSample = sample;
      console.info(`[runtimeConsole] ${JSON.stringify({ kind: 'render-input-sample', ...sample })}`);
    }
    this.inputWords[RUNTIME_INPUT_INDEX.sinkTableWords] = sinkTableWords;
    this.inputWords[RUNTIME_INPUT_INDEX.shapeBankWords] = shapeBankWords;
    Atomics.add(this.signalWords, 0, 1);
  }

  resizeCanvas(width: number, height: number): void {
    if (this.fatalError) {
      throw this.fatalError;
    }
    if (this.disposed) {
      throw new Error('Rust renderer has been disposed');
    }
    if (!this.bootstrapped) {
      throw new Error('Rust renderer worker is not bootstrapped');
    }
    this.syncCanvasSize(width, height);
  }

  getRuntimeSharedPlanes(): RuntimeSharedPlanes {
    // [LAW:one-source-of-truth] Runtime workers write the same canonical shared
    // planes that renderer.render uses; ownership is shared, layout is not.
    return {
      sharedInput: this.signalWords.buffer as SharedArrayBuffer,
      sharedShapeBank: this.sharedShapeBankWords.buffer as SharedArrayBuffer,
      sharedSinkTable: this.sharedSinkTableWords.buffer as SharedArrayBuffer,
    };
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

  async rebuildGpuPipelines(
    passes: readonly RustRendererGpuPass[],
  ): Promise<void> {
    if (this.fatalError) {
      throw this.fatalError;
    }
    if (!this.bootstrapped) {
      throw new Error('Rust renderer worker is not bootstrapped');
    }
    // [LAW:single-enforcer] Bundle-level GPU pass contract validation is owned
    // at this renderer boundary before worker transport.
    const validatedPasses = [...validateGpuPassBundle(passes)];
    this.lastInstalledPassIds = validatedPasses.map((pass) => pass.passId);
    if (RUNTIME_CONSOLE_ENABLED) {
      const payload = {
        kind: 'gpu-pipeline-rebuild',
        passCount: validatedPasses.length,
        passes: validatedPasses.map((pass) => ({
          passId: pass.passId,
          stage: pass.stage,
          entryPoint: pass.entryPoint,
          wgslLength: pass.wgsl.length,
          wgslHash: hashWgslSource(pass.wgsl),
          wgslPreview: previewWgsl(pass.wgsl),
          // [LAW:verifiable-goals] Runtime WGSL source is emitted once at
          // pipeline rebuild so GPU-side slot addressing bugs are inspectable.
          wgslSource: pass.wgsl,
          debugConstants: extractPassDebugConstants(pass.wgsl),
        })),
      };
      // [LAW:one-source-of-truth] Renderer boundary emits one canonical
      // structured line for pipeline install debugging in runtimeConsole mode.
      console.info(`[runtimeConsole] ${JSON.stringify(payload)}`);
    }
    this.worker.postMessage({ type: 'PAUSE' } satisfies RustRendererWorkerInboundMessage);
    try {
      await this.awaitWorkerAck({
        successType: 'REBUILD_GPU_PIPELINES_SUCCESS',
        context: `rebuildGpuPipelines(${validatedPasses.length} passes)`,
        dispatch: () => {
          const message: RustRendererWorkerInboundMessage = {
            type: 'REBUILD_GPU_PIPELINES',
            passes: validatedPasses,
          };
          this.worker.postMessage(message);
        },
      });
    } finally {
      this.worker.postMessage({ type: 'RESUME' } satisfies RustRendererWorkerInboundMessage);
    }
  }

  async rebuildSimulationPipeline(simulationWgsl: string): Promise<void> {
    // [LAW:one-source-of-truth] exception: transitional projection for callers
    // still publishing a single simulation pass during bundle migration.
    await this.rebuildGpuPipelines([{
      passId: 'simulation',
      stage: 'compute',
      entryPoint: 'compute_main',
      wgsl: simulationWgsl,
    }]);
  }

  getLatestRuntimeTelemetry(): RustRendererRuntimeTelemetry | null {
    return this.latestTelemetry;
  }

  getLifecycleState(): RustRendererSchedulerState {
    return this.lifecycleState;
  }

  getInstalledGpuPassIds(): readonly string[] {
    return this.lastInstalledPassIds;
  }

  getLatestSinkTableSample(): SinkTableDebugSample | null {
    return this.latestSinkTableSample;
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
    if (RUNTIME_CONSOLE_ENABLED) {
      this.sinkTableDebugLogCounter += 1;
      if (this.sinkTableDebugLogCounter % 120 === 1) {
        const headerWords = 8;
        const recordWords = 29;
        const totalRecords = sinkTableWords[1] ?? 0;
        const firstRecordBase = headerWords;
        const hasFirstRecord = totalRecords > 0 && wordCount >= firstRecordBase + recordWords;
        const debugRecord = hasFirstRecord
          ? {
            instanceCount: sinkTableWords[firstRecordBase + 4] ?? 0,
            firstInstance: sinkTableWords[firstRecordBase + 5] ?? 0,
            positionBaseOffset: sinkTableWords[firstRecordBase + 8] ?? 0,
            positionLaneStride: sinkTableWords[firstRecordBase + 9] ?? 0,
            positionComponentStride: sinkTableWords[firstRecordBase + 10] ?? 0,
            colorBaseOffset: sinkTableWords[firstRecordBase + 11] ?? 0,
            colorLaneStride: sinkTableWords[firstRecordBase + 12] ?? 0,
            colorComponentStride: sinkTableWords[firstRecordBase + 13] ?? 0,
            scaleModeCode: sinkTableWords[firstRecordBase + 14] ?? 0,
            scaleValueOrBaseOffset: sinkTableWords[firstRecordBase + 15] ?? 0,
            scaleLaneStride: sinkTableWords[firstRecordBase + 16] ?? 0,
            scaleComponentStride: sinkTableWords[firstRecordBase + 17] ?? 0,
          }
          : null;
        this.latestSinkTableSample = {
          sinkTableWordCount: wordCount,
          totalRecords,
          firstRecord: debugRecord,
        };
        console.info(
          `[runtimeConsole] ${JSON.stringify({
            kind: 'sink-table-sample',
            wordCount,
            totalRecords,
            firstRecord: debugRecord,
          })}`,
        );
      }
    }
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

    await this.awaitWorkerAck({
      successType: 'BOOTSTRAP_SUCCESS',
      context: 'bootstrap',
      dispatch: () => {
        this.worker.postMessage(message, [offscreenCanvas]);
      },
    });
    this.bootstrapped = true;
  }

  private async awaitWorkerAck(
    options: {
      readonly successType: RustRendererWorkerOutboundMessage['type'];
      readonly context: string;
      readonly dispatch: () => void;
    },
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeoutId = globalThis.setTimeout(() => {
        settle(() => reject(new Error(`Rust renderer worker timed out during ${options.context}`)));
      }, WORKER_RESPONSE_TIMEOUT_MS);
      const settle = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeoutId);
        this.worker.removeEventListener('message', onMessage);
        this.worker.removeEventListener('error', onError);
        callback();
      };
      const onMessage = (event: MessageEvent<RustRendererWorkerOutboundMessage>): void => {
        const payload = event.data;
        if (!payload) return;
        if (payload.type === options.successType) {
          settle(resolve);
          return;
        }
        if (payload.type === 'FATAL_ERROR') {
          settle(() => reject(new Error(`[${payload.code}] ${payload.message}`)));
        }
      };
      const onError = (event: ErrorEvent): void => {
        settle(() => reject(new Error(event.message || `Rust renderer worker crashed during ${options.context}`)));
      };
      this.worker.addEventListener('message', onMessage);
      this.worker.addEventListener('error', onError);
      // [LAW:single-enforcer] Worker request/ack timeout ownership lives in
      // one renderer boundary helper to avoid divergent wait logic.
      options.dispatch();
    });
  }

  private emitRuntimeHealthWarning(code: string, details: Record<string, unknown>): void {
    if (this.emittedHealthWarningCodes.has(code)) {
      return;
    }
    this.emittedHealthWarningCodes.add(code);
    if (RUNTIME_CONSOLE_ENABLED) {
      console.warn(
        `[runtimeConsole] ${JSON.stringify({
          kind: 'render-health-warning',
          code,
          details,
        })}`,
      );
    }
  }

  private validateHeartbeatHealth(payload: Extract<RustRendererWorkerOutboundMessage, { type: 'SCHEDULER_HEARTBEAT' }>): void {
    const telemetry = payload.telemetry;
    const installedPassCount = this.lastInstalledPassIds.length;
    const expectedDispatchCount = installedPassCount > 0 ? installedPassCount + 2 : null;
    if (
      expectedDispatchCount !== null
      && telemetry.dispatchCounters.computeDispatchCount !== expectedDispatchCount
    ) {
      this.emitRuntimeHealthWarning('dispatch_count_mismatch', {
        installedPassCount,
        expectedDispatchCount,
        observedDispatchCount: telemetry.dispatchCounters.computeDispatchCount,
      });
    }
    if (
      telemetry.resourceStats.sinkTableWordCount > 0
      && telemetry.resourceStats.totalInstanceCount === 0
    ) {
      this.emitRuntimeHealthWarning('sink_nonzero_with_zero_instances', {
        sinkTableWordCount: telemetry.resourceStats.sinkTableWordCount,
        totalInstanceCount: telemetry.resourceStats.totalInstanceCount,
      });
    }
    if (
      telemetry.stageTimings.totalFrameMs === 0
      && telemetry.dispatchCounters.computeDispatchCount > 0
    ) {
      this.emitRuntimeHealthWarning('zero_total_frame_with_dispatches', {
        totalFrameMs: telemetry.stageTimings.totalFrameMs,
        computeDispatchCount: telemetry.dispatchCounters.computeDispatchCount,
      });
    }
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
      this.latestRuntimeEvent = {
        severity: payload.severity,
        code: payload.code,
        stage: payload.stage,
        message: payload.message,
        emittedAtMs: payload.emittedAtMs,
      };
      if (payload.severity === 'fatal') {
        this.fatalError = new Error(`[${payload.code}] ${payload.message}`);
      }
      return;
    }
    if (payload.type === 'SCHEDULER_HEARTBEAT') {
      // [LAW:one-source-of-truth] Renderer mirrors scheduler state from
      // heartbeat packets instead of deriving lifecycle state client-side.
      this.lifecycleState = payload.state;
      this.validateHeartbeatHealth(payload);
      this.latestTelemetry = {
        meanMs: payload.meanTickMs,
        stdDevMs: payload.stdDevTickMs,
        sampleCount: payload.sampleCount,
        frameCount: payload.frameCount,
        stageTimings: payload.telemetry.stageTimings,
        dispatchCounters: payload.telemetry.dispatchCounters,
        resourceStats: payload.telemetry.resourceStats,
        lastEvent: this.latestRuntimeEvent,
      };
    }
  };
}

export async function createWebGPURenderer(canvas: HTMLCanvasElement): Promise<WebGPURenderer> {
  // [LAW:no-silent-fallbacks] WebGPU renderer creation is hard-fail only.
  // No legacy renderer path is allowed once worker+Rust cutover is selected.
  return WebGPURenderer.create(canvas);
}
