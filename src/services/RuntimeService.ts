/**
 * RuntimeService — Owns All Runtime Lifecycle
 *
 * Extracts everything that was scattered across main.ts module-level state:
 * compile orchestrator state, animation loop, canvas refs, persistence,
 * live recompile wiring, and debug probe setup.
 *
 * [LAW:one-source-of-truth] Single owner of runtime mutable state.
 * [LAW:single-enforcer] Single place that wires compile + animation + persistence.
 */

import {
  createWebGPURenderer,
  assertWebGPUStartupContract,
  type WebGPURenderer,
  type GpuFault,
  type WebGPURendererExecutionState,
  RenderBufferArena,
  setRenderIssueReporter,
  getRenderIssues,
  clearRenderIssues,
} from '../render';
import type { RootStore } from '../stores';
import { runInAction } from 'mobx';
import {
  clearPatchFromStorage,
  loadPatchFromStorage,
  savePatchToStorage,
} from './PatchPersistence';
import { consumeTestDemoFilename } from '../testing/test-params';
import {
  markRuntimeBootstrapFailed,
  markRuntimeBootstrapStarted,
  markRuntimeBootstrapSucceeded,
} from '../testing/runtime-probe';
import {
  compileAndSwap,
  type CompileOrchestratorState,
} from './CompileOrchestrator';
import { CompileWorkerClient, type CompileWorkerRunRequest } from './CompileWorkerClient';
import { createDomainChangeDetector, type DomainChangeDetector } from './DomainChangeDetector';
import { createLiveRecompileController, type LiveRecompileController } from './LiveRecompile';
import { debugService } from './DebugService';
import { compilationInspector } from './CompilationInspectorService';
import { AsyncCompilerService, type AsyncCompilerState } from './AsyncCompilerService';
import {
  startAnimationLoop,
  createAnimationLoopState,
  type ActiveAnimationLoopRuntime,
  type AnimationLoopDeps,
  type AnimationLoopController,
  type AnimationLoopState,
} from './AnimationLoop';
import { debugSettings } from '../settings/tokens/debug-settings';
import { compilerFlagsSettings } from '../settings/tokens/compiler-flags-settings';
import { appSettings } from '../settings/tokens/app-settings';
import type { ValueSlot } from '../types';
import {
  DEBUG_PACKET_FLAG_NAN_DETECTED_ANY,
  type DebugProbePacketSample,
  type DebugProbeTransport,
} from './DebugProbeProtocol';
import { LocalDebugProbeTransport } from './LocalDebugProbeTransport';
import { createWasmDebugProbeTransport } from './WasmDebugProbeTransport';
import type { CompiledGpuArtifactBundle } from './compile-worker-protocol';
import { shaderInspector } from './ShaderInspectorService';
import {
  deriveRendererExecutionStateFromGpuFault,
  shouldClearStoredStartupPatch,
  type StartupRestoreSource,
} from './runtime-gpu-fault-policy';

const INITIAL_COMPILE_FAILURE_PROBE_MESSAGE =
  'initial_compile_failed: animation loop started but no program is ready';
const STARTUP_STORAGE_RESET_ARM_MS = 10_000;

type StatsSink = (statsText: string) => void;
type RuntimeReadySink = () => void;

export interface RawRuntimeServiceOptions {
  readonly onStatsUpdate?: StatsSink;
  readonly onRuntimeReady?: RuntimeReadySink;
}

interface RuntimeServiceOptions {
  readonly onStatsUpdate: StatsSink;
  readonly onRuntimeReady: RuntimeReadySink;
}

interface CompilerServices {
  readonly client: CompileWorkerClient;
  readonly compiler: AsyncCompilerService;
  readonly unsubscribeCompilerState: () => void;
}

type RuntimeCanvasState =
  | { readonly kind: 'missing' }
  | { readonly kind: 'ready'; readonly canvas: HTMLCanvasElement };

type RuntimeResourcesState =
  | { readonly kind: 'inactive' }
  | { readonly kind: 'bootstrapping'; readonly canvas: HTMLCanvasElement }
  | { readonly kind: 'active'; readonly runtime: ActiveAnimationLoopRuntime }
  | {
    readonly kind: 'faulted';
    readonly canvas: HTMLCanvasElement;
    readonly arena: RenderBufferArena;
    readonly fault: GpuFault;
  }
  | { readonly kind: 'disposed' };

type CompilerServicesState =
  | { readonly kind: 'inactive' }
  | { readonly kind: 'active'; readonly services: CompilerServices };

const noopStatsSink: StatsSink = () => {};
const noopRuntimeReadySink: RuntimeReadySink = () => {};

function normalizeRuntimeServiceOptions(raw: RawRuntimeServiceOptions): RuntimeServiceOptions {
  return {
    onStatsUpdate: raw.onStatsUpdate ?? noopStatsSink,
    onRuntimeReady: raw.onRuntimeReady ?? noopRuntimeReadySink,
  };
}

function describeFatalGpuFault(fault: GpuFault): string {
  return fault.source === 'CIRCUIT_BREAKER'
    ? 'Rendering stopped by the WebGPU circuit breaker to protect the system.'
    : `Fatal GPU fault [${fault.source}/${fault.code}] stopped rendering. Patch and editor state were preserved.`;
}

