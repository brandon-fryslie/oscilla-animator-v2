/**
 * DockviewProvider Component
 *
 * Wraps DockviewReact with context for global API access.
 * Manages layout initialization and provides callbacks for special panels.
 */

import React, { createContext, useState, useCallback } from 'react';
import { DockviewReact, type DockviewReadyEvent, type DockviewApi } from 'dockview';
import { PANEL_COMPONENTS } from './panelRegistry';
import { createDefaultLayout } from './defaultLayout';
import type { EditorHandle } from '../editorCommon';
import './theme.css';

export interface DockviewContextValue {
  api: DockviewApi | null;
}

export const DockviewContext = createContext<DockviewContextValue | null>(null);

interface DockviewProviderProps {
  children?: React.ReactNode;
  onReteEditorReady?: (handle: EditorHandle) => void;
  onReactFlowEditorReady?: (handle: EditorHandle) => void;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

/**
 * DockviewProvider wraps the application layout with Dockview.
 * Provides access to the Dockview API via context.
 */
export const DockviewProvider: React.FC<DockviewProviderProps> = ({
  onReteEditorReady,
  onReactFlowEditorReady,
  onCanvasReady,
}) => {
  const [api, setApi] = useState<DockviewApi | null>(null);

  const handleReady = useCallback(
    (event: DockviewReadyEvent) => {
      setApi(event.api);

      // Build default layout
      createDefaultLayout(event.api, {
        onReteEditorReady,
        onReactFlowEditorReady,
        onCanvasReady,
      });
    },
    [onReteEditorReady, onReactFlowEditorReady, onCanvasReady]
  );

  return (
    <DockviewContext.Provider value={{ api }}>
      <DockviewReact
        className="oscilla-dockview"
        components={PANEL_COMPONENTS}
        onReady={handleReady}
        floatingGroupBounds="boundedWithinViewport"
        defaultTabComponent={() => null} // Use default tab rendering
      />
    </DockviewContext.Provider>
  );
};
