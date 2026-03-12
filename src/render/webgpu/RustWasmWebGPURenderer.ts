import type { RenderShapeBankSource } from './WebGPUShapeBankManager';
import type { IndirectArgsReadbackSnapshot } from './WebGPUIndirectArgsInspector';
import type { DrawPrepRenderContract } from '../types';
import { isRuntimeConsoleEnabled } from '../../testing/test-params';
import { reportRenderIssue } from '../render-issues';
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
import { getNavigatorGpu } from './gpu-api';
import {
  extractPassDebugConstants,
  formatWgslWithLineNumbers,
  hashWgslSource,
  previewWgsl,
} from './gpu-pass-debug';

interface RenderInput extends DrawPrepRenderContract {
  readonly shapeBank: RenderShapeBankSource;
  readonly width: number;
  readonly height: number;
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
  readonly timeMs: number;
  readonly inputMouseX: number;
  readonly inputMouseY: number;
  readonly inputMouseButtons: number;
  readonly inputAudioLow: number;
  readonly inputAudioMid: number;
  readonly inputAudioHigh: number;
  readonly inputGaugeActive: number;
  readonly drawPrepSinkTableV1: Uint32Array;
  readonly drawPrepSinkTableWordCount: number;
}

type RuntimeViewportFrame = Pick<
  RenderInput,
  | 'width'
  | 'height'
  | 'zoom'
  | 'panX'
  | 'panY'
  | 'timeMs'
  | 'inputMouseX'
  | 'inputMouseY'
  | 'inputMouseButtons'
  | 'inputAudioLow'
  | 'inputAudioMid'
  | 'inputAudioHigh'
  | 'inputGaugeActive'
>;

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
    readonly drawModeCode: number;
    readonly count: number;
    readonly instanceCount: number;
    readonly first: number;
    readonly baseVertex: number;
    readonly firstInstance: number;
    readonly shapeWordOffset: number;
    readonly materialId: number;
  } | null;
  readonly firstDescriptor: {
    readonly positionBaseOffset: number;
    readonly positionLaneStride: number;
    readonly positionComponentStride: number;
    readonly colorBaseOffset: number;
    readonly colorLaneStride: number;
    readonly colorComponentStride: number;
    readonly scaleBaseOffset: number;
    readonly scaleLaneStride: number;
    readonly scaleComponentStride: number;
  } | null;
}

type WorkerAckDisposition =
  | { readonly kind: 'success' }
  | { readonly kind: 'ignore' }
  | {
    readonly kind: 'fail';
    readonly error: Error;
    readonly fatal: boolean;
    readonly code: string;
    readonly stage: string;
    readonly message: string;
  };

interface RendererFatalRecord {
  readonly code: string;
  readonly stage: string;
  readonly message: string;
  readonly timestamp: number;
  readonly cause: Error;
}

interface RendererFatalTransition {
  readonly code: string;
  readonly stage: string;
  readonly message: string;
  readonly timestamp: number;
  readonly cause: Error;
  readonly terminationPolicy: 'keep-worker-alive' | 'terminate-worker';
}

const DEFAULT_BOOTSTRAP_CONFIG: RustRendererBootstrapConfig = Object.freeze({
  maxParticles: 65_536,
  maxShapes: 65_536,
  debugReadbackHz: 0,
});

function assertFiniteRuntimeInput(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Rust renderer input contract violation: ${field} must be finite, got ${value}`);
  }
  return value;
}

function assertPositiveCanvasDimension(value: number, field: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(
      `Rust renderer input contract violation: ${field} must be a positive integer, got ${String(value)}`,
    );
  }
  return value;
}

const MAX_UINT32 = 0xFFFF_FFFF;
const RUNTIME_CONSOLE_ENABLED = isRuntimeConsoleEnabled();
// TODO(#185): Keep current timeout unchanged for this PR, but measure ack
// latency distributions by context (`bootstrap` vs `rebuildGpuPipelines`) and
// decide whether to split/configure timeout policy from real data.
// https://github.com/brandon-fryslie/oscilla-animator-v2/issues/185
const WORKER_RESPONSE_TIMEOUT_MS = 20_000;

function getRuntimeBootstrapConfig(): RustRendererBootstrapConfig {
  if (!RUNTIME_CONSOLE_ENABLED) return DEFAULT_BOOTSTRAP_CONFIG;
  return {
    ...DEFAULT_BOOTSTRAP_CONFIG,
    // [LAW:single-enforcer] Debug readback cadence is configured once at
    // renderer bootstrap when runtimeConsole diagnostics are enabled.
    debugReadbackHz: 6,
  };
}

function dumpShaderWithLineNumbers(name: string, wgsl: string): void {
  if (!shouldDumpRuntimeShaderPayload()) {
    return;
  }
  // [LAW:verifiable-goals] Runtime shader dumps include line numbers so
  // WebGPU validation line/column errors are directly traceable.
  console.groupCollapsed(`[runtimeConsole] Generated WGSL: ${name}`);
  console.info(formatWgslWithLineNumbers(wgsl));
  console.groupEnd();
}

function requireNonEmptyString(value: unknown, message: string): string {
  if (typeof value !== 'string') {
    throw new Error(message);
  }
  if (value.trim().length === 0) {
    throw new Error(message);
  }
  return value;
}

function requireGpuPassId(pass: RustRendererGpuPass, index: number): string {
  return requireNonEmptyString(
    pass.passId,
    `Rust renderer GPU pass contract violation: passes[${index}].passId is required`,
  );
}

function requireGpuPassEntryPoint(pass: RustRendererGpuPass, passId: string): string {
  return requireNonEmptyString(
    pass.entryPoint,
    `Rust renderer GPU pass contract violation: pass \"${passId}\" is missing entryPoint`,
  );
}