export interface RuntimeSpyReadbackEntry {
  readonly slotId: ValueSlot;
  readonly value: number;
}

export interface RuntimeSpyReadbackPacket {
  readonly capturedAtMs: number;
  readonly frameId: number;
  readonly packetFlags: number;
  readonly entries: readonly RuntimeSpyReadbackEntry[];
  readonly samples: readonly DebugProbePacketSample[];
}

function isCompileWorkerUnavailableError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const lowered = message.toLowerCase();
  return lowered.includes('failed to construct') ||
    lowered.includes('worker is not defined') ||
    lowered.includes('module workers are not supported') ||
    lowered.includes('securityerror');
}

export class RuntimeService {
  private readonly domainChangeDetector: DomainChangeDetector = createDomainChangeDetector();

  readonly compileState: CompileOrchestratorState = {
    currentProgram: null,
    currentState: null,
    sessionState: null,
  };

  private animationState: AnimationLoopState = createAnimationLoopState();
  private canvasState: RuntimeCanvasState = { kind: 'missing' };
  private runtimeResourcesState: RuntimeResourcesState = { kind: 'inactive' };

  private animationLoop: AnimationLoopController | null = null;
  private unsubCompileEnd: (() => void) | null = null;
  private compilerServicesState: CompilerServicesState = { kind: 'inactive' };
  private swapInFlight = false;
  private swapRafId: number | null = null;
  // [LAW:one-source-of-truth] Swap mode is carried by one flag that is
  // consumed by the next successful artifact application.
  private nextSwapIsInitial = false;
  private lastWorkerFallbackLog = { message: '', atMs: 0 };
  private compileWorkerUnavailableLogged = false;
  private readonly liveRecompile: LiveRecompileController = createLiveRecompileController();
  private statsSink: StatsSink;
  private runtimeReadySink: RuntimeReadySink;
  private unsubSpyTracking: (() => void) | null = null;
  private spyReadbackTimer: ReturnType<typeof setTimeout> | null = null;
  private spyReadbackLoopActive = false;
  private spyReadbackInFlight = false;
  private spyReadbackHz = 5;
  private debugProbeTransport: DebugProbeTransport;
  private debugProbeUpgradeInFlight: Promise<void> | null = null;
  private spyReadbackAnomalyFrameId: number | null = null;
  private readonly spyReadbackAnomalyKeysForFrame = new Set<string>();
  private startupRestoreSource: StartupRestoreSource = 'none';
  private startupStorageResetArmed = false;
  private startupStorageResetTimer: ReturnType<typeof setTimeout> | null = null;
  private rendererExecutionState: WebGPURendererExecutionState = 'active';

  constructor(
    private readonly store: RootStore,
    rawOptions: RawRuntimeServiceOptions = {}
  ) {
    const options = normalizeRuntimeServiceOptions(rawOptions);
    this.statsSink = options.onStatsUpdate;
    this.runtimeReadySink = options.onRuntimeReady;
    this.debugProbeTransport = new LocalDebugProbeTransport(() => ({
      program: this.compileState.currentProgram,
      state: this.compileState.currentState,
    }));
    this.debugProbeTransport.debugCommand({
      kind: 'set_rate_hz',
      rateHz: this.spyReadbackHz,
    });
  }

  setStatsSink(onStatsUpdate: StatsSink): void {
    // [LAW:no-shared-mutable-globals] RuntimeService owns the stats sink
    // explicitly; no ambient window callback is used.
    this.statsSink = onStatsUpdate;
  }

  setRuntimeReadySink(onRuntimeReady: RuntimeReadySink): void {
    // [LAW:no-shared-mutable-globals] Runtime-ready notifications are pushed
    // through explicit ownership callbacks, never window globals.
    this.runtimeReadySink = onRuntimeReady;
  }

  private requireCanvas(): HTMLCanvasElement {
    if (this.canvasState.kind !== 'ready') {
      throw new Error('RuntimeService: preview canvas is required before initialization');
    }
    return this.canvasState.canvas;
  }

  private readActiveRuntimeResources(): ActiveAnimationLoopRuntime | null {
    return this.runtimeResourcesState.kind === 'active'
      ? this.runtimeResourcesState.runtime
      : null;
  }

  private requireActiveRuntimeResources(context: string): ActiveAnimationLoopRuntime {
    const runtime = this.readActiveRuntimeResources();
    if (!runtime) {
      throw new Error(`RuntimeService: active runtime resources are required before ${context}`);
    }
    return runtime;
  }

  private activateRuntimeResources(runtime: ActiveAnimationLoopRuntime): void {
    this.runtimeResourcesState = {
      kind: 'active',
      runtime,
    };
  }

  private setCompilerServices(services: CompilerServices): void {
    this.compilerServicesState = {
      kind: 'active',
      services,
    };
  }

  private readCompilerServices(): CompilerServices | null {
    return this.compilerServicesState.kind === 'active'
      ? this.compilerServicesState.services
      : null;
  }

