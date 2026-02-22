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

import { initGlobalRenderArena, type RenderBufferArena } from '../render';
import type { RootStore } from '../stores';
import { loadPatchFromStorage, savePatchToStorage } from './PatchPersistence';
import { consumeTestDemoFilename } from '../testing/test-params';
import {
  compileAndSwap,
  type CompileOrchestratorState,
  type PrecomputedCompileArtifacts,
} from './CompileOrchestrator';
import { CompileWorkerClient, CompileSupersededError } from './CompileWorkerClient';
import { createDomainChangeDetector, type DomainChangeDetector } from './DomainChangeDetector';
import { createLiveRecompileController, type LiveRecompileController } from './LiveRecompile';
import { patchProgramConstants } from './ConstantPatcher';
import { debugService } from './DebugService';
import {
  startAnimationLoop,
  createAnimationLoopState,
  type AnimationLoopState,
} from './AnimationLoop';
import { debugSettings } from '../settings/tokens/debug-settings';
import { compilerFlagsSettings } from '../settings/tokens/compiler-flags-settings';
import { appSettings } from '../settings/tokens/app-settings';

export class RuntimeService {
  private readonly domainChangeDetector: DomainChangeDetector = createDomainChangeDetector();

  readonly compileState: CompileOrchestratorState = {
    currentProgram: null,
    currentState: null,
    sessionState: null,
  };

  private animationState: AnimationLoopState = createAnimationLoopState();
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private arena: RenderBufferArena | null = null;

  private cancelAnimationLoop: (() => void) | null = null;
  private unsubCompileEnd: (() => void) | null = null;
  private compileWorkerClient: CompileWorkerClient | null = null;
  private pendingSwap: PrecomputedCompileArtifacts | null = null;
  private pendingMainThreadCompile = false;
  private swapInFlight = false;
  private swapRafId: number | null = null;
  private lastWorkerFallbackLog = { message: '', atMs: 0 };
  private readonly liveRecompile: LiveRecompileController = createLiveRecompileController();

  constructor(private readonly store: RootStore) {}

