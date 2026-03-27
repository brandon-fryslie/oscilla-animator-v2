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

import {
  interceptLoadDemoPatch,
  validateRuntimeConsole,
  validateShowPreview,
} from './testing/test-params';

// ─── Pre-React test parameter handling ───────────────────────────────────────
// [LAW:single-enforcer] These run once before React mounts.
// interceptLoadDemoPatch: clears localStorage, stashes filename, triggers reload.
// validateShowPreview: throws on invalid values (fast feedback for test runners).
// validateRuntimeConsole: validates runtime logging toggle for debug sessions.
const navigating = interceptLoadDemoPatch();
if (!navigating) {
  validateShowPreview();
  validateRuntimeConsole();
}

// ─── Normal boot (only if not redirecting) ───────────────────────────────────

import React from 'react';
import { createRoot } from 'react-dom/client';
import { NuqsAdapter } from 'nuqs/adapters/react';
import { App, BootGateScreen } from './ui/components';
import { registerAllBlocks } from './blocks/all';
import { StoreProvider, type RootStore } from './stores';
import { RuntimeService } from './services/RuntimeService';
import { BootService } from './services/BootService';
import { ensureCrossOriginIsolationForSharedArrayBuffer } from './services/cross-origin-isolation';
import { installRuntimeBoundaryDumpBridge } from './services/runtime-boundary-dump-bridge';
import {
  initializeComposites,
  compositeStorage,
  getCompositeInitIssues,
  clearCompositeInitIssues,
  setCompositeInitIssueReporter,
} from './blocks/composites';
import type { ExternalWriteBus } from './runtime/ExternalChannel';

type StatsSink = (statsText: string) => void;
type RenderApp = () => void;

interface RuntimeBootstrapCallbacks {
  readonly statsSink: StatsSink;
  readonly renderApp: RenderApp;
}

interface RuntimeBootstrapActiveState {
  readonly kind: 'active';
  readonly canvas: HTMLCanvasElement;
  readonly store: RootStore;
  readonly runtimeService: RuntimeService;
  readonly callbacks: RuntimeBootstrapCallbacks;
}

type RuntimeBootstrapState =
  | {
    readonly kind: 'idle';
    readonly callbacks: RuntimeBootstrapCallbacks;
  }
  | {
    readonly kind: 'waiting-for-store';
    readonly canvas: HTMLCanvasElement;
    readonly callbacks: RuntimeBootstrapCallbacks;
  }
  | {
    readonly kind: 'waiting-for-canvas';
    readonly store: RootStore;
    readonly runtimeService: RuntimeService;
    readonly callbacks: RuntimeBootstrapCallbacks;
  }
  | RuntimeBootstrapActiveState;

const noopStatsSink: StatsSink = () => {};
const noopRenderApp: RenderApp = () => {};

function createRuntimeBootstrapCallbacks(): RuntimeBootstrapCallbacks {
  return {
    statsSink: noopStatsSink,
    renderApp: noopRenderApp,
  };
}

function createRuntimeService(
  rootStore: RootStore,
  callbacks: RuntimeBootstrapCallbacks,
): RuntimeService {
  return new RuntimeService(rootStore, {
    onStatsUpdate: callbacks.statsSink,
    onRuntimeReady: callbacks.renderApp,
  });
}

