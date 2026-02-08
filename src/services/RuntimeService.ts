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
import {
  compileAndSwap,
  type CompileOrchestratorState,
} from './CompileOrchestrator';
import { detectAndLogDomainChanges, getPrevInstanceCounts } from './DomainChangeDetector';
import { setupLiveRecompileReaction, cleanupReaction } from './LiveRecompile';
import { patchProgramConstants } from './ConstantPatcher';
import {
  startAnimationLoop,
  createAnimationLoopState,
  type AnimationLoopState,
} from './AnimationLoop';

export class RuntimeService {
  readonly compileState: CompileOrchestratorState = {
    currentProgram: null,
    currentState: null,
    sessionState: null,
    prevInstanceCounts: getPrevInstanceCounts(),
  };

  private animationState: AnimationLoopState = createAnimationLoopState();
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private arena: RenderBufferArena | null = null;

  private cancelAnimationLoop: (() => void) | null = null;
  private unsubCompileEnd: (() => void) | null = null;

  constructor(private readonly store: RootStore) {}

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

    // Initialize render buffer arena (50k elements, zero allocations after init)
    this.arena = initGlobalRenderArena(50_000);

    // Register settings tokens (before any compile call)
    const { appSettings } = await import('../settings/tokens/app-settings');
    store.settings.register(appSettings);
    const { compilerFlagsSettings } = await import('../settings/tokens/compiler-flags-settings');
    store.settings.register(compilerFlagsSettings);

    // Try to restore from localStorage, otherwise load default demo
    const saved = loadPatchFromStorage();
    if (saved) {
      store.demo.currentFilename = null;
      store.patch.loadPatch(saved.patch);
    } else {
      store.demo.loadDefault();
    }

    // Initial compile (isInitial=true — hard swap)
    try {
      await compileAndSwap(
        {
          store,
          state: this.compileState,
          onDomainChange: (oldProg, newProg) => detectAndLogDomainChanges(store, oldProg, newProg),
        },
        true
      );
    } catch (err) {
      console.error('Initial compilation failed:', err);
      store.diagnostics.log({
        level: 'error',
        message: `Initial compilation failed: ${err instanceof Error ? err.message : err}`,
      });
    }

    // Re-render App to update externalWriteBus prop now that runtime state exists
    if ((window as any).__renderApp) {
      (window as any).__renderApp();
    }

    // Start auto-persistence (PatchStore watches itself)
    store.patch.startPersistence();

    // Set up live recompile reaction with fast-path for constant value changes
    setupLiveRecompileReaction(store, async () => {
      await compileAndSwap(
        {
          store,
          state: this.compileState,
          onDomainChange: (oldProg, newProg) => detectAndLogDomainChanges(store, oldProg, newProg),
        },
        false
      );
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
        store.diagnostics.log({
          level: 'error',
          message: `Runtime error: ${err}`,
        });
        console.error(err);
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
    this.unsubCompileEnd?.();
    this.unsubCompileEnd = null;
    this.store.patch.stopPersistence();
    cleanupReaction();
  }
}