function requireGpuPassWgsl(pass: RustRendererGpuPass, passId: string): string {
  return requireNonEmptyString(
    pass.wgsl,
    `Rust renderer GPU pass contract violation: pass \"${passId}\" is missing WGSL source`,
  );
}

function hasGpuPassPayloads(passes: readonly RustRendererGpuPass[]): boolean {
  return passes.length > 0;
}

function createEmptyGpuPassBundleError(): Error {
  return new Error('Rust renderer GPU pass contract violation: pass bundle must contain at least one pass');
}

function normalizeGpuPassPayloads(passes: readonly RustRendererGpuPass[]): readonly RustRendererGpuPass[] {
  return passes.map((pass, index) => validateGpuPass(pass, index));
}

function buildValidatedGpuPassPayload(
  passId: string,
  entryPoint: string,
  wgsl: string,
): RustRendererGpuPass {
  return {
    passId,
    stage: 'compute',
    entryPoint,
    wgsl,
  };
}

function shouldDumpRuntimeShaderPayload(): boolean {
  return RUNTIME_CONSOLE_ENABLED;
}

/**
 * Transport-level GPU pass normalization.
 *
 * This renderer boundary intentionally validates only worker-transport safety:
 * - required identifiers are present and non-empty
 * - shader payload exists as non-empty text
 *
 * Semantic guarantees are established upstream at compile worker validation:
 * - stage contract correctness
 * - entrypoint/WGSL signature agreement
 * - bundle policy (duplicate IDs / fluid order)
 *
 * Keeping this boundary narrow avoids semantic policy drift between compiler
 * and renderer install paths.
 */
function validateGpuPass(pass: RustRendererGpuPass, index: number): RustRendererGpuPass {
  // [LAW:single-enforcer] Renderer enforces transport/runtime payload integrity
  // only; semantic pass-signature validation is owned by compile worker.
  const passId = requireGpuPassId(pass, index);
  const entryPoint = requireGpuPassEntryPoint(pass, passId);
  const wgsl = requireGpuPassWgsl(pass, passId);
  return buildValidatedGpuPassPayload(passId, entryPoint, wgsl);
}

/**
 * Bundle-level transport integrity guard.
 *
 * Renderer receives compile-validated pass bundles and only enforces that at
 * least one pass is present and each pass satisfies transport payload shape.
 * Compiler-side validation remains the single semantic authority.
 */
function validateGpuPassBundle(passes: readonly RustRendererGpuPass[]): readonly RustRendererGpuPass[] {
  // [LAW:single-enforcer] Renderer owns transport/runtime payload integrity
  // only; compile boundary owns semantic pass and bundle policy validation.
  if (!hasGpuPassPayloads(passes)) {
    throw createEmptyGpuPassBundleError();
  }
  return normalizeGpuPassPayloads(passes);
}

function isFiniteUint32Value(value: number): boolean {
  return Number.isFinite(value)
    && Number.isInteger(value)
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= MAX_UINT32;
}

function createUint32ContractError(context: string, value: number): Error {
  return new Error(`Rust renderer input contract violation: ${context} must be a uint32, got ${String(value)}`);
}

