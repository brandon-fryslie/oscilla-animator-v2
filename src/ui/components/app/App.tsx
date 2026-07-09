/**
 * App Component
 *
 * Root React component for the entire application.
 * Manages the overall layout with Dockview:
 * - Toolbar (top, outside Dockview)
 * - Dockview workspace (all panels)
 *
 * Handles editor context switching when users switch between editor tabs.
 * Provides global keyboard shortcuts.
 */

import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { MantineProvider, createTheme as createMantineTheme, virtualColor } from '@mantine/core';
import '@mantine/core/styles.css';
import { BlockCatalogProvider } from '../../graphEditor/BlockCatalogContext';
import { SelectionDetailProvider } from '../../graphEditor/SelectionDetailContext';
import { useStores, type RootStore } from '../../../stores';
import type { ExternalWriteBus } from '../../../runtime/ExternalChannel';
import { ExternalWriteBusContext } from '../../ExternalWriteBusContext';
import { useShowPreview, resolveBootSelection } from '../../../testing/test-params';
import { TestPreviewPanel } from '../../../testing/TestPreviewPanel';
import { resolveEditorEra } from './editorEra';

// Mantine dark theme configuration - gorgeous modern look
const mantineTheme = createMantineTheme({
  primaryColor: 'violet',
  colors: {
    // Custom dark colors for our UI
    dark: [
      '#C1C2C5',
      '#A6A7AB',
      '#909296',
      '#5C5F66',
      '#373A40',
      '#2C2E33',
      '#25262B',
      '#1A1B1E',
      '#141517',
      '#101113',
    ],
    // Accent color for highlights
    accent: [
      '#E8DEFF',
      '#D0BFFF',
      '#B197FC',
      '#9775FA',
      '#845EF7',
      '#7950F2',
      '#7048E8',
      '#6741D9',
      '#5F3DC4',
      '#5235AB',
    ],
    // Vibrant gradient for special elements
    vibrant: virtualColor({
      name: 'vibrant',
      dark: 'violet',
      light: 'violet',
    }),
  },
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontFamilyMonospace: '"SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  headings: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontWeight: '600',
  },
  radius: {
    xs: '4px',
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
  },
  defaultRadius: 'md',
  components: {
    Button: {
      defaultProps: {
        size: 'sm',
      },
      styles: {
        root: {
          fontWeight: 500,
        },
      },
    },
    ActionIcon: {
      defaultProps: {
        variant: 'subtle',
      },
    },
    TextInput: {
      styles: {
        input: {
          backgroundColor: 'var(--mantine-color-dark-7)',
          borderColor: 'var(--mantine-color-dark-5)',
        },
      },
    },
  },
});

interface AppProps {
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  onStoreReady?: (store: RootStore) => void;
  onStatsSinkReady?: (sink: ((statsText: string) => void) | null) => void;
  externalWriteBus?: ExternalWriteBus;
}

export const App: React.FC<AppProps> = ({ onCanvasReady, onStoreReady, onStatsSinkReady, externalWriteBus }) => {
  const showPreview = useShowPreview();
  const [stats, setStats] = useState('FPS: --');

  // Get store from context and expose to non-React code via callback
  const rootStore = useStores();

  // [LAW:dataflow-not-control-flow] The era is one value resolved from the boot
  //   selection; App reads it and mounts `era.Shell`. Both the block catalog and
  //   the inspector's SelectionDetail come from that same value, provided once at
  //   this boot shell (the level the dockview inspector panels reach). The runtime
  //   dispatch reads the same BootSelection, so chrome and render path never
  //   disagree. [LAW:one-source-of-truth]
  const era = useMemo(() => resolveEditorEra(resolveBootSelection()), []);
  const selectionDetail = useMemo(() => era.makeSelectionDetail(rootStore), [era, rootStore]);

  // Notify main.ts when store is available (once on mount)
  const storeReadyRef = useRef(false);
  useEffect(() => {
    if (!storeReadyRef.current && onStoreReady) {
      storeReadyRef.current = true;
      onStoreReady(rootStore);
    }
  }, [rootStore, onStoreReady]);

  // Initialize ref with prop value so it's available immediately on first render
  const canvasCallbackRef = useRef<((canvas: HTMLCanvasElement) => void) | undefined>(onCanvasReady);

  // Keep ref in sync with prop changes
  useEffect(() => {
    canvasCallbackRef.current = onCanvasReady;
  }, [onCanvasReady]);

  // Stable callback that reads from ref - never changes identity
  const handleCanvasReady = useCallback((canvas: HTMLCanvasElement) => {
    canvasCallbackRef.current?.(canvas);
  }, []);

  // [LAW:no-shared-mutable-globals] Stats updates flow through explicit
  // callback plumbing rather than a window-level mutable callback.
  useEffect(() => {
    onStatsSinkReady?.(setStats);
    return () => {
      onStatsSinkReady?.(null);
    };
  }, [onStatsSinkReady]);

  const Shell = era.Shell;

  return (
    <MantineProvider theme={mantineTheme} defaultColorScheme="dark">
      <ExternalWriteBusContext.Provider value={externalWriteBus}>
        {showPreview ? (
          /* Test automation: full-viewport canvas or errors, zero chrome */
          <TestPreviewPanel onCanvasReady={handleCanvasReady} />
        ) : (
          <BlockCatalogProvider catalog={era.blockCatalog}>
            <SelectionDetailProvider detail={selectionDetail}>
              <Shell stats={stats} onCanvasReady={handleCanvasReady} />
            </SelectionDetailProvider>
          </BlockCatalogProvider>
        )}
      </ExternalWriteBusContext.Provider>
    </MantineProvider>
  );
};
