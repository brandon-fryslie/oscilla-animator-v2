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

type WorkerAckDisposition =
  | { readonly kind: 'success' }
  | { readonly kind: 'ignore' }
  | { readonly kind: 'fail'; readonly error: Error };

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
const WORKER_RESPONSE_TIMEOUT_MS = 20_000;
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
  // TODO(#159): Move debug WGSL preview formatting out of renderer runtime path.
  // https://github.com/brandon-fryslie/oscilla-animator-v2/issues/159
  return wgsl
    .split('\n')
    .slice(0, maxLines)
    .map((line) => line.trim())
    .join(' | ');
}

function hashWgslSource(wgsl: string): string {
  // TODO(#159): Move debug-only shader hashing out of renderer runtime path.
  // https://github.com/brandon-fryslie/oscilla-animator-v2/issues/159
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < wgsl.length; index++) {
    hash ^= wgsl.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function parseWgslU32Constant(wgsl: string, name: string): number | null {
  // TODO(#179): Remove renderer regex parsing for WGSL constants; consume
  // typed compiler/worker metadata instead of text matching.
  // https://github.com/brandon-fryslie/oscilla-animator-v2/issues/179
  const pattern = new RegExp(`const\\s+${escapeRegex(name)}\\s*:\\s*u32\\s*=\\s*(\\d+)u\\s*;`);
  const match = wgsl.match(pattern);
  if (!match) return null;
  const parsed = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractPassDebugConstants(wgsl: string): Record<string, number> {
  // Extracts a small debug-telemetry snapshot of known WGSL `const u32`
  // values so runtimeConsole logs can show lane/grid/offset context during
  // pipeline-install debugging without opening shader source manually.
  // [LAW:one-source-of-truth] This is temporary drift from canonical metadata:
  // TODO(#179) moves these constants to structured compiler artifacts so the
  // renderer stops parsing WGSL text entirely.
  // https://github.com/brandon-fryslie/oscilla-animator-v2/issues/179
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
  // TODO(#180): Move GPU pass semantic validation to compile/Naga boundary.
  // [LAW:single-enforcer] Renderer should not be the long-term enforcer for
  // pass contract validity; compiler validation is the canonical boundary.
  // https://github.com/brandon-fryslie/oscilla-animator-v2/issues/180
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
  // TODO(#179): Remove renderer regex entrypoint validation; validate
  // against structured pass signatures emitted by compiler lowering.
  // https://github.com/brandon-fryslie/oscilla-animator-v2/issues/179
  const entryPattern = new RegExp(`\\bfn\\s+${escapeRegex(pass.entryPoint)}\\s*\\(`);
  if (!entryPattern.test(pass.wgsl)) {
    throw new Error(
      `Rust renderer GPU pass contract violation: pass "${pass.passId}" is missing fn ${pass.entryPoint}(...)`,
    );
  }
  return pass;
}

function validateGpuPassBundle(passes: readonly RustRendererGpuPass[]): readonly RustRendererGpuPass[] {
  // TODO(#181): Move bundle/order invariants to compiler artifact validation.
  // [LAW:single-enforcer] Renderer should execute validated manifests, not
  // enforce compiler-owned pass-order policy.
  // https://github.com/brandon-fryslie/oscilla-animator-v2/issues/181
  if (passes.length === 0) {
    throw new Error('Rust renderer GPU pass contract violation: pass bundle must contain at least one pass');
  }
  const validated = passes.map((pass, index) => validateGpuPass(pass, index));
  const seenPassIds = new Set<string>();
  for (const pass of validated) {
    if (seenPassIds.has(pass.passId)) {
      throw new Error(`Rust renderer GPU pass contract violation: duplicate passId "${pass.passId}"`);
    }
    seenPassIds.add(pass.passId);
  }

  const fluidPassIds = validated.filter((pass) => pass.passId.startsWith('fluid.')).map((pass) => pass.passId);
  if (fluidPassIds.length > 0) {
    if (!fluidPassIds.includes('fluid.present')) {
      throw new Error('Rust renderer GPU pass contract violation: fluid pass bundle must include "fluid.present"');
    }
    let cursor = -1;
    for (const passId of fluidPassIds) {
      // TODO(#183): Remove cast-based pass-id narrowing and use explicit
      // guard-backed lookup for fluid pass ordering.
      // https://github.com/brandon-fryslie/oscilla-animator-v2/issues/183
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

function readRequiredSinkTableWord(
  words: Uint32Array,
  wordCount: number,
  index: number,
  context: string,
): number {
  if (!Number.isInteger(index) || index < 0 || index >= wordCount) {
    throw new Error(
      'Rust renderer sink table debug contract violation: ' +
        `${context} index out of bounds (index=${index}, wordCount=${wordCount})`,
    );
  }
  const value = words[index];
  if (value === undefined) {
    throw new Error(
      'Rust renderer sink table debug contract violation: ' +
        `${context} missing value at index ${index}`,
    );
  }
  return value;
}

function classifyWorkerAckMessage(
  payload: RustRendererWorkerOutboundMessage,
  expectedSuccessType: RustRendererWorkerOutboundMessage['type'],
): WorkerAckDisposition {
  if (payload.type === expectedSuccessType) {
    return { kind: 'success' };
  }
  if (payload.type === 'FATAL_ERROR') {
    return { kind: 'fail', error: new Error(`[${payload.code}] ${payload.message}`) };
  }
  if (payload.type === 'DEVICE_LOST') {
    return { kind: 'fail', error: new Error(`[${payload.code}] ${payload.reason}`) };
  }
  if (payload.type === 'SCHEDULER_HEARTBEAT' || payload.type === 'RUNTIME_EVENT') {
    return { kind: 'ignore' };
  }
  // [LAW:single-enforcer] Ack message classification happens in one helper so
  // all await paths share identical non-success handling.
  return {
    kind: 'fail',
    error: new Error(
      `Rust renderer worker protocol violation: expected ${expectedSuccessType}, got ${payload.type}`,
    ),
  };
}


export function assertWebGPUStartupContract(canvas: HTMLCanvasElement): void {
  // TODO(#183): Remove navigator type assertion and replace with boundary
  // capability guard helper that does not rely on `as` casting.
  // https://github.com/brandon-fryslie/oscilla-animator-v2/issues/183
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

  private markRendererFatal(error: Error): void {
    // TODO(#182): Harden fatal-transition contract (idempotence, canonical
    // fatal record, and boundary-owned cleanup/log emission).
    // [LAW:single-enforcer] Fatal state transition policy should be enforced
    // at one dedicated boundary helper.
    // https://github.com/brandon-fryslie/oscilla-animator-v2/issues/182
    this.lifecycleState = 'Lost';
    this.fatalError = error;
  }

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
    // TODO(#159): Replace this inline payload assembly with:
    // `buildRenderInputSamplePayload(drawPrepSinkTableV1, sinkTableWords)`
    // and emit via a shared debug emitter helper from this `render(...)` call
    // site. [LAW:locality-or-seam] Keep payload construction out of hot-path
    // render orchestration.
    // https://github.com/brandon-fryslie/oscilla-animator-v2/issues/159
    if (RUNTIME_CONSOLE_ENABLED && !this.renderInputDebugLogged && input.drawPrepSinkTableV1 && sinkTableWords > 0) {
      this.renderInputDebugLogged = true;
      const headerWords = 8;
      const base = headerWords;
      const sample = {
        sinkTableWordCount: sinkTableWords,
        totalRecords: readRequiredSinkTableWord(
          input.drawPrepSinkTableV1,
          sinkTableWords,
          1,
          'render-input-sample.totalRecords',
        ),
        firstRecord: {
          instanceCount: readRequiredSinkTableWord(
            input.drawPrepSinkTableV1,
            sinkTableWords,
            base + 4,
            'render-input-sample.firstRecord.instanceCount',
          ),
          firstInstance: readRequiredSinkTableWord(
            input.drawPrepSinkTableV1,
            sinkTableWords,
            base + 5,
            'render-input-sample.firstRecord.firstInstance',
          ),
          positionBaseOffset: readRequiredSinkTableWord(
            input.drawPrepSinkTableV1,
            sinkTableWords,
            base + 8,
            'render-input-sample.firstRecord.positionBaseOffset',
          ),
          positionLaneStride: readRequiredSinkTableWord(
            input.drawPrepSinkTableV1,
            sinkTableWords,
            base + 9,
            'render-input-sample.firstRecord.positionLaneStride',
          ),
          positionComponentStride: readRequiredSinkTableWord(
            input.drawPrepSinkTableV1,
            sinkTableWords,
            base + 10,
            'render-input-sample.firstRecord.positionComponentStride',
          ),
          colorBaseOffset: readRequiredSinkTableWord(
            input.drawPrepSinkTableV1,
            sinkTableWords,
            base + 11,
            'render-input-sample.firstRecord.colorBaseOffset',
          ),
          colorLaneStride: readRequiredSinkTableWord(
            input.drawPrepSinkTableV1,
            sinkTableWords,
            base + 12,
            'render-input-sample.firstRecord.colorLaneStride',
          ),
          colorComponentStride: readRequiredSinkTableWord(
            input.drawPrepSinkTableV1,
            sinkTableWords,
            base + 13,
            'render-input-sample.firstRecord.colorComponentStride',
          ),
          scaleModeCode: readRequiredSinkTableWord(
            input.drawPrepSinkTableV1,
            sinkTableWords,
            base + 14,
            'render-input-sample.firstRecord.scaleModeCode',
          ),
          scaleValueOrBaseOffset: readRequiredSinkTableWord(
            input.drawPrepSinkTableV1,
            sinkTableWords,
            base + 15,
            'render-input-sample.firstRecord.scaleValueOrBaseOffset',
          ),
          scaleLaneStride: readRequiredSinkTableWord(
            input.drawPrepSinkTableV1,
            sinkTableWords,
            base + 16,
            'render-input-sample.firstRecord.scaleLaneStride',
          ),
          scaleComponentStride: readRequiredSinkTableWord(
            input.drawPrepSinkTableV1,
            sinkTableWords,
            base + 17,
            'render-input-sample.firstRecord.scaleComponentStride',
          ),
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
    // TODO(#183): Replace SharedArrayBuffer assertions with explicit runtime
    // guard-backed contract checks before returning typed planes.
    // https://github.com/brandon-fryslie/oscilla-animator-v2/issues/183
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
      // TODO(#159): Replace this inline payload assembly with:
      // `buildGpuPipelineRebuildPayload(validatedPasses)` and emit through a
      // shared `emitRuntimeConsolePayload(...)` helper from this
      // `rebuildGpuPipelines(...)` call site.
      // https://github.com/brandon-fryslie/oscilla-animator-v2/issues/159
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
    // TODO(#162): Remove this single-pass compatibility seam after runtime
    // callers are fully migrated to canonical `rebuildGpuPipelines`.
    // https://github.com/brandon-fryslie/oscilla-animator-v2/issues/162
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
    // TODO(#159): Replace this inline payload assembly with:
    // `buildSinkTableSamplePayload(sinkTableWords, wordCount)` and emit via
    // shared debug helper from this `syncSinkTablePlane(...)` call site.
    // [LAW:locality-or-seam] Renderer execution path should not own payload
    // object construction details.
    // https://github.com/brandon-fryslie/oscilla-animator-v2/issues/159
    if (RUNTIME_CONSOLE_ENABLED) {
      this.sinkTableDebugLogCounter += 1;
      if (this.sinkTableDebugLogCounter % 120 === 1) {
        const headerWords = 8;
        const recordWords = 29;
        const totalRecords = readRequiredSinkTableWord(
          sinkTableWords,
          wordCount,
          1,
          'sink-table-sample.totalRecords',
        );
        const firstRecordBase = headerWords;
        const hasFirstRecord = totalRecords > 0 && wordCount >= firstRecordBase + recordWords;
        const debugRecord = hasFirstRecord
          ? {
            instanceCount: readRequiredSinkTableWord(
              sinkTableWords,
              wordCount,
              firstRecordBase + 4,
              'sink-table-sample.firstRecord.instanceCount',
            ),
            firstInstance: readRequiredSinkTableWord(
              sinkTableWords,
              wordCount,
              firstRecordBase + 5,
              'sink-table-sample.firstRecord.firstInstance',
            ),
            positionBaseOffset: readRequiredSinkTableWord(
              sinkTableWords,
              wordCount,
              firstRecordBase + 8,
              'sink-table-sample.firstRecord.positionBaseOffset',
            ),
            positionLaneStride: readRequiredSinkTableWord(
              sinkTableWords,
              wordCount,
              firstRecordBase + 9,
              'sink-table-sample.firstRecord.positionLaneStride',
            ),
            positionComponentStride: readRequiredSinkTableWord(
              sinkTableWords,
              wordCount,
              firstRecordBase + 10,
              'sink-table-sample.firstRecord.positionComponentStride',
            ),
            colorBaseOffset: readRequiredSinkTableWord(
              sinkTableWords,
              wordCount,
              firstRecordBase + 11,
              'sink-table-sample.firstRecord.colorBaseOffset',
            ),
            colorLaneStride: readRequiredSinkTableWord(
              sinkTableWords,
              wordCount,
              firstRecordBase + 12,
              'sink-table-sample.firstRecord.colorLaneStride',
            ),
            colorComponentStride: readRequiredSinkTableWord(
              sinkTableWords,
              wordCount,
              firstRecordBase + 13,
              'sink-table-sample.firstRecord.colorComponentStride',
            ),
            scaleModeCode: readRequiredSinkTableWord(
              sinkTableWords,
              wordCount,
              firstRecordBase + 14,
              'sink-table-sample.firstRecord.scaleModeCode',
            ),
            scaleValueOrBaseOffset: readRequiredSinkTableWord(
              sinkTableWords,
              wordCount,
              firstRecordBase + 15,
              'sink-table-sample.firstRecord.scaleValueOrBaseOffset',
            ),
            scaleLaneStride: readRequiredSinkTableWord(
              sinkTableWords,
              wordCount,
              firstRecordBase + 16,
              'sink-table-sample.firstRecord.scaleLaneStride',
            ),
            scaleComponentStride: readRequiredSinkTableWord(
              sinkTableWords,
              wordCount,
              firstRecordBase + 17,
              'sink-table-sample.firstRecord.scaleComponentStride',
            ),
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
        settle(() => {
          const error = new Error(`Rust renderer worker timed out during ${options.context}`);
          this.markRendererFatal(error);
          this.worker.terminate();
          reject(error);
        });
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
        const disposition = classifyWorkerAckMessage(payload, options.successType);
        if (disposition.kind === 'ignore') {
          return;
        }
        if (disposition.kind === 'success') {
          settle(resolve);
          return;
        }
        settle(() => {
          this.markRendererFatal(disposition.error);
          reject(disposition.error);
        });
      };
      const onError = (event: ErrorEvent): void => {
        settle(() => {
          const error = new Error(event.message || `Rust renderer worker crashed during ${options.context}`);
          this.markRendererFatal(error);
          reject(error);
        });
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
    // TODO(#159): Replace inline health-warning payload with
    // `buildRenderHealthWarningPayload(code, details)` and emit through the
    // same runtime-console emitter helper used by other debug payloads.
    // [LAW:single-enforcer] One debug emitter boundary should own
    // serialization/log formatting.
    // https://github.com/brandon-fryslie/oscilla-animator-v2/issues/159
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
      this.markRendererFatal(new Error(`[${payload.code}] ${payload.message}`));
      return;
    }
    if (payload.type === 'DEVICE_LOST') {
      this.markRendererFatal(new Error(`[${payload.code}] ${payload.reason}`));
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
        this.markRendererFatal(new Error(`[${payload.code}] ${payload.message}`));
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