  private logWorkerFallback(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    const now = performance.now();
    const unchanged = this.lastWorkerFallbackLog.message === message;
    const withinWindow = now - this.lastWorkerFallbackLog.atMs < 2000;
    if (unchanged && withinWindow) return;

    this.lastWorkerFallbackLog = { message, atMs: now };
    this.store.diagnostics.log({
      level: 'warn',
      message: `Compile worker failed, falling back to main-thread compile: ${message}`,
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

  private requestSwapFlush(): void {
    if (this.swapRafId !== null) return;
    this.swapRafId = requestAnimationFrame(() => {
      this.swapRafId = null;
      void this.flushPendingSwap();
    });
  }

  private async flushPendingSwap(): Promise<void> {
    if (this.swapInFlight) return;
    const next = this.pendingSwap;
    const shouldRunMainThreadCompile = next == null && this.pendingMainThreadCompile;
    if (!next && !shouldRunMainThreadCompile) return;

    this.pendingSwap = null;
    this.pendingMainThreadCompile = false;
    this.swapInFlight = true;
    try {
      // [LAW:single-enforcer] All compile/swap application goes through this queue.
      if (next) {
        await compileAndSwap(this.compileDeps(), false, next);
      } else {
        await compileAndSwap(this.compileDeps(), false);
      }
    } finally {
      this.swapInFlight = false;
      if (this.pendingSwap || this.pendingMainThreadCompile) {
        this.requestSwapFlush();
      }
    }
  }

  /**
   * Called by React when the canvas element is available.
   */
  setCanvas(canvasEl: HTMLCanvasElement): void {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
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
    this.compileWorkerClient = new CompileWorkerClient();
    // [LAW:single-enforcer] RuntimeService owns debug lifecycle boundaries.
    debugService.clear();

    // Initialize render buffer arena (50k elements, zero allocations after init)
    this.arena = initGlobalRenderArena(50_000);

    // Register settings tokens (before any compile call)
    store.settings.register(appSettings);
    store.settings.register(compilerFlagsSettings);

    // Check for test automation demo marker (set by ?loadDemoPatch= before reload)
    const testDemo = consumeTestDemoFilename();
    if (testDemo) {
      const loaded = store.demo.selectDemo(testDemo);
      if (!loaded) {
        console.error(
          `[test-params] Demo not found: "${testDemo}". Available: ${store.demo.demos.map(d => d.filename).join(', ')}`
        );
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
      // compileAndSwap already logs structured errors to diagnostics before throwing.
      // Only console.error here for developer debugging — no duplicate log entry.
      // [LAW:one-source-of-truth] Single structured log in CompileOrchestrator.
      console.error('Initial compilation failed:', err);
    }

    // Re-render App to update externalWriteBus prop now that runtime state exists
    if ((window as any).__renderApp) {
      (window as any).__renderApp();
    }

    // Start auto-persistence (PatchStore watches itself)
    store.patch.startPersistence();

    // Set up live recompile reaction with fast-path for constant value changes
    this.liveRecompile.setup(store, async () => {
      try {
        const debugValues = store.settings.get(debugSettings);
        const flagOverrides = store.settings.get(compilerFlagsSettings);
        const precomputed = await this.compileWorkerClient!.compile({
          patch: store.patch.patch,
          patchRevision: store.getPatchRevision(),
          frontendOptions: {
            traceCardinalitySolver: debugValues?.traceCardinalitySolver,
            diagnosticOverrides: flagOverrides ?? undefined,
          },
        });

        // [LAW:dataflow-not-control-flow] Swap application is always driven through
        // the same queue; variability is the queued payload, not execution path.
        this.pendingSwap = precomputed;
        this.requestSwapFlush();
      } catch (err) {
        if (err instanceof CompileSupersededError) {
          return;
        }
        this.logWorkerFallback(err);
        this.pendingMainThreadCompile = true;
        this.requestSwapFlush();
      }
    }, (changes) => {
      const program = this.compileState.currentProgram;
      if (!program) return false;
      const patched = patchProgramConstants(program, changes);
      if (!patched) return false;
      this.compileState.currentProgram = patched;
      return true;
    });

    // Subscribe to CompileEnd events for compilation statistics
    this.unsubCompileEnd = store.events.on('CompileEnd', (event) => {
      if (event.status === 'success') {
        store.diagnostics.recordCompilation(event.durationMs);
      }
    });

    // Start animation loop
    this.cancelAnimationLoop = startAnimationLoop(
      {
        getCurrentProgram: () => this.compileState.currentProgram,
        getCurrentState: () => this.compileState.currentState,
        getCanvas: () => this.canvas,
        getContext: () => this.ctx,
        getArena: () => this.arena,
        store,
        onStatsUpdate: (statsText) => {
          if (window.__setStats) {
            window.__setStats(statsText);
          }
        },
      },
      this.animationState,
      (err) => {
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
        console.error('Runtime error (execution halted):', err);
      }
    );

    // Persist current patch immediately after initial compile
    // (covers the case where we loaded a default demo)
    savePatchToStorage(store.patch.patch, 0);
  }

  /**
   * Dispose all long-lived resources (HMR cleanup).
   */
  dispose(): void {
    this.cancelAnimationLoop?.();
    this.cancelAnimationLoop = null;
    if (this.swapRafId !== null) {
      cancelAnimationFrame(this.swapRafId);
      this.swapRafId = null;
    }
    this.pendingSwap = null;
    this.pendingMainThreadCompile = false;
    this.swapInFlight = false;
    this.unsubCompileEnd?.();
    this.unsubCompileEnd = null;
    this.compileWorkerClient?.dispose();
    this.compileWorkerClient = null;
    this.store.patch.stopPersistence();
    this.domainChangeDetector.cleanup();
    this.liveRecompile.cleanup();
    debugService.clear();
  }
}
