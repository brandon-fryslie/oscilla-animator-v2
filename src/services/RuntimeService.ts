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
  assertWebGPUStartupContract,
  createWebGPURenderer,
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
  compileAndSwap,
  type CompileOrchestratorState,
} from './CompileOrchestrator';
import { CompileWorkerClient } from './CompileWorkerClient';
import { createDomainChangeDetector, type DomainChangeDetector } from './DomainChangeDetector';
import { createLiveRecompileController, type LiveRecompileController } from './LiveRecompile';
import { patchProgramConstants } from './ConstantPatcher';
import { debugService } from './DebugService';
import { compilationInspector } from './CompilationInspectorService';
import { AsyncCompilerService } from './AsyncCompilerService';
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
import { arenaRead } from '../runtime/ArenaValueStore';
import type { ValueSlot } from '../types';

export interface RuntimeSpyReadbackEntry {
  readonly slotId: ValueSlot;
  readonly value: number;
}

export interface RuntimeSpyReadbackPacket {
  readonly capturedAtMs: number;
  readonly frameId: number;
  readonly entries: readonly RuntimeSpyReadbackEntry[];
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
  private lastWorkerFallbackLog = { message: '', atMs: 0 };
  private compileWorkerUnavailableLogged = false;
  private readonly liveRecompile: LiveRecompileController = createLiveRecompileController();
  private statsSink: ((statsText: string) => void) | null;
  private runtimeReadySink: (() => void) | null;
  private spyReadbackSink: ((packet: RuntimeSpyReadbackPacket) => void) | null;
  private spyReadbackTimer: ReturnType<typeof setTimeout> | null = null;
  private spyReadbackInFlight = false;
  private spyReadbackHz = 15;

