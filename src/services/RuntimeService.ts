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
  RenderBufferArena,
  setRenderIssueReporter,
  getRenderIssues,
  clearRenderIssues,
} from '../render';
import type { RootStore } from '../stores';
import { loadPatchFromStorage, savePatchToStorage } from './PatchPersistence';
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
import { patchProgramConstants } from './ConstantPatcher';
import { debugService } from './DebugService';
import { compilationInspector } from './CompilationInspectorService';
import { AsyncCompilerService, type AsyncCompilerState } from './AsyncCompilerService';
import {
  startAnimationLoop,
  createAnimationLoopState,
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

const INITIAL_COMPILE_FAILURE_PROBE_MESSAGE =
  'initial_compile_failed: animation loop started but no program is ready';

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
  private canvas: HTMLCanvasElement | null = null;
  private renderer: WebGPURenderer | null = null;
  private arena: RenderBufferArena | null = null;

  private animationLoop: AnimationLoopController | null = null;
  private unsubCompileEnd: (() => void) | null = null;
  private compileWorkerClient: CompileWorkerClient | null = null;
  private asyncCompiler: AsyncCompilerService | null = null;
  private unsubCompilerState: (() => void) | null = null;
  private swapInFlight = false;
  private swapRafId: number | null = null;
  // [LAW:one-source-of-truth] Swap mode is carried by one flag that is
  // consumed by the next successful artifact application.
  private nextSwapIsInitial = false;
  private lastWorkerFallbackLog = { message: '', atMs: 0 };
  private compileWorkerUnavailableLogged = false;
  private readonly liveRecompile: LiveRecompileController = createLiveRecompileController();
  private statsSink: ((statsText: string) => void) | null;
  private runtimeReadySink: (() => void) | null;
  private unsubSpyTracking: (() => void) | null = null;
  private spyReadbackTimer: ReturnType<typeof setTimeout> | null = null;
  private spyReadbackLoopActive = false;
  private spyReadbackInFlight = false;
  private spyReadbackHz = 5;
  private debugProbeTransport: DebugProbeTransport;
  private debugProbeUpgradeInFlight: Promise<void> | null = null;
  private lastSpyReadbackAnomalyKey = '';

  constructor(
    private readonly store: RootStore,
    options: {
      onStatsUpdate?: (statsText: string) => void;
      onRuntimeReady?: () => void;
    } = {}
  ) {
    this.statsSink = options.onStatsUpdate ?? null;
    this.runtimeReadySink = options.onRuntimeReady ?? null;
    this.debugProbeTransport = new LocalDebugProbeTransport(() => ({
      program: this.compileState.currentProgram,
      state: this.compileState.currentState,
    }));
    this.debugProbeTransport.debugCommand({
      kind: 'set_rate_hz',
      rateHz: this.spyReadbackHz,
    });
  }

  setStatsSink(onStatsUpdate: ((statsText: string) => void) | null): void {
    // [LAW:no-shared-mutable-globals] RuntimeService owns the stats sink
    // explicitly; no ambient window callback is used.
    this.statsSink = onStatsUpdate;
  }

  setRuntimeReadySink(onRuntimeReady: (() => void) | null): void {
    // [LAW:no-shared-mutable-globals] Runtime-ready notifications are pushed
    // through explicit ownership callbacks, never window globals.
    this.runtimeReadySink = onRuntimeReady;
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
    return {
      getCurrentProgram: () => this.compileState.currentProgram,
      getCurrentState: () => this.compileState.currentState,
      getCanvas: () => this.canvas,
      getRenderer: () => this.renderer,
      getArena: () => this.arena,
      store: this.store,
      onStatsUpdate: (statsText) => this.statsSink?.(statsText),
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
    const next = this.asyncCompiler?.takeReadyArtifactsForSwap() ?? null;
    if (!next) return;

    const isInitialSwap = this.nextSwapIsInitial;
    this.nextSwapIsInitial = false;
    this.swapInFlight = true;
    try {
      await this.publishRendererPipelines(next);
      // [LAW:single-enforcer] All compile/swap application goes through this queue.
      await compileAndSwap(this.compileDeps(), isInitialSwap, next);
      this.asyncCompiler?.markSwapComplete();
    } catch (err) {
      this.asyncCompiler?.markSwapFailed(err);
      const message = err instanceof Error ? err.message : String(err);
      this.store.diagnostics.log({
        level: 'error',
        message: `${isInitialSwap ? 'Initial compilation failed' : 'Recompile swap failed'}: ${message}`,
      });
    } finally {
      this.swapInFlight = false;
      if (this.asyncCompiler?.getState() === 'ready') {
        this.requestSwapFlush();
      }
    }
  }

  private async publishRendererPipelines(
    artifacts: {
      readonly backendResult: import('../compiler/compile').CompileResult | null;
      readonly compiledComputeWgsl?: string | null;
    },
  ): Promise<void> {
    const compiledComputeWgsl =
      artifacts.backendResult?.kind === 'ok'
        ? artifacts.compiledComputeWgsl ?? null
        : null;
    if (!compiledComputeWgsl) {
      return;
    }

    const renderer = this.renderer;
    if (!renderer) {
      throw new Error('RuntimeService: renderer must exist before publishing compiled GPU pipelines');
    }

    // [LAW:single-enforcer] RuntimeService is the only boundary that publishes
    // compiler-emitted GPU shader artifacts into the active renderer.
    await renderer.rebuildSimulationPipeline(compiledComputeWgsl);
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
    const compiler = this.asyncCompiler;
    if (!compiler) {
      throw new Error('RuntimeService: async compiler is required before waiting for state');
    }
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
    const compiler = this.asyncCompiler;
    if (!compiler) {
      throw new Error('RuntimeService: async compiler is required before startup compile');
    }

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

  /**
   * Called by React when the canvas element is available.
   */
  setCanvas(canvasEl: HTMLCanvasElement): void {
    this.canvas = canvasEl;
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
      if (!this.canvas) {
        throw new Error('RuntimeService: preview canvas is required before initialization');
      }
      // [LAW:single-enforcer] RuntimeService owns startup capability validation.
      // [LAW:no-silent-fallbacks] WebGPU-only runtime hard-fails when prerequisites are missing.
      assertWebGPUStartupContract(this.canvas);

      this.compileWorkerClient = new CompileWorkerClient();
      this.asyncCompiler = new AsyncCompilerService({
        runCompile: (request) => this.compileWorkerClient!.compile(request),
        onCompileFailure: (error) => this.logWorkerFailure(error),
        debounceMs: 50,
      });
      this.unsubCompilerState = this.asyncCompiler.subscribe((nextState) => {
        // [LAW:single-enforcer] RuntimeService is the single boundary that exposes
        // async compiler lifecycle state to app-level observers via EventHub.
        store.events.emit({
          type: 'CompilerStateChanged',
          patchId: 'patch-0',
          patchRevision: store.getPatchRevision(),
          state: nextState,
          errorMessage: this.asyncCompiler?.getLastErrorMessage() ?? undefined,
        });
        if (nextState === 'ready') {
          this.requestSwapFlush();
        }
      });
      store.events.emit({
        type: 'CompilerStateChanged',
        patchId: 'patch-0',
        patchRevision: store.getPatchRevision(),
        state: this.asyncCompiler.getState(),
        errorMessage: this.asyncCompiler.getLastErrorMessage() ?? undefined,
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
      this.arena = new RenderBufferArena(50_000);
      this.arena.init();
      setRenderIssueReporter((issue) => {
        // [LAW:single-enforcer] RuntimeService owns render issue routing into diagnostics.
        store.diagnostics.log({
          level: issue.level,
          message: `Render: ${issue.message}`,
        });
      });
      for (const issue of getRenderIssues()) {
        store.diagnostics.log({
          level: issue.level,
          message: `Render: ${issue.message}`,
        });
      }
      clearRenderIssues();

      // Register settings tokens (before any compile call)
      store.settings.register(appSettings);
      store.settings.register(compilerFlagsSettings);

      // [LAW:single-enforcer] RuntimeService is the only startup boundary that
      // instantiates the renderer after prerequisites are validated.
      try {
        this.renderer = await createWebGPURenderer(this.canvas);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`RuntimeService: WebGPU renderer initialization failed: ${message}`);
      }

      // Check for test automation demo marker (set by ?loadDemoPatch= before reload)
      const testDemo = consumeTestDemoFilename();
      if (testDemo) {
        const loaded = store.demo.selectDemo(testDemo);
        if (!loaded) {
          store.diagnostics.log({
            level: 'warn',
            // [LAW:single-enforcer] RuntimeService owns startup diagnostics emission.
            message: `[test-params] Demo not found: "${testDemo}". Available: ${store.demo.demos.map(d => d.filename).join(', ')}`,
          });
          store.demo.loadDefault();
        }
      } else {
        // Try to restore from localStorage, otherwise load default demo
        const saved = loadPatchFromStorage();
        if (saved) {
          store.demo.currentFilename = null;
          store.patch.loadPatch(saved.patch);
        } else {
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
      this.runtimeReadySink?.();

      // Start auto-persistence (PatchStore watches itself)
      store.patch.startPersistence();

      // Set up live recompile reaction with fast-path for constant value changes
      this.liveRecompile.setup(store, async () => {
        this.asyncCompiler!.scheduleCompile(this.buildCompileRequest());
      }, (changes) => {
        const program = this.compileState.currentProgram;
        if (!program) return false;
        const patched = patchProgramConstants(program, changes);
        if (!patched) return false;
        this.compileState.currentProgram = patched;
        return true;
      }, (err) => {
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
    this.unsubCompilerState?.();
    this.unsubCompilerState = null;
    this.asyncCompiler?.dispose();
    this.asyncCompiler = null;
    this.unsubCompileEnd?.();
    this.unsubCompileEnd = null;
    this.compileWorkerClient?.dispose();
    this.compileWorkerClient = null;
    this.store.patch.stopPersistence();
    this.domainChangeDetector.cleanup();
    this.liveRecompile.cleanup();
    debugService.clear();
    this.renderer?.dispose();
    this.renderer = null;
    this.arena = null;
    this.statsSink = null;
    this.runtimeReadySink = null;
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
    const anomalousSample = packet.samples.find((sample) =>
      sample.values.some((value) => !Number.isFinite(value)));
    if (!anomalousSample) {
      return;
    }
    const anomalousValue = anomalousSample.values.find((value) => !Number.isFinite(value));
    if (anomalousValue === undefined) {
      return;
    }

    const anomalyKey = `${packet.frameId}:${Number(anomalousSample.slotId)}:${anomalousSample.targetId}`;
    if (this.lastSpyReadbackAnomalyKey === anomalyKey) {
      return;
    }
    this.lastSpyReadbackAnomalyKey = anomalyKey;

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
