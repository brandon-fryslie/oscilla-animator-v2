/**
 * DockviewProvider Component
 *
 * Wraps DockviewReact with context for global API access.
 * Manages layout initialization and provides callbacks for special panels.
 */

import React, { createContext, useState, useCallback, useEffect } from 'react';
import {
  DockviewReact,
  DockviewDefaultTab,
  type DockviewReadyEvent,
  type DockviewApi,
  type IDockviewPanelHeaderProps,
} from 'dockview';
import 'dockview/dist/styles/dockview.css';
import { PANEL_COMPONENTS } from './panelRegistry';
import { createDefaultLayout } from './defaultLayout';
import type { EditorHandle } from '../editorCommon';
import './theme.css';

/**
 * Custom tab component that hides the close button.
 * We don't have a way to reopen closed panels yet.
 */
const TabWithoutClose: React.FC<IDockviewPanelHeaderProps> = (props) => {
  return <DockviewDefaultTab {...props} hideClose />;
};

// Note: Popout functionality would go here when ready
// Dockview supports `panel.api.popout()` to open panels in new windows
// Requires setting `popoutUrl` prop on DockviewReact

export interface DockviewContextValue {
  api: DockviewApi | null;
}

export const DockviewContext = createContext<DockviewContextValue | null>(null);

interface DockviewProviderProps {
  children?: React.ReactNode;
  onReactFlowEditorReady?: (handle: EditorHandle) => void;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  onActivePanelChange?: (panelId: string | undefined) => void;
}

/**
 * DockviewProvider wraps the application layout with Dockview.
 * Provides access to the Dockview API via context.
 */
export const DockviewProvider: React.FC<DockviewProviderProps> = ({
  onReactFlowEditorReady,
  onCanvasReady,
  onActivePanelChange,
}) => {
  const [api, setApi] = useState<DockviewApi | null>(null);

  const handleReady = useCallback(
    (event: DockviewReadyEvent) => {
      setApi(event.api);

      // Build default layout
      createDefaultLayout(event.api, {
        onReactFlowEditorReady,
        onCanvasReady,
      });
    },
    [onReactFlowEditorReady, onCanvasReady]
  );

  // Subscribe to active panel changes
  useEffect(() => {
    if (!api || !onActivePanelChange) return;

    const disposable = api.onDidActivePanelChange((panel) => {
      onActivePanelChange(panel?.id);
    });

    return () => {
      disposable.dispose();
    };
  }, [api, onActivePanelChange]);

  return (
    <DockviewContext.Provider value={{ api }}>
      <DockviewReact
        className="oscilla-dockview"
        components={PANEL_COMPONENTS}
        defaultTabComponent={TabWithoutClose}
        onReady={handleReady}
        floatingGroupBounds="boundedWithinViewport"
        singleTabMode="fullwidth"
      />
    </DockviewContext.Provider>
  );
};
