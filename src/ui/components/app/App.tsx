/**
 * App Component
 *
 * Root React component for the entire application.
 * Manages the overall layout with:
 * - Toolbar (top)
 * - Workspace (3-column: left split sidebar, center tabs, right tabs)
 * - Diagnostic console (bottom)
 *
 * The left sidebar uses jsPanel's split layout (Library top, Inspector bottom).
 */

import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import { Toolbar } from './Toolbar';
import { DiagnosticConsole } from './DiagnosticConsole';
import { HelpPanel } from './HelpPanel';
import { CanvasTab } from './CanvasTab';
import { Tabs, TabConfig } from './Tabs';
import { SplitPanel } from './SplitPanel';
import { BlockLibrary } from '../BlockLibrary';
import { BlockInspector } from '../BlockInspector';
import { TableView } from '../TableView';
import { ConnectionMatrix } from '../ConnectionMatrix';
import { DomainsPanel } from '../DomainsPanel';
import { ReteEditor, EditorProvider } from '../../editor';

interface AppProps {
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

export const App: React.FC<AppProps> = ({ onCanvasReady }) => {
  const [stats, setStats] = useState('FPS: --');
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

  // Create a stable component wrapper for CanvasTab to avoid remounting
  // Since handleCanvasReady is stable (empty deps), this only creates once
  const CanvasTabWrapper = useMemo(() => {
    return function CanvasTabWrapper() {
      return <CanvasTab onCanvasReady={handleCanvasReady} />;
    };
  }, [handleCanvasReady]);

  // Center tabs configuration - memoized to prevent recreating on every render
  const centerTabs: TabConfig[] = useMemo(() => [
    {
      id: 'table',
      label: 'Blocks',
      component: TableView,
    },
    {
      id: 'matrix',
      label: 'Matrix',
      component: ConnectionMatrix,
    },
    {
      id: 'editor',
      label: 'Editor',
      component: ReteEditor,
    },
    {
      id: 'canvas',
      label: 'Preview',
      component: CanvasTabWrapper,
    },
  ], [CanvasTabWrapper]);

  // Right tabs configuration
  const rightTabs: TabConfig[] = [
    {
      id: 'domains',
      label: 'Domains',
      component: DomainsPanel,
    },
    {
      id: 'help',
      label: 'Help',
      component: HelpPanel,
    },
  ];

  return (
    <EditorProvider>
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
        {/* Toolbar */}
        <Toolbar stats={stats} />

        {/* Main workspace */}
        <main
          style={{
            flex: 1,
            display: 'flex',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Left sidebar - Split panel with Library (top) and Inspector (bottom) */}
          <div
            style={{
              flex: '0 0 280px',
              minWidth: '200px',
              maxWidth: '500px',
              borderRight: '1px solid #0f3460',
              overflow: 'hidden',
            }}
          >
            <SplitPanel
              topComponent={BlockLibrary}
              bottomComponent={BlockInspector}
              initialSplit={0.5}
            />
          </div>

          {/* Center region - Tabbed content */}
          <div
            style={{
              flex: 1,
              minWidth: '400px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <Tabs tabs={centerTabs} initialTab="editor" />
          </div>

          {/* Right sidebar - Tabbed content */}
          <div
            style={{
              flex: '0 0 300px',
              minWidth: '200px',
              maxWidth: '500px',
              borderLeft: '1px solid #0f3460',
              overflow: 'hidden',
            }}
          >
            <Tabs tabs={rightTabs} initialTab="domains" />
          </div>
        </main>

        {/* Bottom diagnostic console */}
        <div
          style={{
            flex: '0 0 150px',
            minHeight: '80px',
            maxHeight: '400px',
            borderTop: '1px solid #0f3460',
            background: '#0f0f23',
            overflow: 'hidden',
          }}
        >
          <DiagnosticConsole />
        </div>
      </div>
    </EditorProvider>
  );
};
