import React, { createContext, useContext } from 'react';
import type { EditorHandle } from '../editorCommon';

export interface DockviewRuntimeCallbacks {
  onReactFlowEditorReady?: (handle: EditorHandle) => void;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

export const DockviewRuntimeCallbacksContext = createContext<DockviewRuntimeCallbacks>({});

export function useDockviewRuntimeCallbacks(): DockviewRuntimeCallbacks {
  return useContext(DockviewRuntimeCallbacksContext);
}
