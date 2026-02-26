/**
 * Oscilla v2 - Main Application Entry
 *
 * Thin bootstrap: initializes composites, creates React root,
 * and wires RuntimeService when the store is ready.
 *
 * All runtime lifecycle is owned by RuntimeService.
 * All demo state is owned by DemoStore.
 * All persistence is owned by PatchStore.
 */

import { interceptLoadDemoPatch, validateShowPreview } from './testing/test-params';

// ─── Pre-React test parameter handling ───────────────────────────────────────
// [LAW:single-enforcer] These run once before React mounts.
// interceptLoadDemoPatch: clears localStorage, stashes filename, triggers reload.
// validateShowPreview: throws on invalid values (fast feedback for test runners).
const navigating = interceptLoadDemoPatch();
if (!navigating) {
  validateShowPreview();
}

// ─── Normal boot (only if not redirecting) ───────────────────────────────────

import React from 'react';
import { createRoot } from 'react-dom/client';
import { NuqsAdapter } from 'nuqs/adapters/react';
import { App } from './ui/components';
import { registerAllBlocks } from './blocks/all';
import { StoreProvider, type RootStore } from './stores';
import { RuntimeService } from './services/RuntimeService';
import {
  initializeComposites,
  compositeStorage,
  getCompositeInitIssues,
  clearCompositeInitIssues,
  setCompositeInitIssueReporter,
} from './blocks/composites';
import type { ExternalWriteBus } from './runtime/ExternalChannel';

function createRuntimeBootstrap() {
  // [LAW:no-shared-mutable-globals] Main bootstrap mutable state is owned by a
  // single coordinator object instead of module-level mutable variables.
  const state: {
    runtimeService: RuntimeService | null;
    pendingCanvas: HTMLCanvasElement | null;
    pendingStore: RootStore | null;
    runtimeInitStarted: boolean;
    statsSink: ((statsText: string) => void) | null;
    renderApp: (() => void) | null;
  } = {
    runtimeService: null,
    pendingCanvas: null,
    pendingStore: null,
    runtimeInitStarted: false,
    statsSink: null,
    renderApp: null,
  };

  const tryInitRuntime = (): void => {
    if (state.runtimeInitStarted || !state.runtimeService || !state.pendingStore || !state.pendingCanvas) return;
    state.runtimeInitStarted = true;
    state.runtimeService.setCanvas(state.pendingCanvas);
    state.pendingCanvas = null;
    state.runtimeService.init().catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      // [LAW:single-enforcer] Main boot is the one boundary that reports
      // fatal runtime init failures to both diagnostics and browser console.
      console.error('Failed to initialize runtime:', err);
      // [LAW:single-enforcer] Main boot reports runtime init failures via diagnostics.
      state.pendingStore?.diagnostics.log({
        level: 'error',
        message: `Failed to initialize runtime: ${message}`,
      });
    });
  };

  return {
    setCanvas(canvasEl: HTMLCanvasElement): void {
      state.pendingCanvas = canvasEl;
      state.runtimeService?.setCanvas(canvasEl);
      // [LAW:dataflow-not-control-flow] Runtime init depends on data readiness
      // (store/canvas presence), not callback ordering.
      tryInitRuntime();
    },
    setStore(rootStore: RootStore): void {
      state.pendingStore = rootStore;
      state.runtimeService = new RuntimeService(rootStore, {
        onStatsUpdate: (statsText) => state.statsSink?.(statsText),
        onRuntimeReady: () => state.renderApp?.(),
      });
      tryInitRuntime();
    },
    setStatsSink(sink: ((statsText: string) => void) | null): void {
      state.statsSink = sink;
      state.runtimeService?.setStatsSink(sink);
    },
    setRenderApp(renderApp: (() => void) | null): void {
      state.renderApp = renderApp;
      state.runtimeService?.setRuntimeReadySink(renderApp);
    },
    getExternalWriteBus(): ExternalWriteBus | undefined {
      return state.runtimeService?.compileState.currentState?.externalChannels.writeBus;
    },
    dispose(): void {
      state.runtimeService?.dispose();
      state.runtimeService = null;
      state.pendingCanvas = null;
      state.pendingStore = null;
      state.runtimeInitStarted = false;
      state.statsSink = null;
      state.renderApp = null;
    },
  };
}

const runtimeBootstrap = createRuntimeBootstrap();

async function main() {
  registerAllBlocks();
  initializeComposites();

  const appContainer = document.getElementById('app-container');
  if (!appContainer) throw new Error('App container not found');

  const root = createRoot(appContainer);

  const renderApp = () => {
    root.render(
      React.createElement(
        NuqsAdapter,
        null,
        React.createElement(
          StoreProvider,
          null,
          React.createElement(App, {
            onCanvasReady: (canvasEl: HTMLCanvasElement) => {
              runtimeBootstrap.setCanvas(canvasEl);
            },
            onStoreReady: (rootStore: RootStore) => {
              // [LAW:single-enforcer] Main boot routes composite persistence/init
              // issues into diagnostics as the canonical user-visible sink.
              compositeStorage.setIssueReporter((issue) => {
                rootStore.diagnostics.log({
                  level: issue.level,
                  message: `CompositeStorage: ${issue.message}`,
                });
              });
              setCompositeInitIssueReporter((issue) => {
                rootStore.diagnostics.log({
                  level: issue.level,
                  message: `CompositeInit: ${issue.message}`,
                });
              });
              for (const issue of compositeStorage.getIssues()) {
                rootStore.diagnostics.log({
                  level: issue.level,
                  message: `CompositeStorage: ${issue.message}`,
                });
              }
              compositeStorage.clearIssues();
              for (const issue of getCompositeInitIssues()) {
                rootStore.diagnostics.log({
                  level: issue.level,
                  message: `CompositeInit: ${issue.message}`,
                });
              }
              clearCompositeInitIssues();

              runtimeBootstrap.setStore(rootStore);
            },
            onStatsSinkReady: (sink) => {
              runtimeBootstrap.setStatsSink(sink);
            },
            externalWriteBus: runtimeBootstrap.getExternalWriteBus(),
          })
        )
      )
    );
  };

  runtimeBootstrap.setRenderApp(renderApp);
  renderApp();
}

// HMR cleanup
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    // [LAW:single-enforcer] Runtime bootstrap owns cleanup lifecycle.
    runtimeBootstrap.dispose();
  });
}

if (!navigating) {
  main();
}