  private requireCompilerServices(context: string): CompilerServices {
    const services = this.readCompilerServices();
    if (!services) {
      throw new Error(`RuntimeService: compiler services are required before ${context}`);
    }
    return services;
  }

  private readMatchingCompilerServices(services: CompilerServices | null): CompilerServices | null {
    const activeServices = this.readCompilerServices();
    return activeServices === services ? activeServices : null;
  }

  private logWorkerFailure(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    const now = performance.now();
    const unchanged = this.lastWorkerFallbackLog.message === message;
    const withinWindow = now - this.lastWorkerFallbackLog.atMs < 2000;
    if (unchanged && withinWindow) return;

    this.lastWorkerFallbackLog = { message, atMs: now };
    // [LAW:no-silent-fallbacks] Worker compile failures must surface as
    // explicit diagnostics; this runtime does not support silent fallback.
    if (isCompileWorkerUnavailableError(err)) {
      if (this.compileWorkerUnavailableLogged) return;
      this.compileWorkerUnavailableLogged = true;
      this.store.diagnostics.log({
        level: 'error',
        message: `Async compile unavailable: Web Workers are required but could not be started (${message}). This platform/runtime is unsupported for compilation.`,
      });
      return;
    }

    this.store.diagnostics.log({
      level: 'error',
      message: `Async compile failed in worker: ${message}`,
    });
  }

  private compileDeps() {
    return {
      store: this.store,
      state: this.compileState,
      onDomainChange: (oldProg: NonNullable<typeof this.compileState.currentProgram>, newProg: NonNullable<typeof this.compileState.currentProgram>) =>
        this.domainChangeDetector.detectAndLogDomainChanges(this.store, oldProg, newProg),
    };
  }

  private animationLoopDeps(): AnimationLoopDeps {
    const runtime = this.requireActiveRuntimeResources('starting the animation loop');
    return {
      getCurrentProgram: () => this.compileState.currentProgram,
      getCurrentState: () => this.compileState.currentState,
      runtime,
      store: this.store,
      onStatsUpdate: this.statsSink,
    };
  }

  private handleAnimationLoopError = (err: unknown): void => {
    const { store } = this;
    const message = err instanceof Error ? err.message : String(err);
    const errorType: 'nan' | 'infinity' | 'overflow' | 'other' =
      message.toLowerCase().includes('nan')
        ? 'nan'
        : message.toLowerCase().includes('infinity') || message.toLowerCase().includes('inf')
          ? 'infinity'
          : message.toLowerCase().includes('overflow')
            ? 'overflow'
            : 'other';

    // [LAW:single-enforcer] RuntimeService is the single owner that transitions playback to paused on runtime failure.
    if (store.playback.isPlaying) {
      store.playback.pause();
    }

    store.events.emit({
      type: 'RuntimeError',
      patchId: 'patch-0',
      patchRevision: store.getPatchRevision(),
      errorType,
      message,
    });
    store.diagnostics.log({
      level: 'error',
      message: `Runtime error (execution halted): ${message}`,
    });
  };

  private requestSwapFlush(): void {
    if (this.swapRafId !== null) return;
    this.swapRafId = requestAnimationFrame(() => {
      this.swapRafId = null;
      void this.flushPendingSwap();
    });
  }

  private async flushPendingSwap(): Promise<void> {
    if (this.swapInFlight) return;
    const compilerServices = this.readCompilerServices();
    const next = compilerServices?.compiler.takeReadyArtifactsForSwap() ?? null;
    if (!next) return;
    const expectedProgram = next.backendResult?.kind === 'ok'
      ? next.backendResult.program
      : null;

    const isInitialSwap = this.nextSwapIsInitial;
    this.nextSwapIsInitial = false;
    this.swapInFlight = true;
    try {
      await this.publishRendererPipelines(next);
      // [LAW:single-enforcer] All compile/swap application goes through this queue.
      await compileAndSwap(this.compileDeps(), isInitialSwap, next);
      if (expectedProgram && this.compileState.currentProgram === expectedProgram && next.compiledGpuBundle) {
        // [RECOVER-08] Publish the worker-owned static install contract directly.
        // Runtime services do not rebuild shape-bank or draw-prep metadata locally.
        this.installRendererCanonicalAssets(next.compiledGpuBundle);
      }
      this.readMatchingCompilerServices(compilerServices)?.compiler.markSwapComplete();
    } catch (err) {
      this.readMatchingCompilerServices(compilerServices)?.compiler.markSwapFailed(err);
      const message = err instanceof Error ? err.message : String(err);
      this.store.diagnostics.log({
        level: 'error',
        message: `${isInitialSwap ? 'Initial compilation failed' : 'Recompile swap failed'}: ${message}`,
      });
    } finally {
      this.swapInFlight = false;
      if (this.readMatchingCompilerServices(compilerServices)?.compiler.getState() === 'ready') {
        this.requestSwapFlush();
      }
    }
  }

