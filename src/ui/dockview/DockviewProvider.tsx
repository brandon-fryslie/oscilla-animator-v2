/**
 * DockviewProvider Component
 *
 * Wraps DockviewReact with context for global API access.
 * Manages layout initialization and provides callbacks for special panels.
 */

import React, { createContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  DockviewReact,
  type DockviewReadyEvent,
  type DockviewApi,
} from 'dockview';
import 'dockview/dist/styles/dockview.css';
import { PANEL_COMPONENTS } from './panelRegistry';
import { createDefaultLayout } from './defaultLayout';
import { setDockviewApiRef } from './apiRef';
import type { EditorHandle } from '../editorCommon';
import { DockviewRightHeaderActions } from './DockviewHeaderActions';
import { clearStoredDockviewLayout, loadDockviewLayout, saveDockviewLayout } from './layoutPersistence';
import { DockviewRuntimeCallbacksContext } from './runtimeCallbacks';
import './theme.css';

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
  onApiReady?: (api: DockviewApi) => void;
}

/**
 * DockviewProvider wraps the application layout with Dockview.
 * Provides access to the Dockview API via context.
 */
export const DockviewProvider: React.FC<DockviewProviderProps> = ({
  onReactFlowEditorReady,
  onCanvasReady,
  onActivePanelChange,
  onApiReady,
}) => {
  const [api, setApi] = useState<DockviewApi | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);

  const runtimeCallbacks = useMemo(
    () => ({
      onReactFlowEditorReady,
      onCanvasReady,
    }),
    [onReactFlowEditorReady, onCanvasReady]
  );

  const handleReady = useCallback(
    (event: DockviewReadyEvent) => {
      setApi(event.api);
      setDockviewApiRef(event.api);

      const savedLayout = loadDockviewLayout();
      if (savedLayout) {
        try {
          event.api.fromJSON(savedLayout);
        } catch {
          // [LAW:single-enforcer] persisted layout repair occurs at this initialization boundary.
          clearStoredDockviewLayout();
          createDefaultLayout(event.api);
        }
      } else {
        createDefaultLayout(event.api);
      }

      // Notify parent that API is ready
      onApiReady?.(event.api);
    },
    [onApiReady]
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

  useEffect(() => {
    if (!api) {
      return;
    }

    const saveLayout = () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = window.setTimeout(() => {
        saveTimeoutRef.current = null;
        saveDockviewLayout(api.toJSON());
      }, 120);
    };

    const disposable = api.onDidLayoutChange(() => {
      saveLayout();
    });

    return () => {
      disposable.dispose();
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [api]);

  useEffect(() => {
    return () => {
      setDockviewApiRef(null);
    };
  }, []);

  return (
    <DockviewContext.Provider value={{ api }}>
      <DockviewRuntimeCallbacksContext.Provider value={runtimeCallbacks}>
        <DockviewReact
          className="oscilla-dockview"
          components={PANEL_COMPONENTS}
          rightHeaderActionsComponent={DockviewRightHeaderActions}
          onReady={handleReady}
          floatingGroupBounds="boundedWithinViewport"
        />
      </DockviewRuntimeCallbacksContext.Provider>
    </DockviewContext.Provider>
  );
};
