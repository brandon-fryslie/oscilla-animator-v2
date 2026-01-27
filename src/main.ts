/**
 * Oscilla v2 - Main Application Entry
 *
 * Single React root entry point.
 * Sets up the demo patch and animation loop.
 *
 * Sprint 2: Integrates runtime health monitoring
 * Sprint 3: Connects external channel write bus for mouse input
 * Uses registry defaults for all inputs
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { reaction } from 'mobx';
import { buildPatch, type Patch } from './graph';
import { initGlobalRenderArena, type RenderBufferArena } from './render';
import { App } from './ui/components';
import { StoreProvider, type RootStore } from './stores';
import { patches, DEFAULT_PATCH_INDEX, type PatchBuilder } from './demo';
import { loadPatchFromStorage, savePatchToStorage, clearStorageAndReload } from './services/PatchPersistence';
import {
  compileAndSwap,
  type CompileOrchestratorState,
} from './services/CompileOrchestrator';
import { detectAndLogDomainChanges, getPrevInstanceCounts } from './services/DomainChangeDetector';
import { setupLiveRecompileReaction, cleanupReaction } from './services/LiveRecompile';
import {
  startAnimationLoop,
  createAnimationLoopState,
  type AnimationLoopState,
} from './services/AnimationLoop';

// =============================================================================
// Global State
// =============================================================================

// Compile orchestrator state
const compileState: CompileOrchestratorState = {
  currentProgram: null,
  currentState: null,
  sessionState: null,
  prevInstanceCounts: getPrevInstanceCounts(),
};

// Animation loop state
let animationState: AnimationLoopState = createAnimationLoopState();

// Canvas and rendering state
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let arena: RenderBufferArena | null = null;

// Store reference - set via callback from React when StoreProvider mounts
let store: RootStore | null = null;

// Current patch index
let currentPatchIndex = DEFAULT_PATCH_INDEX;

// Expose clearStorageAndReload globally for UI
(window as unknown as { clearStorageAndReload: typeof clearStorageAndReload }).clearStorageAndReload = clearStorageAndReload;

// =============================================================================
// Patch Management
// =============================================================================

/**
 * Build a patch from a PatchBuilder and load it into the store.
 * Does NOT compile - call compileAndSwap() after this.
 */
function build(patchBuilder: PatchBuilder): Patch {
  const patch = buildPatch(patchBuilder);
  store!.patch.loadPatch(patch);
  return patch;
}

/**
 * Switch to a different patch by index
 */
async function switchPatch(index: number) {
  if (index < 0 || index >= patches.length) return;
  currentPatchIndex = index;
  window.__oscilla_currentPreset = String(index);
  build(patches[index].builder);
  await compileAndSwap(
    {
      store: store!,
      state: compileState,
      onDomainChange: (oldProg, newProg) => detectAndLogDomainChanges(store!, oldProg, newProg),
    },
    true
  );
  savePatchToStorage(store!.patch.patch, currentPatchIndex);
}

/**
 * Expose presets to React toolbar UI via window globals
 */
function exposePresetsToUI() {
  window.__oscilla_presets = patches.map((p, i) => ({ label: p.name, value: String(i) }));
  window.__oscilla_currentPreset = String(currentPatchIndex);
  window.__oscilla_defaultPreset = String(DEFAULT_PATCH_INDEX);
  window.__oscilla_switchPreset = (index: string) => switchPatch(Number(index));
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Called when React's StoreProvider has mounted and store is available.
 * This is where we initialize the runtime that depends on the store.
 */
async function initializeRuntime(rootStore: RootStore) {
  // Set the module-level store reference
  store = rootStore;

  // Initialize render buffer arena (50k elements, zero allocations after init)
  arena = initGlobalRenderArena(50_000);

  // Try to restore from localStorage, otherwise use default preset
  const saved = loadPatchFromStorage();
  if (saved) {
    currentPatchIndex = saved.presetIndex;
    store.patch.loadPatch(saved.patch);
    await compileAndSwap(
      {
        store,
        state: compileState,
        onDomainChange: (oldProg, newProg) => detectAndLogDomainChanges(store!, oldProg, newProg),
      },
      true
    );
  } else {
    // Use settings-configured default patch index (falls back to DEFAULT_PATCH_INDEX)
    const { appSettings } = await import('./settings/tokens/app-settings');
    store.settings.register(appSettings);
    const appValues = store.settings.get(appSettings);
    const settingsIndex = appValues.defaultPatchIndex;
    if (settingsIndex >= 0 && settingsIndex < patches.length) {
      currentPatchIndex = settingsIndex;
    }
    build(patches[currentPatchIndex].builder);
    await compileAndSwap(
      {
        store,
        state: compileState,
        onDomainChange: (oldProg, newProg) => detectAndLogDomainChanges(store!, oldProg, newProg),
      },
      true
    );
  }

  // Expose presets to React toolbar UI
  exposePresetsToUI();

  // Auto-persist patch to localStorage on changes (debounced by MobX)
  reaction(
    () => store!.patch.patch,
    (patch) => savePatchToStorage(patch, currentPatchIndex),
    { delay: 500 }
  );

  // Set up live recompile reaction
  setupLiveRecompileReaction(store, async () => {
    await compileAndSwap(
      {
        store: store!,
        state: compileState,
        onDomainChange: (oldProg, newProg) => detectAndLogDomainChanges(store!, oldProg, newProg),
      },
      false
    );
  });

  // Subscribe to CompileEnd events for compilation statistics
  store.events.on('CompileEnd', (event) => {
    if (event.status === 'success') {
      store!.diagnostics.recordCompilation(event.durationMs);
    }
  });

  // Start animation loop
  startAnimationLoop(
    {
      getCurrentProgram: () => compileState.currentProgram,
      getCurrentState: () => compileState.currentState,
      getCanvas: () => canvas,
      getContext: () => ctx,
      getArena: () => arena,
      store,
      onStatsUpdate: (statsText) => {
        if (window.__setStats) {
          window.__setStats(statsText);
        }
      },
    },
    animationState,
    (err) => {
      store!.diagnostics.log({
        level: 'error',
        message: `Runtime error: ${err}`,
      });
      console.error(err);
    }
  );
}

/**
 * Bootstrap the application
 */
async function main() {
  try {
    // Get app container
    const appContainer = document.getElementById('app-container');
    if (!appContainer) {
      throw new Error('App container not found');
    }

    // Create React root and render App wrapped in StoreProvider
    // StoreProvider creates and owns the store; App exposes it via onStoreReady callback
    const root = createRoot(appContainer);
    root.render(
      React.createElement(
        StoreProvider,
        null, // No store prop - StoreProvider creates its own
        React.createElement(App, {
          onCanvasReady: (canvasEl: HTMLCanvasElement) => {
            canvas = canvasEl;
            ctx = canvas.getContext('2d');
          },
          onStoreReady: (rootStore: RootStore) => {
            // Initialize runtime once store is available
            initializeRuntime(rootStore).catch((err) => {
              console.error('Failed to initialize runtime:', err);
              console.error('Runtime error message:', err?.message);
              console.error('Runtime error stack:', err?.stack);
            });
          },
          // Pass the external write bus from the session state
          // NOTE: At this point sessionState doesn't exist yet, so we'll update this
          // after compileAndSwap creates it. For now, pass undefined and rely on
          // component to handle absence gracefully.
          get externalWriteBus() {
            return compileState.currentState?.externalChannels.writeBus;
          },
        })
      )
    );
  } catch (err) {
    console.error('Failed to initialize application:', err);
  }
}

// Export cleanupReaction for testing
export { cleanupReaction };

// Run main
main();