  // [RECOVER-07] Install publishes compile-time topology headers and sink
  // table descriptors only. No CPU materialization, no instance count
  // resolution, no ShapeBank allocator. The compile-time topology install
  // stage is the single GPU-visible runtime stage for shape-handle production.
  private installRendererCanonicalAssets(compiledGpuBundle: CompiledGpuArtifactBundle): void {
    const runtime = this.readActiveRuntimeResources();
    if (!runtime || this.rendererExecutionState !== 'active') {
      return;
    }
    const { renderer, canvas } = runtime;

    // [LAW:one-source-of-truth] RuntimeService publishes the canonical
    // worker-owned install contract without rebuilding static metadata.
    const installContract = compiledGpuBundle.runtimeInstall;
    const viewport = this.store.viewport;
    const renderWidth = Math.max(1, Math.floor(viewport?.canvasWidth || canvas.width || 1));
    const renderHeight = Math.max(1, Math.floor(viewport?.canvasHeight || canvas.height || 1));
    const zoom = viewport?.zoom ?? 1;
    const panX = viewport?.pan?.x ?? 0;
    const panY = viewport?.pan?.y ?? 0;

    renderer.render({
      shapeBank: {
        data: installContract.shapeBank.words,
        volatilePtr: installContract.shapeBank.wordCount,
        // [RECOVER-07] staticBoundary is 0: all topology headers are
        // produced by the compile-time install stage, not the ShapeBank
        // frame allocator.
        staticBoundary: 0,
        topologyIdByHandle: installContract.shapeBank.topologyIdByHandle,
      },
      drawPrepSinkTableV1: installContract.drawPrep.words,
      drawPrepSinkTableWordCount: installContract.drawPrep.wordCount,
      width: renderWidth,
      height: renderHeight,
      zoom,
      panX,
      panY,
      timeMs: 0,
      inputMouseX: 0,
      inputMouseY: 0,
      inputMouseButtons: 0,
      inputAudioLow: 0,
      inputAudioMid: 0,
      inputAudioHigh: 0,
      inputGaugeActive: 0,
    });
  }

  private async publishRendererPipelines(
    artifacts: {
      readonly backendResult: import('../compiler/compile').CompileResult | null;
      readonly compiledGpuBundle: CompiledGpuArtifactBundle | null;
    },
  ): Promise<void> {
    if (artifacts.backendResult?.kind !== 'ok') {
      return;
    }
    const bundlePasses = artifacts.compiledGpuBundle?.passes ?? null;
    if (!bundlePasses) {
      throw new Error('RuntimeService: compile backend result is missing required GPU pass bundle');
    }

    const runtime = this.readActiveRuntimeResources();
    if (!runtime) {
      if (this.rendererExecutionState !== 'active') {
        return;
      }
      throw new Error('RuntimeService: renderer must exist before publishing compiled GPU pipelines');
    }
    const { renderer } = runtime;

    // [LAW:single-enforcer] RuntimeService is the only boundary that publishes
    // compiler-emitted GPU shader artifacts into the active renderer.
    shaderInspector.setPasses(bundlePasses);
    await renderer.rebuildGpuPipelines(bundlePasses);
  }

  private buildCompileRequest(): CompileWorkerRunRequest {
    const debugValues = this.store.settings.get(debugSettings);
    const flagOverrides = this.store.settings.get(compilerFlagsSettings);
    return {
      patch: this.store.patch.patch,
      patchRevision: this.store.getPatchRevision(),
      // [LAW:one-source-of-truth] Startup and live recompile must use one
      // canonical compile request shape so diagnostics/settings cannot drift.
      frontendOptions: {
        traceCardinalitySolver: debugValues?.traceCardinalitySolver,
        diagnosticOverrides: flagOverrides ?? undefined,
      },
    };
  }

  private async waitForCompilerState(
    targets: readonly AsyncCompilerState[],
  ): Promise<AsyncCompilerState> {
    const { compiler } = this.requireCompilerServices('waiting for async compiler state');
    const targetSet = new Set<AsyncCompilerState>(targets);
    const current = compiler.getState();
    if (targetSet.has(current)) return current;
    return await new Promise<AsyncCompilerState>((resolve) => {
      const unsubscribe = compiler.subscribe((nextState) => {
        if (!targetSet.has(nextState)) return;
        unsubscribe();
        resolve(nextState);
      });
    });
  }

  private async runInitialCompileViaWorker(): Promise<void> {
    const { compiler } = this.requireCompilerServices('running the startup compile');

    this.nextSwapIsInitial = true;
    try {
      compiler.scheduleCompile(this.buildCompileRequest());
      // [LAW:dataflow-not-control-flow] Startup and live compile artifacts flow
      // through the same swap queue. Startup waits for ready/error, then forces
      // one queue drain so init does not depend on RAF scheduling.
      const compileState = await this.waitForCompilerState(['ready', 'error']);
      if (compileState === 'ready') {
        await this.flushPendingSwap();
      }
      const finalState = await this.waitForCompilerState(['idle', 'error']);
      if (finalState === 'error') {
        const errorMessage = compiler.getLastErrorMessage() ?? 'unknown startup compile failure';
        throw new Error(`RuntimeService: initial async compile failed: ${errorMessage}`);
      }
    } finally {
      this.nextSwapIsInitial = false;
    }
  }

