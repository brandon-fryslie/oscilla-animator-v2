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
import { initGlobalRenderArena, type RenderBufferArena } from './render';
import { App } from './ui/components';
import { StoreProvider, type RootStore } from './stores';
import { hclDemos } from './demo';
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
import { initializeComposites } from './blocks/composites';

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

// Currently loaded demo filename (null if restored from localStorage or custom)
let currentDemoFilename: string | null = null;

// Expose clearStorageAndReload globally for UI
(window as unknown as { clearStorageAndReload: typeof clearStorageAndReload }).clearStorageAndReload = clearStorageAndReload;

// =============================================================================
// Demo Management
// =============================================================================

/**
 * Switch to an HCL demo by filename.
 */
async function switchDemo(filename: string) {
  const demo = hclDemos.find(d => d.filename === filename);
  if (!demo) return;

  currentDemoFilename = filename;
  window.__oscilla_currentDemo = filename;

  store!.patch.loadFromHCL(demo.hcl);
  await compileAndSwap(
    {
      store: store!,
      state: compileState,
      onDomainChange: (oldProg, newProg) => detectAndLogDomainChanges(store!, oldProg, newProg),
    },
    true
  );
  savePatchToStorage(store!.patch.patch, 0);
}

/**
 * Expose HCL demos to React toolbar UI via window globals
 */
function exposeDemosToUI() {
  window.__oscilla_demos = hclDemos.map(d => ({ name: d.name, filename: d.filename }));
  window.__oscilla_switchDemo = (filename: string) => switchDemo(filename);
  window.__oscilla_currentDemo = currentDemoFilename;
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

  // Register all settings tokens unconditionally (before any compile call)
  const { appSettings } = await import('./settings/tokens/app-settings');
  store.settings.register(appSettings);
  const { compilerFlagsSettings } = await import('./settings/tokens/compiler-flags-settings');
  store.settings.register(compilerFlagsSettings);

  // Try to restore from localStorage, otherwise load default HCL demo
  const saved = loadPatchFromStorage();
  if (saved) {
    // Restored from localStorage — no demo is "selected"
    currentDemoFilename = null;
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
    // First load: use "Simple" HCL demo
    const defaultDemo = hclDemos.find(d => d.filename === 'simple.hcl') ?? hclDemos[0];
    if (defaultDemo) {
      currentDemoFilename = defaultDemo.filename;
      store.patch.loadFromHCL(defaultDemo.hcl);
    }
    await compileAndSwap(
      {
        store,
        state: compileState,
        onDomainChange: (oldProg, newProg) => detectAndLogDomainChanges(store!, oldProg, newProg),
      },
      true
    );
  }

  // Re-render App to update externalWriteBus prop now that runtime state exists
  if ((window as any).__renderApp) {
    (window as any).__renderApp();
  }

  // Expose HCL demos to React toolbar UI
  exposeDemosToUI();

  // Auto-persist patch to localStorage on changes (debounced by MobX)
  reaction(
    () => store!.patch.patch,
    (patch) => savePatchToStorage(patch, 0),
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
    // Initialize composite block system (library + user composites)
    initializeComposites();

    // Get app container
    const appContainer = document.getElementById('app-container');
    if (!appContainer) {
      throw new Error('App container not found');
    }

    // Create React root and render App wrapped in StoreProvider
    // StoreProvider creates and owns the store; App exposes it via onStoreReady callback
    const root = createRoot(appContainer);

    // Function to render app with current externalWriteBus
    const renderApp = () => {
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
            // Pass the external write bus from the current runtime state
            externalWriteBus: compileState.currentState?.externalChannels.writeBus,
          })
        )
      );
    };

    // Initial render (externalWriteBus will be undefined until first compile)
    renderApp();

    // Store renderApp globally so it can be called after compile
    (window as any).__renderApp = renderApp;
  } catch (err) {
    console.error('Failed to initialize application:', err);
  }
}

// Export cleanupReaction for testing
export { cleanupReaction };

// Run main
main();
