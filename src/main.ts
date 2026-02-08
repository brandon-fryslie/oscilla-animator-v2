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

import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/components';
import { StoreProvider, type RootStore } from './stores';
import { RuntimeService } from './services/RuntimeService';
import { initializeComposites } from './blocks/composites';

let runtimeService: RuntimeService | null = null;

async function main() {
  initializeComposites();

  const appContainer = document.getElementById('app-container');
  if (!appContainer) throw new Error('App container not found');

  const root = createRoot(appContainer);

  const renderApp = () => {
    root.render(
      React.createElement(
        StoreProvider,
        null,
        React.createElement(App, {
          onCanvasReady: (canvasEl: HTMLCanvasElement) => {
            runtimeService?.setCanvas(canvasEl);
          },
          onStoreReady: (rootStore: RootStore) => {
            runtimeService = new RuntimeService(rootStore);
            runtimeService.init().catch((err) => {
              console.error('Failed to initialize runtime:', err);
            });
          },
          externalWriteBus: runtimeService?.compileState.currentState?.externalChannels.writeBus,
        })
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

main();
