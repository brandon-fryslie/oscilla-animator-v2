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

import React, { useCallback, useState, useEffect, useRef } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { MantineProvider, createTheme as createMantineTheme, virtualColor } from '@mantine/core';
import '@mantine/core/styles.css';
import { Toolbar } from './Toolbar';
import { EditorProvider, type EditorHandle, useEditor } from '../../editorCommon';
import { DockviewProvider } from '../../dockview';
import type { DockviewApi } from 'dockview';
import { darkTheme } from '../../theme';
import { useGlobalHotkeys, type HotkeyFeedback } from '../../hotkeys';
import { Toast } from '../common/Toast';
import { useStores, type RootStore } from '../../../stores';
import type { ExternalWriteBus } from '../../../runtime/ExternalChannel';
import { ExternalWriteBusContext } from '../../ExternalWriteBusContext';

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
  externalWriteBus?: ExternalWriteBus;
}

export const App: React.FC<AppProps> = ({ onCanvasReady, onStoreReady, externalWriteBus }) => {
  const [stats, setStats] = useState('FPS: --');

  // Get store from context and expose to non-React code via callback
  const rootStore = useStores();

  // Notify main.ts when store is available (once on mount)
  const storeReadyRef = useRef(false);
  useEffect(() => {
    if (!storeReadyRef.current && onStoreReady) {
      storeReadyRef.current = true;
      onStoreReady(rootStore);
    }
  }, [rootStore, onStoreReady]);

  // Store handle for React Flow editor
  const reactFlowHandleRef = useRef<EditorHandle | null>(null);
  const editorContextRef = useRef<{ setEditorHandle: (handle: EditorHandle | null) => void } | null>(null);
  const [activeEditorTab, setActiveEditorTab] = useState<'flow-editor' | 'composite-editor' | null>('flow-editor');
  const [editorReady, setEditorReady] = useState(false);

  // Dockview API for toolbar panel focus
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);

  // Toast state for keyboard shortcuts
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastSeverity, setToastSeverity] = useState<'success' | 'error'>('success');

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

  // Make setStats available globally for main.ts
  useEffect(() => {
    window.__setStats = setStats;
    return () => {
      delete window.__setStats;
    };
  }, []);

  // Handle editor ready callback
  const handleReactFlowEditorReady = useCallback((adapter: EditorHandle) => {
    reactFlowHandleRef.current = adapter;
    setEditorReady(true);
  }, []);

  // Handle Dockview panel activation to update active editor
  const handleActivePanelChange = useCallback((panelId: string | undefined) => {
    if (panelId === 'flow-editor') {
      setActiveEditorTab('flow-editor');
    } else if (panelId === 'composite-editor') {
      // CompositeEditor manages its own EditorHandle via useEditor()
      setActiveEditorTab('composite-editor');
    } else {
      // Non-editor panel activated, clear active editor
      setActiveEditorTab(null);
    }
  }, []);

  // Update EditorContext when active editor changes or editor becomes ready
  useEffect(() => {
    if (!editorContextRef.current) return;

    if (activeEditorTab === 'flow-editor' && editorReady) {
      editorContextRef.current.setEditorHandle(reactFlowHandleRef.current);
    } else if (activeEditorTab === 'composite-editor') {
      // CompositeEditor sets its own handle - don't interfere
    } else if (activeEditorTab === null) {
      editorContextRef.current.setEditorHandle(null);
    }
  }, [activeEditorTab, editorReady]);

  // Global hotkey feedback handler
  const handleHotkeyFeedback = useCallback((feedback: HotkeyFeedback) => {
    setToastMessage(feedback.message);
    setToastSeverity(feedback.severity);
    setToastOpen(true);
  }, []);

  const handleToastClose = () => {
    setToastOpen(false);
  };

  return (
    <MantineProvider theme={mantineTheme} defaultColorScheme="dark">
      <ThemeProvider theme={darkTheme}>
        <ExternalWriteBusContext.Provider value={externalWriteBus}>
          <EditorProvider>
          {/* Capture EditorContext methods */}
          <EditorContextCapture contextRef={editorContextRef} />
          <GlobalHotkeys onFeedback={handleHotkeyFeedback} />

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              height: '100vh',
              overflow: 'hidden',
              background: '#1a1a2e',
              color: '#eee',
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            }}
          >
            {/* Toolbar - outside Dockview, receives API via prop */}
            <Toolbar stats={stats} dockviewApi={dockviewApi} />

            {/* Dockview workspace - all panels managed by Dockview */}
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <DockviewProvider
                onReactFlowEditorReady={handleReactFlowEditorReady}
                onCanvasReady={handleCanvasReady}
                onActivePanelChange={handleActivePanelChange}
                onApiReady={setDockviewApi}
              />
            </div>
          </div>

          {/* Toast for keyboard shortcut feedback */}
          <Toast
            open={toastOpen}
            message={toastMessage}
            severity={toastSeverity}
            onClose={handleToastClose}
          />
        </EditorProvider>
        </ExternalWriteBusContext.Provider>
      </ThemeProvider>
    </MantineProvider>
  );
};

/**
 * Registers global hotkeys. Must be inside EditorProvider.
 */
const GlobalHotkeys: React.FC<{ onFeedback: (feedback: HotkeyFeedback) => void }> = ({ onFeedback }) => {
  useGlobalHotkeys({ onFeedback });
  return null;
};

/**
 * Helper component to capture EditorContext methods.
 */
const EditorContextCapture: React.FC<{
  contextRef: React.MutableRefObject<{ setEditorHandle: (handle: EditorHandle | null) => void } | null>;
}> = ({ contextRef }) => {
  const { setEditorHandle } = useEditor();

  useEffect(() => {
    contextRef.current = { setEditorHandle };
  }, [contextRef, setEditorHandle]);

  return null;
};