  private disarmStartupStorageResetGuard(): void {
    this.startupStorageResetArmed = false;
    if (this.startupStorageResetTimer !== null) {
      clearTimeout(this.startupStorageResetTimer);
      this.startupStorageResetTimer = null;
    }
  }

  private armStartupStorageResetGuard(source: StartupRestoreSource): void {
    this.startupRestoreSource = source;
    this.disarmStartupStorageResetGuard();
    if (source !== 'storage') {
      return;
    }
    this.startupStorageResetArmed = true;
    this.startupStorageResetTimer = setTimeout(() => {
      this.startupStorageResetTimer = null;
      this.startupStorageResetArmed = false;
    }, STARTUP_STORAGE_RESET_ARM_MS);
  }

  private maybeClearStartupRestoreOnGpuFault(fault: GpuFault): void {
    if (!shouldClearStoredStartupPatch(this.startupRestoreSource, this.startupStorageResetArmed, fault)) {
      return;
    }
    // [LAW:one-source-of-truth] Startup auto-restore is sourced from one
    // persisted patch key, so breaker recovery clears that one canonical key.
    clearPatchFromStorage();
    this.disarmStartupStorageResetGuard();
    this.store.diagnostics.log({
      level: 'warn',
      message: 'Cleared the persisted startup patch after a fatal WebGPU startup failure.',
    });
  }

  private handleGpuFault = (fault: GpuFault): void => {
    const { store } = this;
    const runtime = this.readActiveRuntimeResources();
    const level = fault.severity === 'fatal' ? 'error' : 'warn';
    this.rendererExecutionState = deriveRendererExecutionStateFromGpuFault(fault);
    this.maybeClearStartupRestoreOnGpuFault(fault);
    store.diagnostics.log({
      level,
      message: `GPU ${fault.severity}: [${fault.code}] ${fault.message}`,
    });
    store.diagnostics.setGpuFault({
      severity: fault.severity,
      code: fault.code,
      message: fault.message,
    });
    store.events.emit({
      type: 'GpuFault',
      patchId: 'patch-0',
      patchRevision: store.getPatchRevision(),
      severity: fault.severity,
      code: fault.code,
      message: fault.message,
      source: fault.source,
      recoverable: fault.recoverable,
    });
    if (fault.severity !== 'fatal') {
      return;
    }
    if (store.playback.isPlaying) {
      store.playback.pause();
    }
    this.animationLoop?.stop();
    this.animationLoop = null;
    if (runtime) {
      runtime.renderer.setGpuFaultCallback(null);
      runtime.renderer.dispose();
      this.runtimeResourcesState = {
        kind: 'faulted',
        canvas: runtime.canvas,
        arena: runtime.arena,
        fault,
      };
    }
    store.diagnostics.log({
      level: 'error',
      message: describeFatalGpuFault(fault),
    });
  };

  /**
   * Called by React when the canvas element is available.
   */
  setCanvas(canvasEl: HTMLCanvasElement): void {
    const activeRuntime = this.readActiveRuntimeResources();
    if (activeRuntime && activeRuntime.canvas !== canvasEl) {
      // [LAW:one-source-of-truth] The active runtime owns the canonical canvas
      // reference after initialization; ignore divergent remounts until the
      // runtime is explicitly rebuilt around the new edge input.
      this.store.diagnostics.log({
        level: 'warn',
        message: 'RuntimeService ignored a new canvas after activation; rebuild the runtime to adopt a remounted canvas.',
      });
      return;
    }
    this.canvasState = {
      kind: 'ready',
      canvas: canvasEl,
    };
    if (this.runtimeResourcesState.kind === 'bootstrapping') {
      this.runtimeResourcesState = {
        kind: 'bootstrapping',
        canvas: canvasEl,
      };
    }
  }