  constructor(
    private readonly store: RootStore,
    options: {
      onStatsUpdate?: (statsText: string) => void;
      onRuntimeReady?: () => void;
      onSpyReadback?: (packet: RuntimeSpyReadbackPacket) => void;
    } = {}
  ) {
    this.statsSink = options.onStatsUpdate ?? null;
    this.runtimeReadySink = options.onRuntimeReady ?? null;
    this.spyReadbackSink = options.onSpyReadback ?? null;
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

  setSpyReadbackSink(onSpyReadback: ((packet: RuntimeSpyReadbackPacket) => void) | null): void {
    // [LAW:no-shared-mutable-globals] Spy readback delivery is explicit callback ownership.
    this.spyReadbackSink = onSpyReadback;
  }

  private logWorkerFailure(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    const now = performance.now();
    const unchanged = this.lastWorkerFallbackLog.message === message;
    const withinWindow = now - this.lastWorkerFallbackLog.atMs < 2000;
    if (unchanged && withinWindow) return;

    this.lastWorkerFallbackLog = { message, atMs: now };
    // [LAW:no-silent-fallbacks] Worker recompile failures must surface as
    // explicit diagnostics; this runtime does not support silent fallback.
    if (isCompileWorkerUnavailableError(err)) {
      if (this.compileWorkerUnavailableLogged) return;
      this.compileWorkerUnavailableLogged = true;
      this.store.diagnostics.log({
        level: 'error',
        message: `Live recompile unavailable: Web Workers are required but could not be started (${message}). This platform/runtime is unsupported for graph edits.`,
      });
      return;
    }

    this.store.diagnostics.log({
      level: 'error',
      message: `Live recompile failed in worker: ${message}`,
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

    this.swapInFlight = true;
    try {
      // [LAW:single-enforcer] All compile/swap application goes through this queue.
      await compileAndSwap(this.compileDeps(), false, next);
      this.asyncCompiler?.markSwapComplete();
    } catch (err) {
      this.asyncCompiler?.markSwapFailed(err);
      const message = err instanceof Error ? err.message : String(err);
      this.store.diagnostics.log({
        level: 'error',
        message: `Recompile swap failed: ${message}`,
      });
    } finally {
      this.swapInFlight = false;
      if (this.asyncCompiler?.getState() === 'ready') {
        this.requestSwapFlush();
      }
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

    // Initial compile (isInitial=true — hard swap)
    try {
      await compileAndSwap(
        this.compileDeps(),
        true
      );
    } catch (err) {
      // [LAW:single-enforcer] RuntimeService logs unexpected startup failures once.
      const message = err instanceof Error ? err.message : String(err);
      store.diagnostics.log({
        level: 'error',
        message: `Initial compilation failed: ${message}`,
      });
    }

    // Re-render App to update externalWriteBus prop now that runtime state exists.
    this.runtimeReadySink?.();

    // Start auto-persistence (PatchStore watches itself)
    store.patch.startPersistence();

    // Set up live recompile reaction with fast-path for constant value changes
    this.liveRecompile.setup(store, async () => {
      const debugValues = store.settings.get(debugSettings);
      const flagOverrides = store.settings.get(compilerFlagsSettings);
      this.asyncCompiler!.scheduleCompile({
        patch: store.patch.patch,
        patchRevision: store.getPatchRevision(),
        frontendOptions: {
          traceCardinalitySolver: debugValues?.traceCardinalitySolver,
          diagnosticOverrides: flagOverrides ?? undefined,
        },
      });
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
    this.startSpyReadbackLoop();

    // Persist current patch immediately after initial compile
    // (covers the case where we loaded a default demo)
    savePatchToStorage(store.patch.patch, 0);
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
    this.spyReadbackSink = null;
  }

  private startSpyReadbackLoop(): void {
    this.stopSpyReadbackLoop();
    const schedule = (): void => {
      const intervalMs = 1000 / Math.max(1, this.spyReadbackHz);
      this.spyReadbackTimer = setTimeout(() => {
        void this.runSpyReadbackCycle().finally(() => schedule());
      }, intervalMs);
    };
    schedule();
  }

  private stopSpyReadbackLoop(): void {
    if (this.spyReadbackTimer !== null) {
      clearTimeout(this.spyReadbackTimer);
      this.spyReadbackTimer = null;
    }
    this.spyReadbackInFlight = false;
  }

  private async runSpyReadbackCycle(): Promise<void> {
    if (this.spyReadbackInFlight) {
      return;
    }
    this.spyReadbackInFlight = true;
    try {
      const packet = this.buildSpyReadbackPacket(performance.now());
      if (!packet || packet.entries.length === 0) {
        return;
      }
      this.applySpyReadbackPacket(packet);
      // [LAW:dataflow-not-control-flow] Readback delivery is async fire-and-forget
      // and decoupled from the frame loop cadence.
      await Promise.resolve();
      this.spyReadbackSink?.(packet);
    } finally {
      this.spyReadbackInFlight = false;
    }
  }

  private buildSpyReadbackPacket(capturedAtMs: number): RuntimeSpyReadbackPacket | null {
    const program = this.compileState.currentProgram;
    const state = this.compileState.currentState;
    const table = program?.runtimeAddressTable;
    if (!program || !state || !table) {
      return null;
    }

    const trackedSlots = debugService.getTrackedSpyScalarSlots(16);
    if (trackedSlots.length === 0) {
      return null;
    }

    const entries: RuntimeSpyReadbackEntry[] = [];
    for (const slotId of trackedSlots) {
      const lookup = table.slotLookup.get(slotId);
      if (!lookup || lookup.arena.laneCount !== 1 || lookup.arena.stride < 1) {
        continue;
      }
      const value = arenaRead(state.arena, lookup.arena, 0, 0);
      if (!Number.isFinite(value)) continue;
      entries.push({
        slotId,
        value,
      });
    }

    if (entries.length === 0) {
      return null;
    }

    return {
      capturedAtMs,
      frameId: state.cache.frameId,
      entries,
    };
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
  }
}