function createRuntimeBootstrap() {
  // [LAW:no-shared-mutable-globals] Main bootstrap mutable state is owned by a
  // single state machine instead of independent nullable slots.
  let state: RuntimeBootstrapState = {
    kind: 'idle',
    callbacks: createRuntimeBootstrapCallbacks(),
  };

  const syncRuntimeServiceCallbacks = (runtimeService: RuntimeService, callbacks: RuntimeBootstrapCallbacks): void => {
    runtimeService.setStatsSink(callbacks.statsSink);
    runtimeService.setRuntimeReadySink(callbacks.renderApp);
  };

  const startRuntime = (
    rootStore: RootStore,
    runtimeService: RuntimeService,
    canvasEl: HTMLCanvasElement,
    callbacks: RuntimeBootstrapCallbacks,
  ): RuntimeBootstrapActiveState => {
    runtimeService.setCanvas(canvasEl);
    runtimeService.init().catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      // [LAW:single-enforcer] Main boot is the one boundary that reports
      // fatal runtime init failures to both diagnostics and browser console.
      console.error('Failed to initialize runtime:', err);
      // [LAW:single-enforcer] Main boot reports runtime init failures via diagnostics.
      rootStore.diagnostics.log({
        level: 'error',
        message: `Failed to initialize runtime: ${message}`,
      });
    });
    return {
      kind: 'active',
      canvas: canvasEl,
      store: rootStore,
      runtimeService,
      callbacks,
    };
  };

  const setCallbacks = (
    current: RuntimeBootstrapState,
    callbacks: RuntimeBootstrapCallbacks,
  ): RuntimeBootstrapState => {
    switch (current.kind) {
      case 'idle':
        return { kind: 'idle', callbacks };
      case 'waiting-for-store':
        return { kind: 'waiting-for-store', canvas: current.canvas, callbacks };
      case 'waiting-for-canvas':
        syncRuntimeServiceCallbacks(current.runtimeService, callbacks);
        return { ...current, callbacks };
      case 'active':
        syncRuntimeServiceCallbacks(current.runtimeService, callbacks);
        return { ...current, callbacks };
    }
  };

  return {
    setCanvas(canvasEl: HTMLCanvasElement): void {
      switch (state.kind) {
        case 'idle':
          state = {
            kind: 'waiting-for-store',
            canvas: canvasEl,
            callbacks: state.callbacks,
          };
          return;
        case 'waiting-for-store':
          state = {
            kind: 'waiting-for-store',
            canvas: canvasEl,
            callbacks: state.callbacks,
          };
          return;
        case 'waiting-for-canvas':
          // [LAW:dataflow-not-control-flow] Runtime init depends on acquiring a
          // total bootstrap tuple (store + canvas), not callback ordering.
          state = startRuntime(state.store, state.runtimeService, canvasEl, state.callbacks);
          return;
        case 'active':
          state.runtimeService.setCanvas(canvasEl);
          state = {
            ...state,
            canvas: canvasEl,
          };
      }
    },
    setStore(rootStore: RootStore): void {
      switch (state.kind) {
        case 'idle': {
          const runtimeService = createRuntimeService(rootStore, state.callbacks);
          state = {
            kind: 'waiting-for-canvas',
            store: rootStore,
            runtimeService,
            callbacks: state.callbacks,
          };
          return;
        }
        case 'waiting-for-store': {
          const runtimeService = createRuntimeService(rootStore, state.callbacks);
          state = startRuntime(rootStore, runtimeService, state.canvas, state.callbacks);
          return;
        }
        case 'waiting-for-canvas':
        case 'active': {
          state.runtimeService.dispose();
          const runtimeService = createRuntimeService(rootStore, state.callbacks);
          state = state.kind === 'active'
            ? startRuntime(rootStore, runtimeService, state.canvas, state.callbacks)
            : {
              kind: 'waiting-for-canvas',
              store: rootStore,
              runtimeService,
              callbacks: state.callbacks,
            };
        }
      }
    },
    setStatsSink(sink: StatsSink | null): void {
      state = setCallbacks(state, {
        ...state.callbacks,
        statsSink: sink ?? noopStatsSink,
      });
    },
    setRenderApp(renderApp: RenderApp | null): void {
      state = setCallbacks(state, {
        ...state.callbacks,
        renderApp: renderApp ?? noopRenderApp,
      });
    },
    getExternalWriteBus(): ExternalWriteBus | undefined {
      switch (state.kind) {
        case 'idle':
        case 'waiting-for-store':
          return undefined;
        case 'waiting-for-canvas':
        case 'active':
          return state.runtimeService.compileState.currentState?.externalChannels.writeBus;
      }
    },
    getRuntimeService(): RuntimeService | null {
      switch (state.kind) {
        case 'idle':
        case 'waiting-for-store':
          return null;
        case 'waiting-for-canvas':
        case 'active':
          return state.runtimeService;
      }
    },
    async submitRawGpuPayload(passes: readonly import('./render/rust/worker-protocol').RustRendererGpuPass[]): Promise<void> {
      switch (state.kind) {
        case 'idle':
        case 'waiting-for-store':
        case 'waiting-for-canvas':
          throw new Error('Cannot submit raw GPU payload: renderer is not yet active');
        case 'active':
          await state.runtimeService.submitRawGpuPayload(passes);
      }
    },
    dispose(): void {
      switch (state.kind) {
        case 'waiting-for-canvas':
        case 'active':
          state.runtimeService.dispose();
          break;
        case 'idle':
        case 'waiting-for-store':
          break;
      }
      state = {
        kind: 'idle',
        callbacks: createRuntimeBootstrapCallbacks(),
      };
    },
  };
}

const runtimeBootstrap = createRuntimeBootstrap();
const bootService = new BootService();
installRuntimeBoundaryDumpBridge(() => {
  const runtimeService = runtimeBootstrap.getRuntimeService();
  if (!runtimeService) {
    throw new Error('Runtime boundary fixture dump is unavailable: runtime has not initialized yet');
  }
  return runtimeService.dumpLatestRendererBoundaryFixtureV1();
});

async function main() {
  registerAllBlocks();
  initializeComposites();

  const appContainer = document.getElementById('app-container');
  if (!appContainer) throw new Error('App container not found');

  const root = createRoot(appContainer);
  const unsubscribeBoot = bootService.subscribe((snapshot) => {
    root.render(React.createElement(BootGateScreen, { snapshot }));
  });
  const bootSnapshot = await bootService.start();
  if (bootSnapshot.state !== 'ready') {
    // [LAW:no-silent-fallbacks] WASM boot is a hard prerequisite; app UI stays
    // in explicit fatal state instead of rendering without compiler runtime.
    unsubscribeBoot();
    return;
  }
  unsubscribeBoot();

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
  void ensureCrossOriginIsolationForSharedArrayBuffer()
    .then((shouldBootApp) => {
      if (!shouldBootApp) {
        return;
      }
      main();
    })
    .catch((error: unknown) => {
      console.error('Failed to initialize cross-origin isolation bootstrap:', error);
      main();
    });
}
