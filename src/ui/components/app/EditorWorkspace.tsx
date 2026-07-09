/**
 * EditorWorkspace — the shared editor shell for both eras.
 *
 * Toolbar + the Dockview workspace, parameterized by the era's EditorLayoutPolicy.
 * This is the model-agnostic SHELL the epic mandates reusing: docking, layout
 * persistence, the Panels/Layout menus, and header actions all come from here for
 * either era. What varies is the `policy` value (panel set + default layout +
 * persistence slot) and whether the model-bound Patch menu is surfaced. The shell
 * never branches on which era it renders. [LAW:dataflow-not-control-flow]
 */

import React, { useState } from 'react';
import type { DockviewApi } from 'dockview';
import { Toolbar } from './Toolbar';
import { DockviewProvider } from '../../dockview';
import type { EditorLayoutPolicy } from '../../dockview/editorLayoutPolicy';
import type { EditorHandle } from '../../editorCommon';

export interface EditorWorkspaceProps {
  stats: string;
  policy: EditorLayoutPolicy;
  patchMenuEnabled?: boolean;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  onReactFlowEditorReady?: (handle: EditorHandle) => void;
  onActivePanelChange?: (panelId: string | undefined) => void;
}

export const EditorWorkspace: React.FC<EditorWorkspaceProps> = ({
  stats,
  policy,
  patchMenuEnabled,
  onCanvasReady,
  onReactFlowEditorReady,
  onActivePanelChange,
}) => {
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);

  return (
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
      <Toolbar
        stats={stats}
        dockviewApi={dockviewApi}
        policy={policy}
        patchMenuEnabled={patchMenuEnabled}
      />

      {/* Dockview workspace — all panels managed by Dockview */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <DockviewProvider
          policy={policy}
          onReactFlowEditorReady={onReactFlowEditorReady}
          onCanvasReady={onCanvasReady}
          onActivePanelChange={onActivePanelChange}
          onApiReady={setDockviewApi}
        />
      </div>
    </div>
  );
};
