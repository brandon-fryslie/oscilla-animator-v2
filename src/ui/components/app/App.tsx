/**
 * App Component
 *
 * Root React component for the entire application.
 * Manages the overall layout with Dockview:
 * - Toolbar (top, outside Dockview)
 * - Dockview workspace (all panels)
 *
 * Handles editor context switching when users switch between editor tabs.
 */

import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Toolbar } from './Toolbar';
import { EditorProvider, type EditorHandle, useEditor } from '../../editorCommon';
import { DockviewProvider } from '../../dockview';

interface AppProps {
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

export const App: React.FC<AppProps> = ({ onCanvasReady }) => {
  const [stats, setStats] = useState('FPS: --');

  // Store handles for both editors
  const reteHandleRef = useRef<EditorHandle | null>(null);
  const reactFlowHandleRef = useRef<EditorHandle | null>(null);
  const editorContextRef = useRef<{ setEditorHandle: (handle: EditorHandle | null) => void } | null>(null);
  const [activeEditorTab, setActiveEditorTab] = useState<'rete-editor' | 'flow-editor' | null>('rete-editor');
  const [editorsReady, setEditorsReady] = useState<{ rete: boolean; flow: boolean }>({ rete: false, flow: false });

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
    (window as any).__setStats = setStats;
    return () => {
      delete (window as any).__setStats;
    };
  }, []);

  // Handle editor ready callbacks - store handles only
  const handleReteEditorReady = useCallback((adapter: EditorHandle) => {
    reteHandleRef.current = adapter;
    setEditorsReady(prev => ({ ...prev, rete: true }));
  }, []);

  const handleReactFlowEditorReady = useCallback((adapter: EditorHandle) => {
    reactFlowHandleRef.current = adapter;
    setEditorsReady(prev => ({ ...prev, flow: true }));
  }, []);

  // Handle Dockview panel activation to update active editor
  const handleActivePanelChange = useCallback((panelId: string | undefined) => {
    if (panelId === 'rete-editor') {
      setActiveEditorTab('rete-editor');
    } else if (panelId === 'flow-editor') {
      setActiveEditorTab('flow-editor');
    } else {
      // Non-editor panel activated, clear active editor
      setActiveEditorTab(null);
    }
  }, []);

  // Update EditorContext when active editor changes or editors become ready
  useEffect(() => {
    if (!editorContextRef.current) return;

    if (activeEditorTab === 'rete-editor' && editorsReady.rete) {
      editorContextRef.current.setEditorHandle(reteHandleRef.current);
    } else if (activeEditorTab === 'flow-editor' && editorsReady.flow) {
      editorContextRef.current.setEditorHandle(reactFlowHandleRef.current);
    } else if (activeEditorTab === null) {
      editorContextRef.current.setEditorHandle(null);
    }
  }, [activeEditorTab, editorsReady]);

  return (
    <EditorProvider>
      {/* Capture EditorContext methods */}
      <EditorContextCapture contextRef={editorContextRef} />

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
        {/* Toolbar - outside Dockview */}
        <Toolbar stats={stats} />

        {/* Dockview workspace - all panels managed by Dockview */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <DockviewProvider
            onReteEditorReady={handleReteEditorReady}
            onReactFlowEditorReady={handleReactFlowEditorReady}
            onCanvasReady={handleCanvasReady}
            onActivePanelChange={handleActivePanelChange}
          />
        </div>
      </div>
    </EditorProvider>
  );
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