function assertFiniteUint32(value: number, context: string): number {
  if (!isFiniteUint32Value(value)) {
    throw createUint32ContractError(context, value);
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

function isIgnorableAckType(type: RustRendererWorkerOutboundMessage['type']): boolean {
  return type === 'SCHEDULER_HEARTBEAT' || type === 'RUNTIME_EVENT';
}

function toWorkerFailureDisposition(payload: RustRendererWorkerOutboundMessage): WorkerAckDisposition | null {
  if (payload.type === 'FATAL_ERROR') {
    return {
      kind: 'fail',
      error: new Error(`[${payload.code}] ${payload.message}`),
      fatal: true,
      code: payload.code,
      stage: 'WORKER',
      message: payload.message,
    };
  }
  if (payload.type === 'DEVICE_LOST') {
    return {
      kind: 'fail',
      error: new Error(`[${payload.code}] ${payload.reason}`),
      fatal: true,
      code: payload.code,
      stage: 'WORKER',
      message: payload.reason,
    };
  }
  if (payload.type === 'ENGINE_ERROR') {
    return {
      kind: 'fail',
      error: new Error(`[${payload.source}] ${payload.message}${payload.location ? ` @ ${payload.location}` : ''}`),
      fatal: payload.fatal,
      code: payload.source,
      stage: payload.location,
      message: payload.message,
    };
  }
  return null;
}

function buildWorkerProtocolViolation(
  expectedSuccessType: RustRendererWorkerOutboundMessage['type'],
  actualType: RustRendererWorkerOutboundMessage['type'],
): WorkerAckDisposition {
  return {
    kind: 'fail',
    fatal: true,
    code: 'WORKER_PROTOCOL_VIOLATION',
    stage: expectedSuccessType,
    message: `expected ${expectedSuccessType}, got ${actualType}`,
    error: new Error(
      `Rust renderer worker protocol violation: expected ${expectedSuccessType}, got ${actualType}`,
    ),
  };
}

function classifyWorkerAckMessage(
  payload: RustRendererWorkerOutboundMessage,
  expectedSuccessType: RustRendererWorkerOutboundMessage['type'],
): WorkerAckDisposition {
  if (payload.type === expectedSuccessType) {
    return { kind: 'success' };
  }
  if (isIgnorableAckType(payload.type)) {
    return { kind: 'ignore' };
  }
  const workerFailure = toWorkerFailureDisposition(payload);
  if (workerFailure) {
    return workerFailure;
  }
  // [LAW:single-enforcer] Ack message classification happens in one helper so
  // all await paths share identical non-success handling.
  return buildWorkerProtocolViolation(expectedSuccessType, payload.type);
}


export function assertWebGPUStartupContract(canvas: HTMLCanvasElement): void {
  const gpu = getNavigatorGpu();
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
  private fatalRecord: RendererFatalRecord | null = null;
  private lastResizeWidth = -1;
  private lastResizeHeight = -1;
  private latestTelemetry: RustRendererRuntimeTelemetry | null = null;
  private lifecycleState: RustRendererSchedulerState = 'Booting';
  private latestRuntimeEvent: RuntimeEventBreadcrumb | null = null;
  private lastInstalledPassIds: readonly string[] = [];
  private latestSinkTableSample: SinkTableDebugSample | null = null;
  private renderInputDebugLogged = false;
  private installRevision = 0;
  // TODO(#159): Move debug cadence state out of renderer core state.
  // This counter is only for runtimeConsole sampling throttle and should live
  // with debug emitter ownership, not render execution ownership.
  // https://github.com/brandon-fryslie/oscilla-animator-v2/issues/159
  private sinkTableDebugLogCounter = 0;
  private readonly emittedHealthWarningCodes = new Set<string>();

  private reportEngineError(
    source: string,
    message: string,
    location: string,
    fatal: boolean,
  ): void {
    const level = fatal ? 'error' : 'warn';
    reportRenderIssue(
      level,
      `[${source}] ${message}${location ? ` @ ${location}` : ''}`,
      {
        kind: 'engineError',
        source,
        message,
        location,
        fatal,
      },
    );
  }

  private buildFatalTransition(transition: RendererFatalTransition): RendererFatalTransition {
    return transition;
  }

  private buildBracketedError(code: string, message: string, location?: string): Error {
    return new Error(`[${code}] ${message}${location ? ` @ ${location}` : ''}`);
  }

  private buildAckTimeoutFatalTransition(context: string, error: Error): RendererFatalTransition {
    return this.buildFatalTransition({
      code: 'WORKER_ACK_TIMEOUT',
      stage: context,
      message: error.message,
      timestamp: performance.now(),
      cause: error,
      terminationPolicy: 'terminate-worker',
    });
  }

  private buildAckFailureFatalTransition(
    disposition: Extract<WorkerAckDisposition, { kind: 'fail'; fatal: boolean }>,
  ): RendererFatalTransition {
    return this.buildFatalTransition({
      code: disposition.code,
      stage: disposition.stage,
      message: disposition.message,
      timestamp: performance.now(),
      cause: disposition.error,
      terminationPolicy: 'keep-worker-alive',
    });
  }

  private buildWorkerErrorFatalTransition(context: string, message: string): RendererFatalTransition {
    return this.buildFatalTransition({
      code: 'WORKER_ERROR',
      stage: context,
      message,
      timestamp: performance.now(),
      cause: new Error(message),
      terminationPolicy: 'keep-worker-alive',
    });
  }

  private buildEngineFatalTransition(
    payload: Extract<RustRendererWorkerOutboundMessage, { type: 'ENGINE_ERROR' }>,
  ): RendererFatalTransition {
    return this.buildFatalTransition({
      code: payload.source,
      stage: payload.location,
      message: payload.message,
      timestamp: performance.now(),
      cause: this.buildBracketedError(payload.source, payload.message, payload.location),
      terminationPolicy: 'keep-worker-alive',
    });
  }

  private buildFatalErrorTransition(
    payload: Extract<RustRendererWorkerOutboundMessage, { type: 'FATAL_ERROR' }>,
  ): RendererFatalTransition {
    return this.buildFatalTransition({
      code: payload.code,
      stage: 'WORKER',
      message: payload.message,
      timestamp: performance.now(),
      cause: this.buildBracketedError(payload.code, payload.message),
      terminationPolicy: 'keep-worker-alive',
    });
  }

  private buildDeviceLostTransition(
    payload: Extract<RustRendererWorkerOutboundMessage, { type: 'DEVICE_LOST' }>,
  ): RendererFatalTransition {
    return this.buildFatalTransition({
      code: payload.code,
      stage: 'WORKER',
      message: payload.reason,
      timestamp: performance.now(),
      cause: this.buildBracketedError(payload.code, payload.reason),
      terminationPolicy: 'keep-worker-alive',
    });
  }

  private buildRuntimeEventFatalTransition(
    payload: Extract<RustRendererWorkerOutboundMessage, { type: 'RUNTIME_EVENT' }>,
  ): RendererFatalTransition {
    return this.buildFatalTransition({
      code: payload.code,
      stage: payload.stage,
      message: payload.message,
      timestamp: payload.emittedAtMs,
      cause: this.buildBracketedError(payload.code, payload.message),
      terminationPolicy: 'keep-worker-alive',
    });
  }

  private markRendererFatal(transition: RendererFatalTransition): Error {
    // [LAW:single-enforcer] Fatal transition mutation, record ownership, and
    // terminal issue emission are enforced at one boundary helper.
    const existingRecord = this.fatalRecord;
    if (existingRecord !== null) {
      if (transition.terminationPolicy === 'terminate-worker') {
        this.worker.terminate();
      }
      return existingRecord.cause;
    }
    const fatalRecord: RendererFatalRecord = {
      code: transition.code,
      stage: transition.stage,
      message: transition.message,
      timestamp: transition.timestamp,
      cause: transition.cause,
    };
    // [LAW:one-source-of-truth] Renderer fatal record is persisted once and
    // reused for all post-fatal behavior.
    this.fatalRecord = fatalRecord;
    this.lifecycleState = 'Lost';
    this.fatalError = fatalRecord.cause;
    reportRenderIssue('error', `[${fatalRecord.code}] ${fatalRecord.message}`, {
      kind: 'rendererFatal',
      code: fatalRecord.code,
      stage: fatalRecord.stage,
      message: fatalRecord.message,
      timestamp: fatalRecord.timestamp,
      cause: fatalRecord.cause,
    });
    if (transition.terminationPolicy === 'terminate-worker') {
      this.worker.terminate();
    }
    return fatalRecord.cause;
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
    this.assertRuntimeInputBoundaryReady();
    if (!(input.drawPrepSinkTableV1 instanceof Uint32Array)) {
      throw new Error('Rust renderer input contract violation: drawPrepSinkTableV1 must be Uint32Array');
    }
    this.writeViewportFrame(input);
    const shapeBankWords = this.syncShapeBankPlane(input.shapeBank);
    const sinkTableWords = this.syncSinkTablePlane(
      input.drawPrepSinkTableV1,
      input.drawPrepSinkTableWordCount,
    );
    this.maybeEmitRenderInputDebugSample(input.drawPrepSinkTableV1, sinkTableWords);
    this.setSinkAndShapeWordCounts(sinkTableWords, shapeBankWords);
    this.bumpInstallRevision();
    this.publishSignalWord();
  }

  private maybeEmitRenderInputDebugSample(sinkTableWords: Uint32Array, wordCount: number): void {
    if (!RUNTIME_CONSOLE_ENABLED || this.renderInputDebugLogged || wordCount <= 0) {
      return;
    }
    this.renderInputDebugLogged = true;
    const sample = this.buildSinkTableDebugSample(sinkTableWords, wordCount);
    this.latestSinkTableSample = sample;
    console.info(`[runtimeConsole] ${JSON.stringify({ kind: 'render-input-sample', ...sample })}`);
  }

  setViewportFrame(frame: RuntimeViewportFrame): void {
    this.assertRuntimeInputBoundaryReady();
    // [LAW:single-enforcer] Runtime viewport/input publication enters the
    // renderer worker through one boundary method in canonical execution.
    this.writeViewportFrame(frame);
    this.publishSignalWord();
  }

  resizeCanvas(width: number, height: number): void {
    this.assertRuntimeInputBoundaryReady();
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
    const message = this.createShutdownMessage();
    this.tryPostWorkerMessage(
      message,
      'Failed to post SHUTDOWN message; worker may already be terminated.',
    );
    this.tryTerminateWorker(
      'Failed to terminate worker during dispose; worker may already be terminated.',
    );
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
    // [LAW:single-enforcer] Renderer validates transport/runtime payload shape;
    // semantic pass signatures are already validated at compile worker boundary.
    const validatedPasses = [...validateGpuPassBundle(passes)];
    for (const pass of validatedPasses) {
      dumpShaderWithLineNumbers(pass.passId, pass.wgsl);
    }
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
      if (!this.fatalError) {
        this.worker.postMessage({ type: 'RESUME' } satisfies RustRendererWorkerInboundMessage);
      }
    }
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

  private throwIfFatalError(): void {
    if (this.fatalError) {
      throw this.fatalError;
    }
  }

  private throwIfDisposed(): void {
    if (this.disposed) {
      throw new Error('Rust renderer has been disposed');
    }
  }

  private throwIfNotBootstrapped(): void {
    if (!this.bootstrapped) {
      throw new Error('Rust renderer worker is not bootstrapped');
    }
  }

  private setInputWord(index: number, value: number): void {
    this.inputWords[index] = value;
  }

  private publishSignalWord(): void {
    Atomics.add(this.signalWords, 0, 1);
  }

  private setSinkAndShapeWordCounts(sinkTableWords: number, shapeBankWords: number): void {
    this.setInputWord(RUNTIME_INPUT_INDEX.sinkTableWords, sinkTableWords);
    this.setInputWord(RUNTIME_INPUT_INDEX.shapeBankWords, shapeBankWords);
  }

  private bumpInstallRevision(): void {
    // [LAW:single-enforcer] Install-plane publication is versioned through one
    // monotonic word so worker-side plane sync runs only on explicit installs.
    this.installRevision = (this.installRevision + 1) >>> 0;
    this.setInputWord(RUNTIME_INPUT_INDEX.installRevision, this.installRevision);
  }

  private createResizeCanvasMessage(width: number, height: number): RustRendererWorkerInboundMessage {
    return {
      type: 'RESIZE_CANVAS',
      width,
      height,
    };
  }

  private createShutdownMessage(): RustRendererWorkerInboundMessage {
    return { type: 'SHUTDOWN' };
  }

  private postWorkerMessage(message: RustRendererWorkerInboundMessage): void {
    this.worker.postMessage(message);
  }

  private tryPostWorkerMessage(message: RustRendererWorkerInboundMessage, warningMessage: string): void {
    try {
      this.postWorkerMessage(message);
    } catch (error) {
      this.warnWorkerLifecycleBoundary(warningMessage, error);
    }
  }

  private tryTerminateWorker(warningMessage: string): void {
    try {
      this.worker.terminate();
    } catch (error) {
      this.warnWorkerLifecycleBoundary(warningMessage, error);
    }
  }

  private warnWorkerLifecycleBoundary(message: string, error: unknown): void {
    if (!RUNTIME_CONSOLE_ENABLED) {
      return;
    }
    console.warn(`[RustWasmWebGPURenderer] ${message}`, error);
  }

  private isCanvasSizeUnchanged(width: number, height: number): boolean {
    return width === this.lastResizeWidth && height === this.lastResizeHeight;
  }

  private hasDispatchCountMismatch(
    telemetry: RustRendererRuntimeTelemetry['dispatchCounters'],
    expectedDispatchCount: number | null,
  ): boolean {
    return expectedDispatchCount !== null
      && telemetry.computeDispatchCount !== expectedDispatchCount;
  }

  private hasSinkWordsButNoInstances(
    telemetry: RustRendererRuntimeTelemetry['resourceStats'],
  ): boolean {
    return telemetry.sinkTableWordCount > 0
      && telemetry.totalInstanceCount === 0;
  }

  private hasZeroTotalFrameWithDispatches(
    stageTimings: RustRendererRuntimeTelemetry['stageTimings'],
    dispatchCounters: RustRendererRuntimeTelemetry['dispatchCounters'],
  ): boolean {
    return stageTimings.totalFrameMs === 0
      && dispatchCounters.computeDispatchCount > 0;
  }

  private assertRuntimeInputBoundaryReady(): void {
    this.throwIfFatalError();
    this.throwIfDisposed();
    this.throwIfNotBootstrapped();
  }

  private writeViewportFrame(input: RuntimeViewportFrame): void {
    // [LAW:dataflow-not-control-flow] Runtime frame publication always executes
    // in the same order; contract validation fails fast at the boundary.
    const width = assertPositiveCanvasDimension(input.width, 'width');
    const height = assertPositiveCanvasDimension(input.height, 'height');
    const zoom = assertFiniteRuntimeInput(input.zoom, 'zoom');
    if (zoom <= 0) {
      throw new Error(`Rust renderer input contract violation: zoom must be positive, got ${zoom}`);
    }
    const panX = assertFiniteRuntimeInput(input.panX, 'panX');
    const panY = assertFiniteRuntimeInput(input.panY, 'panY');
    const timeMs = assertFiniteRuntimeInput(input.timeMs, 'timeMs');
    const inputMouseX = assertFiniteRuntimeInput(input.inputMouseX, 'inputMouseX');
    const inputMouseY = assertFiniteRuntimeInput(input.inputMouseY, 'inputMouseY');
    const inputMouseButtons = assertFiniteRuntimeInput(input.inputMouseButtons, 'inputMouseButtons');
    const inputAudioLow = assertFiniteRuntimeInput(input.inputAudioLow, 'inputAudioLow');
    const inputAudioMid = assertFiniteRuntimeInput(input.inputAudioMid, 'inputAudioMid');
    const inputAudioHigh = assertFiniteRuntimeInput(input.inputAudioHigh, 'inputAudioHigh');
    const inputGaugeActive = assertFiniteRuntimeInput(input.inputGaugeActive, 'inputGaugeActive');

    this.syncCanvasSize(width, height);
    this.setInputWord(RUNTIME_INPUT_INDEX.width, width);
    this.setInputWord(RUNTIME_INPUT_INDEX.height, height);
    this.setInputWord(RUNTIME_INPUT_INDEX.zoom, zoom);
    this.setInputWord(RUNTIME_INPUT_INDEX.panX, panX);
    this.setInputWord(RUNTIME_INPUT_INDEX.panY, panY);
    this.setInputWord(RUNTIME_INPUT_INDEX.timeMs, timeMs);
    this.setInputWord(RUNTIME_INPUT_INDEX.mouseX, inputMouseX);
    this.setInputWord(RUNTIME_INPUT_INDEX.mouseY, inputMouseY);
    this.setInputWord(RUNTIME_INPUT_INDEX.mouseButtons, inputMouseButtons);
    this.setInputWord(RUNTIME_INPUT_INDEX.audioLow, inputAudioLow);
    this.setInputWord(RUNTIME_INPUT_INDEX.audioMid, inputAudioMid);
    this.setInputWord(RUNTIME_INPUT_INDEX.audioHigh, inputAudioHigh);
    this.setInputWord(RUNTIME_INPUT_INDEX.gaugeActive, inputGaugeActive);
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

  private syncSinkTablePlane(sinkTableWords: Uint32Array, sinkTableWordCount: number): number {
    const wordCount = assertFiniteUint32(sinkTableWordCount, 'drawPrepSinkTableWordCount');
    if (wordCount === 0) {
      return 0;
    }
    this.assertSinkTableInputCapacity(sinkTableWords, wordCount);
    this.sharedSinkTableWords.set(sinkTableWords.subarray(0, wordCount), 0);
    this.maybeCaptureSinkTableDebugSample(sinkTableWords, wordCount);
    return wordCount;
  }

  private assertSinkTableInputCapacity(sinkTableWords: Uint32Array, wordCount: number): void {
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
  }

  private maybeCaptureSinkTableDebugSample(sinkTableWords: Uint32Array, wordCount: number): void {
    if (!RUNTIME_CONSOLE_ENABLED) {
      return;
    }
    this.sinkTableDebugLogCounter += 1;
    if ((this.sinkTableDebugLogCounter % 120) !== 1) {
      return;
    }
    const sample = this.buildSinkTableDebugSample(sinkTableWords, wordCount);
    this.latestSinkTableSample = sample;
    this.emitSinkTableDebugSample(sample);
  }

  private buildSinkTableDebugSample(sinkTableWords: Uint32Array, wordCount: number): SinkTableDebugSample {
    const headerWords = 8;
    const recordWords = 8;
    const descriptorWords = 20;
    const totalRecords = readRequiredSinkTableWord(
      sinkTableWords,
      wordCount,
      1,
      'sink-table-sample.totalRecords',
    );
    const firstRecord = this.buildSinkTableFirstRecord(sinkTableWords, wordCount, totalRecords, headerWords);
    const descriptorBase = headerWords + totalRecords * recordWords;
    const hasFirstDescriptor = totalRecords > 0 && wordCount >= descriptorBase + descriptorWords;
    const firstDescriptor = hasFirstDescriptor
      ? {
          positionBaseOffset: readRequiredSinkTableWord(
            sinkTableWords,
            wordCount,
            descriptorBase + 0,
            'sink-table-sample.firstDescriptor.positionBaseOffset',
          ),
          positionLaneStride: readRequiredSinkTableWord(
            sinkTableWords,
            wordCount,
            descriptorBase + 1,
            'sink-table-sample.firstDescriptor.positionLaneStride',
          ),
          positionComponentStride: readRequiredSinkTableWord(
            sinkTableWords,
            wordCount,
            descriptorBase + 2,
            'sink-table-sample.firstDescriptor.positionComponentStride',
          ),
          colorBaseOffset: readRequiredSinkTableWord(
            sinkTableWords,
            wordCount,
            descriptorBase + 3,
            'sink-table-sample.firstDescriptor.colorBaseOffset',
          ),
          colorLaneStride: readRequiredSinkTableWord(
            sinkTableWords,
            wordCount,
            descriptorBase + 4,
            'sink-table-sample.firstDescriptor.colorLaneStride',
          ),
          colorComponentStride: readRequiredSinkTableWord(
            sinkTableWords,
            wordCount,
            descriptorBase + 5,
            'sink-table-sample.firstDescriptor.colorComponentStride',
          ),
          scaleBaseOffset: readRequiredSinkTableWord(
            sinkTableWords,
            wordCount,
            descriptorBase + 6,
            'sink-table-sample.firstDescriptor.scaleBaseOffset',
          ),
          scaleLaneStride: readRequiredSinkTableWord(
            sinkTableWords,
            wordCount,
            descriptorBase + 7,
            'sink-table-sample.firstDescriptor.scaleLaneStride',
          ),
          scaleComponentStride: readRequiredSinkTableWord(
            sinkTableWords,
            wordCount,
            descriptorBase + 8,
            'sink-table-sample.firstDescriptor.scaleComponentStride',
          ),
        }
      : null;
    return {
      sinkTableWordCount: wordCount,
      totalRecords,
      firstRecord,
      firstDescriptor,
    };
  }

  private buildSinkTableFirstRecord(
    sinkTableWords: Uint32Array,
    wordCount: number,
    totalRecords: number,
    firstRecordBase: number,
  ): SinkTableDebugSample['firstRecord'] {
    const recordWords = 8;
    const hasFirstRecord = totalRecords > 0 && wordCount >= firstRecordBase + recordWords;
    if (!hasFirstRecord) {
      return null;
    }
    return {
      drawModeCode: readRequiredSinkTableWord(
        sinkTableWords,
        wordCount,
        firstRecordBase + 0,
        'sink-table-sample.firstRecord.drawModeCode',
      ),
      count: readRequiredSinkTableWord(
        sinkTableWords,
        wordCount,
        firstRecordBase + 1,
        'sink-table-sample.firstRecord.count',
      ),
      instanceCount: readRequiredSinkTableWord(
        sinkTableWords,
        wordCount,
        firstRecordBase + 2,
        'sink-table-sample.firstRecord.instanceCount',
      ),
      first: readRequiredSinkTableWord(
        sinkTableWords,
        wordCount,
        firstRecordBase + 3,
        'sink-table-sample.firstRecord.first',
      ),
      baseVertex: readRequiredSinkTableWord(
        sinkTableWords,
        wordCount,
        firstRecordBase + 4,
        'sink-table-sample.firstRecord.baseVertex',
      ),
      firstInstance: readRequiredSinkTableWord(
        sinkTableWords,
        wordCount,
        firstRecordBase + 5,
        'sink-table-sample.firstRecord.firstInstance',
      ),
      shapeWordOffset: readRequiredSinkTableWord(
        sinkTableWords,
        wordCount,
        firstRecordBase + 6,
        'sink-table-sample.firstRecord.shapeWordOffset',
      ),
      materialId: readRequiredSinkTableWord(
        sinkTableWords,
        wordCount,
        firstRecordBase + 7,
        'sink-table-sample.firstRecord.materialId',
      ),
    };
  }

  private emitSinkTableDebugSample(sample: SinkTableDebugSample): void {
    // TODO(#159): Replace this inline payload emission with a dedicated debug
    // emitter helper module and keep render hot path free of debug policy.
    // [LAW:locality-or-seam] Renderer execution should not own debug payload
    // transport and cadence policy details.
    // https://github.com/brandon-fryslie/oscilla-animator-v2/issues/159
    console.info(
      `[runtimeConsole] ${JSON.stringify({
        kind: 'sink-table-sample',
        wordCount: sample.sinkTableWordCount,
        totalRecords: sample.totalRecords,
        firstRecord: sample.firstRecord,
        firstDescriptor: sample.firstDescriptor,
      })}`,
    );
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
          const fatalError = this.markRendererFatal(
            this.buildAckTimeoutFatalTransition(options.context, error),
          );
          reject(fatalError);
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
          if (disposition.fatal) {
            const fatalError = this.markRendererFatal(
              this.buildAckFailureFatalTransition(disposition),
            );
            reject(fatalError);
            return;
          }
          reject(disposition.error);
        });
      };
      const onError = (event: ErrorEvent): void => {
        settle(() => {
          const message = event.message || `Rust renderer worker crashed during ${options.context}`;
          const fatalError = this.markRendererFatal(
            this.buildWorkerErrorFatalTransition(options.context, message),
          );
          reject(fatalError);
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
    if (this.hasDispatchCountMismatch(telemetry.dispatchCounters, expectedDispatchCount)) {
      this.emitRuntimeHealthWarning('dispatch_count_mismatch', {
        installedPassCount,
        expectedDispatchCount,
        observedDispatchCount: telemetry.dispatchCounters.computeDispatchCount,
      });
    }
    if (this.hasSinkWordsButNoInstances(telemetry.resourceStats)) {
      this.emitRuntimeHealthWarning('sink_nonzero_with_zero_instances', {
        sinkTableWordCount: telemetry.resourceStats.sinkTableWordCount,
        totalInstanceCount: telemetry.resourceStats.totalInstanceCount,
      });
    }
    if (this.hasZeroTotalFrameWithDispatches(telemetry.stageTimings, telemetry.dispatchCounters)) {
      this.emitRuntimeHealthWarning('zero_total_frame_with_dispatches', {
        totalFrameMs: telemetry.stageTimings.totalFrameMs,
        computeDispatchCount: telemetry.dispatchCounters.computeDispatchCount,
      });
    }
  }

  private syncCanvasSize(width: number, height: number): void {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    if (this.isCanvasSizeUnchanged(safeWidth, safeHeight)) {
      return;
    }
    this.lastResizeWidth = safeWidth;
    this.lastResizeHeight = safeHeight;
    const message = this.createResizeCanvasMessage(safeWidth, safeHeight);
    this.postWorkerMessage(message);
  }

  private shouldIgnoreRuntimeMessage(
    payload: RustRendererWorkerOutboundMessage,
  ): boolean {
    return this.fatalRecord !== null && (payload.type === 'SCHEDULER_HEARTBEAT' || payload.type === 'RUNTIME_EVENT');
  }

  private handleEngineErrorMessage(
    payload: Extract<RustRendererWorkerOutboundMessage, { type: 'ENGINE_ERROR' }>,
  ): void {
    this.reportEngineError(payload.source, payload.message, payload.location, payload.fatal);
    if (payload.fatal) {
      this.markRendererFatal(this.buildEngineFatalTransition(payload));
    }
  }

  private handleRuntimeEventMessage(
    payload: Extract<RustRendererWorkerOutboundMessage, { type: 'RUNTIME_EVENT' }>,
  ): void {
    this.latestRuntimeEvent = {
      severity: payload.severity,
      code: payload.code,
      stage: payload.stage,
      message: payload.message,
      emittedAtMs: payload.emittedAtMs,
    };
    if (payload.severity === 'fatal') {
      this.markRendererFatal(this.buildRuntimeEventFatalTransition(payload));
    }
  }

  private handleFatalErrorMessage(
    payload: Extract<RustRendererWorkerOutboundMessage, { type: 'FATAL_ERROR' }>,
  ): void {
    this.reportEngineError(payload.code, payload.message, 'WORKER', true);
    this.markRendererFatal(this.buildFatalErrorTransition(payload));
  }

  private handleDeviceLostMessage(
    payload: Extract<RustRendererWorkerOutboundMessage, { type: 'DEVICE_LOST' }>,
  ): void {
    this.reportEngineError(payload.code, payload.reason, 'WORKER', true);
    this.markRendererFatal(this.buildDeviceLostTransition(payload));
  }

  private handleSchedulerHeartbeatMessage(
    payload: Extract<RustRendererWorkerOutboundMessage, { type: 'SCHEDULER_HEARTBEAT' }>,
  ): void {
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

  private readonly handleRuntimeMessage = (event: MessageEvent<RustRendererWorkerOutboundMessage>): void => {
    const payload = event.data;
    if (!payload) return;
    if (this.shouldIgnoreRuntimeMessage(payload)) {
      return;
    }
    if (payload.type === 'ENGINE_ERROR') {
      this.handleEngineErrorMessage(payload);
      return;
    }
    if (payload.type === 'FATAL_ERROR') {
      this.handleFatalErrorMessage(payload);
      return;
    }
    if (payload.type === 'DEVICE_LOST') {
      this.handleDeviceLostMessage(payload);
      return;
    }
    if (payload.type === 'RUNTIME_EVENT') {
      this.handleRuntimeEventMessage(payload);
      return;
    }
    if (payload.type === 'SCHEDULER_HEARTBEAT') {
      this.handleSchedulerHeartbeatMessage(payload);
    }
  };
}

export async function createWebGPURenderer(canvas: HTMLCanvasElement): Promise<WebGPURenderer> {
  // [LAW:no-silent-fallbacks] WebGPU renderer creation is hard-fail only.
  // No legacy renderer path is allowed once worker+Rust cutover is selected.
  return WebGPURenderer.create(canvas);
}
