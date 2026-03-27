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
  type DockviewWillDropEvent,
  type DockviewWillShowOverlayLocationEvent,
} from 'dockview';
import 'dockview/dist/styles/dockview.css';
import { PANEL_COMPONENTS } from './panelRegistry';
import { createDefaultLayout } from './defaultLayout';
import type { EditorHandle } from '../editorCommon';
import { DockviewRightHeaderActions } from './DockviewHeaderActions';
import { clearStoredDockviewLayout, loadDockviewLayout, saveDockviewLayout } from './layoutPersistence';
import { DockviewRuntimeCallbacksContext } from './runtimeCallbacks';
import { applySidebarConstraints, captureSidebarWidths, getSidebarForPanel } from './layoutActions';
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
      applySidebarConstraints(event.api);

      // Notify parent that API is ready
      onApiReady?.(event.api);
    },
    [onApiReady]
  );

  const shouldBlockEdgeDrop = useCallback((event: DockviewWillDropEvent | DockviewWillShowOverlayLocationEvent): boolean => {
    if (event.kind !== 'edge') {
      return false;
    }

    // [LAW:no-mode-explosion] root-edge dock targets are constrained to the
    // canonical center+sidebar layout contract.
    if (!event.group) {
      return event.position === 'left' || event.position === 'right' || event.position === 'bottom';
    }

    const groupSidebar = event.group.panels
      .map((panel) => getSidebarForPanel(panel.id))
      .find((side): side is 'left' | 'right' => side !== null);
    if (groupSidebar) {
      // [LAW:single-enforcer] Sidebar vertical split restrictions are enforced
      // only at Dockview's drop-boundary.
      return event.position === 'top' || event.position === 'bottom';
    }

    const isPatchGroup = event.group.panels.some((panel) => panel.id === 'flow-editor');
    if (isPatchGroup && event.position === 'top') {
      return true;
    }

    return false;
  }, []);

  const handleWillDrop = useCallback((event: DockviewWillDropEvent) => {
    if (shouldBlockEdgeDrop(event)) {
      event.preventDefault();
    }
  }, [shouldBlockEdgeDrop]);

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
    const disposable = api.onWillShowOverlay((event) => {
      if (shouldBlockEdgeDrop(event)) {
        event.preventDefault();
      }
    });
    return () => {
      disposable.dispose();
    };
  }, [api, shouldBlockEdgeDrop]);

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
      // [LAW:dataflow-not-control-flow] Layout-change handling records sidebar
      // state and persists layout; it must not mutate layout structure itself.
      captureSidebarWidths(api);
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

  return (
    <DockviewContext.Provider value={{ api }}>
      <DockviewRuntimeCallbacksContext.Provider value={runtimeCallbacks}>
        <DockviewReact
          className="oscilla-dockview"
          components={PANEL_COMPONENTS}
          rightHeaderActionsComponent={DockviewRightHeaderActions}
          onReady={handleReady}
          onWillDrop={handleWillDrop}
          floatingGroupBounds="boundedWithinViewport"
        />
      </DockviewRuntimeCallbacksContext.Provider>
    </DockviewContext.Provider>
  );
};