  /**
   * Initialize the full runtime pipeline:
   * 1. Register settings tokens
   * 2. Load patch (localStorage or default demo)
   * 3. Initial compile
   * 4. Start live recompile + persistence + animation loop
   */
  async init(): Promise<void> {
    const { store } = this;
    let bootstrapFailureRecorded = false;
    markRuntimeBootstrapStarted();
    try {
      const canvas = this.requireCanvas();
      this.runtimeResourcesState = {
        kind: 'bootstrapping',
        canvas,
      };
      // [LAW:single-enforcer] RuntimeService owns startup capability validation.
      // [LAW:no-silent-fallbacks] WebGPU-only runtime hard-fails when prerequisites are missing.
      assertWebGPUStartupContract(canvas);

      const compileWorkerClient = new CompileWorkerClient();
      const asyncCompiler = new AsyncCompilerService({
        runCompile: (request) => compileWorkerClient.compile(request),
        onCompileFailure: (error) => this.logWorkerFailure(error),
        debounceMs: 50,
      });
      const unsubscribeCompilerState = asyncCompiler.subscribe((nextState) => {
        // [LAW:single-enforcer] RuntimeService is the single boundary that exposes
        // async compiler lifecycle state to app-level observers via EventHub.
        store.events.emit({
          type: 'CompilerStateChanged',
          patchId: 'patch-0',
          patchRevision: store.getPatchRevision(),
          state: nextState,
          errorMessage: asyncCompiler.getLastErrorMessage() ?? undefined,
        });
        if (nextState === 'ready') {
          this.requestSwapFlush();
        }
      });
      this.setCompilerServices({
        client: compileWorkerClient,
        compiler: asyncCompiler,
        unsubscribeCompilerState,
      });
      store.events.emit({
        type: 'CompilerStateChanged',
        patchId: 'patch-0',
        patchRevision: store.getPatchRevision(),
        state: asyncCompiler.getState(),
        errorMessage: asyncCompiler.getLastErrorMessage() ?? undefined,
      });
      // [LAW:single-enforcer] RuntimeService owns debug lifecycle boundaries.
      debugService.clear();
      this.primeWasmDebugProbeTransport();
      compilationInspector.setErrorReporter((payload) => {
        const phase = payload.passName ? `${payload.phase}(${payload.passName})` : payload.phase;
        const message = payload.error instanceof Error ? payload.error.message : String(payload.error);
        // [LAW:single-enforcer] RuntimeService is the single app-runtime boundary that
        // forwards inspector internal failures to diagnostics.
        store.diagnostics.log({
          level: 'warn',
          message: `Compilation inspector failure at ${phase}: ${message}`,
        });
      });

      // [LAW:no-shared-mutable-globals] RuntimeService owns one arena instance
      // per runtime lifecycle instead of relying on module-level singleton state.
      const arena = new RenderBufferArena(50_000);
      arena.init();
      setRenderIssueReporter((issue) => {
        // [LAW:single-enforcer] RuntimeService owns render issue routing into diagnostics.
        store.diagnostics.log({
          level: issue.level,
          message: `Render: ${issue.message}`,
          data: issue.detail,
        });
      });
      for (const issue of getRenderIssues()) {
        store.diagnostics.log({
          level: issue.level,
          message: `Render: ${issue.message}`,
          data: issue.detail,
        });
      }
      clearRenderIssues();

      // Register settings tokens (before any compile call)
      store.settings.register(appSettings);
      store.settings.register(compilerFlagsSettings);

      // [LAW:single-enforcer] RuntimeService is the only startup boundary that
      // instantiates the renderer after prerequisites are validated.
      try {
        const renderer = await createWebGPURenderer(canvas, {
          onGpuFault: this.handleGpuFault,
        });
        this.activateRuntimeResources({
          canvas,
          renderer,
          arena,
        });
        this.rendererExecutionState = 'active';
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`RuntimeService: WebGPU renderer initialization failed: ${message}`);
      }

      // Check for test automation demo marker (set by ?loadDemoPatch= during pre-React parse)
      const testDemo = consumeTestDemoFilename();
      if (testDemo) {
        this.armStartupStorageResetGuard('test');
        const loaded = store.demo.selectDemo(testDemo);
        if (!loaded) {
          store.diagnostics.log({
            level: 'warn',
            // [LAW:single-enforcer] RuntimeService owns startup diagnostics emission.
            message: `[test-params] Demo not found: "${testDemo}". Available: ${store.demo.demos.map(d => d.filename).join(', ')}`,
          });
          this.armStartupStorageResetGuard('demo');
          store.demo.loadDefault();
        }
      } else {
        // Try to restore from localStorage, otherwise load default demo
        const saved = loadPatchFromStorage();
        if (saved) {
          this.armStartupStorageResetGuard('storage');
          runInAction(() => {
            store.demo.currentFilename = null;
          });
          store.patch.loadPatch(saved.patch);
        } else {
          this.armStartupStorageResetGuard('demo');
          store.demo.loadDefault();
        }
      }

      // [LAW:single-enforcer] Startup compile must flow through the async worker
      // path so the main thread never runs compiler lowering/linking directly.
      await this.runInitialCompileViaWorker();
      const initialCompileSucceeded =
        this.compileState.currentProgram !== null &&
        this.compileState.currentState !== null;

      // Re-render App to update externalWriteBus prop now that runtime state exists.
      this.runtimeReadySink();

      // Start auto-persistence (PatchStore watches itself)
      store.patch.startPersistence();

      // Set up live recompile reaction.
      // [LAW:one-source-of-truth] The worker-owned compile/swap bundle is the
      // only runtime artifact authority. Main-thread program-only patching does
      // not update the installed renderer bundle, so value edits must flow
      // through the canonical async compile path until a worker-owned patch
      // protocol exists.
      this.liveRecompile.setup(store, async () => {
        this.requireCompilerServices('scheduling a live recompile').compiler.scheduleCompile(this.buildCompileRequest());
      }, undefined, (err) => {
        // [LAW:single-enforcer] RuntimeService is the sole boundary for recompile failures.
        const message = err instanceof Error ? err.message : String(err);
        store.diagnostics.log({
          level: 'error',
          message: `Recompile failed: ${message}`,
        });
      });

      // Subscribe to CompileEnd events for compilation statistics
      this.unsubCompileEnd = store.events.on('CompileEnd', (event) => {
        if (event.status === 'success') {
          store.diagnostics.recordCompilation(event.durationMs);
          // [LAW:single-enforcer] CompileEnd success is the sole signal that a fresh
          // program is active; the loop consumes that signal to reset stale render state.
          if (this.animationLoop?.onCompileSuccess()) {
            store.diagnostics.log({
              level: 'info',
              message: 'Runtime loop resumed after successful recompile',
            });
          }
          // Clear non-fatal GPU fault on successful recompile (new pipeline installed).
          const currentFault = store.diagnostics.gpuFaultState;
          if (currentFault && currentFault.severity !== 'fatal') {
            store.diagnostics.clearGpuFault();
          }
        }
      });

      // Start animation loop
      this.animationState = createAnimationLoopState();
      this.animationLoop = startAnimationLoop(
        this.animationLoopDeps(),
        this.animationState,
        this.handleAnimationLoopError,
      );
      this.bindSpyReadbackTracking();

      // [LAW:verifiable-goals] Browser matrix gates require explicit bootstrap
      // success/failure state instead of inferring readiness from page liveness.
      if (initialCompileSucceeded) {
        markRuntimeBootstrapSucceeded();
      } else {
        markRuntimeBootstrapFailed(INITIAL_COMPILE_FAILURE_PROBE_MESSAGE);
        bootstrapFailureRecorded = true;
      }

      // Persist current patch immediately after initial compile
      // (covers the case where we loaded a default demo)
      savePatchToStorage(store.patch.patch, 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!bootstrapFailureRecorded) {
        markRuntimeBootstrapFailed(message);
      }
      throw error;
    }
  }

  /**
   * Dispose all long-lived resources (HMR cleanup).
   */
  dispose(): void {
    compilationInspector.setErrorReporter(null);
    setRenderIssueReporter(null);
    const runtime = this.readActiveRuntimeResources();
    runtime?.renderer.setGpuFaultCallback(null);
    this.disarmStartupStorageResetGuard();
    this.animationLoop?.stop();
    this.animationLoop = null;
    this.stopSpyReadbackLoop();
    this.unsubSpyTracking?.();
    this.unsubSpyTracking = null;
    if (this.swapRafId !== null) {
      cancelAnimationFrame(this.swapRafId);
      this.swapRafId = null;
    }
    this.swapInFlight = false;
    const compilerServices = this.readCompilerServices();
    compilerServices?.unsubscribeCompilerState();
    compilerServices?.compiler.dispose();
    this.compilerServicesState = { kind: 'inactive' };
    this.unsubCompileEnd?.();
    this.unsubCompileEnd = null;
    compilerServices?.client.dispose();
    this.store.patch.stopPersistence();
    this.domainChangeDetector.cleanup();
    this.liveRecompile.cleanup();
    debugService.clear();
    runtime?.renderer.dispose();
    this.runtimeResourcesState = { kind: 'disposed' };
    this.canvasState = { kind: 'missing' };
    this.rendererExecutionState = 'active';
    shaderInspector.clear();
    this.statsSink = noopStatsSink;
    this.runtimeReadySink = noopRuntimeReadySink;
  }

  private bindSpyReadbackTracking(): void {
    this.unsubSpyTracking?.();
    this.unsubSpyTracking = debugService.onTrackedDebugProbeSubscriptionsChange((trackedSubscriptionCount) => {
      this.syncSpyReadbackSubscriptions();
      this.syncSpyReadbackLoopForTrackedSlots(trackedSubscriptionCount);
    });
    this.syncSpyReadbackSubscriptions();
    this.syncSpyReadbackLoopForTrackedSlots(debugService.getTrackedDebugProbeSubscriptions(1).length);
  }

  private primeWasmDebugProbeTransport(): void {
    if (this.debugProbeUpgradeInFlight) {
      return;
    }
    this.debugProbeUpgradeInFlight = createWasmDebugProbeTransport(() => ({
      program: this.compileState.currentProgram,
      state: this.compileState.currentState,
    }))
      .then((transport) => {
        this.debugProbeTransport = transport;
        this.debugProbeTransport.debugCommand({
          kind: 'set_rate_hz',
          rateHz: this.spyReadbackHz,
        });
        this.syncSpyReadbackSubscriptions();
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        // [LAW:no-silent-fallbacks] Transport upgrade failures must be
        // observable even when local fallback remains active.
        this.store.diagnostics.log({
          level: 'warn',
          message: `WASM debug probe transport upgrade failed; continuing with LocalDebugProbeTransport: ${message}`,
        });
      })
      .finally(() => {
        this.debugProbeUpgradeInFlight = null;
      });
  }

  private syncSpyReadbackSubscriptions(): void {
    const subscriptions = debugService.getTrackedDebugProbeSubscriptions(16);
    if (subscriptions.length === 0) {
      this.debugProbeTransport.debugCommand({ kind: 'clear_subscriptions' });
      return;
    }
    // [LAW:single-enforcer] RuntimeService owns command-plane updates from UI
    // tracking state to debug probe transport subscriptions.
    this.debugProbeTransport.debugCommand({
      kind: 'set_subscriptions',
      subscriptions,
    });
  }

  private syncSpyReadbackLoopForTrackedSlots(trackedSlotCount: number): void {
    if (trackedSlotCount > 0) {
      this.startSpyReadbackLoop();
      return;
    }
    this.stopSpyReadbackLoop();
  }

  private startSpyReadbackLoop(): void {
    if (this.spyReadbackLoopActive && this.spyReadbackTimer !== null) {
      return;
    }
    this.spyReadbackLoopActive = true;
    const schedule = (): void => {
      if (!this.spyReadbackLoopActive) {
        return;
      }
      if (debugService.getTrackedDebugProbeSubscriptions(1).length === 0) {
        this.stopSpyReadbackLoop();
        return;
      }
      const intervalMs = 1000 / Math.max(1, this.spyReadbackHz);
      this.spyReadbackTimer = setTimeout(() => {
        if (!this.spyReadbackLoopActive) {
          this.spyReadbackTimer = null;
          return;
        }
        this.spyReadbackTimer = null;
        try {
          this.runSpyReadbackCycle();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.store.diagnostics.log({
            level: 'error',
            message: `Spy readback cycle failed: ${message}`,
          });
        }
        schedule();
      }, intervalMs);
    };
    schedule();
  }

  private stopSpyReadbackLoop(): void {
    this.spyReadbackLoopActive = false;
    if (this.spyReadbackTimer !== null) {
      clearTimeout(this.spyReadbackTimer);
      this.spyReadbackTimer = null;
    }
    this.spyReadbackInFlight = false;
  }

  private runSpyReadbackCycle(): void {
    if (this.spyReadbackInFlight) {
      return;
    }
    this.spyReadbackInFlight = true;
    try {
      const packet = this.buildSpyReadbackPacket(performance.now());
      if (!packet) {
        return;
      }
      this.handleSpyReadbackAnomalies(packet);
      this.applySpyReadbackPacket(packet);
    } finally {
      this.spyReadbackInFlight = false;
    }
  }

  private buildSpyReadbackPacket(capturedAtMs: number): RuntimeSpyReadbackPacket | null {
    const probePacket = this.debugProbeTransport.debugPollPacket(capturedAtMs);
    if (!probePacket) {
      return null;
    }

    const entries: RuntimeSpyReadbackEntry[] = [];
    for (const sample of probePacket.samples) {
      if (sample.payloadKind === 'scalar') {
        if (sample.values.length < 1) {
          continue;
        }
        const value = sample.values[0];
        entries.push({
          slotId: sample.slotId,
          value,
        });
      }
    }
    if (probePacket.samples.length === 0) {
      return null;
    }

    return {
      capturedAtMs: probePacket.capturedAtMs,
      frameId: probePacket.runtimeFrameId,
      packetFlags: probePacket.packetFlags >>> 0,
      entries,
      samples: probePacket.samples,
    };
  }

  private handleSpyReadbackAnomalies(packet: RuntimeSpyReadbackPacket): void {
    if ((packet.packetFlags & DEBUG_PACKET_FLAG_NAN_DETECTED_ANY) === 0) {
      return;
    }

    let anomalousSample: DebugProbePacketSample | undefined;
    let anomalousValue: number | undefined;
    for (const sample of packet.samples) {
      const value = sample.values.find((candidate) => !Number.isFinite(candidate));
      if (value !== undefined) {
        anomalousSample = sample;
        anomalousValue = value;
        break;
      }
    }
    if (!anomalousSample || anomalousValue === undefined) {
      return;
    }

    if (this.spyReadbackAnomalyFrameId !== packet.frameId) {
      this.spyReadbackAnomalyFrameId = packet.frameId;
      this.spyReadbackAnomalyKeysForFrame.clear();
    }
    const anomalyKey = `${Number(anomalousSample.slotId)}:${anomalousSample.targetId}`;
    if (this.spyReadbackAnomalyKeysForFrame.has(anomalyKey)) {
      return;
    }
    this.spyReadbackAnomalyKeysForFrame.add(anomalyKey);

    const valueLabel =
      Number.isNaN(anomalousValue)
        ? 'NaN'
        : anomalousValue > 0
          ? '+Infinity'
          : '-Infinity';

    // [LAW:no-silent-fallbacks] Non-finite probe values are surfaced and the
    // runtime is paused immediately so NaN/Inf propagation is explicit.
    this.store.diagnostics.log({
      level: 'error',
      message:
        `Spy readback detected ${valueLabel} on slot ${Number(anomalousSample.slotId)} ` +
        `(target ${anomalousSample.targetId}, frame ${packet.frameId}); pausing playback.`,
    });

    if (this.store.playback.isPlaying) {
      this.store.playback.pause();
    }
  }

  private applySpyReadbackPacket(packet: RuntimeSpyReadbackPacket): void {
    // [LAW:single-enforcer] DebugService remains the single write boundary
    // for async readback values consumed by UI/debug queries.
    for (const entry of packet.entries) {
      debugService.applySpyReadback(
        entry.slotId,
        entry.value,
        packet.capturedAtMs,
        packet.frameId,
      );
    }
    for (const sample of packet.samples) {
      if (sample.payloadKind !== 'lane_window') {
        continue;
      }
      debugService.updateFieldValue(sample.slotId, new Float32Array(sample.values));
    }
  }
}
