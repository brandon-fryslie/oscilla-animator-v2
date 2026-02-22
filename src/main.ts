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
import { StoreProvider, type RootStore } from './stores';
import { RuntimeService } from './services/RuntimeService';
import {
  initializeComposites,
  compositeStorage,
  getCompositeInitIssues,
  clearCompositeInitIssues,
  setCompositeInitIssueReporter,
} from './blocks/composites';

let runtimeService: RuntimeService | null = null;
let pendingCanvas: HTMLCanvasElement | null = null;

async function main() {
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
              if (runtimeService) {
                runtimeService.setCanvas(canvasEl);
              } else {
                // TestPreviewPanel fires onCanvasReady before onStoreReady
                // (child effects run before parent effects). Buffer the element.
                pendingCanvas = canvasEl;
              }
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

              runtimeService = new RuntimeService(rootStore);
              if (pendingCanvas) {
                runtimeService.setCanvas(pendingCanvas);
                pendingCanvas = null;
              }
              runtimeService.init().catch((err) => {
                const message = err instanceof Error ? err.message : String(err);
                // [LAW:single-enforcer] Main boot reports runtime init failures via diagnostics.
                rootStore.diagnostics.log({
                  level: 'error',
                  message: `Failed to initialize runtime: ${message}`,
                });
              });
            },
            externalWriteBus: runtimeService?.compileState.currentState?.externalChannels.writeBus,
          })
        )
      )
    );
  };

  renderApp();
  (window as any).__renderApp = renderApp;
}

// HMR cleanup
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    runtimeService?.dispose();
  });
}

if (!navigating) {
  main();
}
