/**
 * EditorContext - React Context for Generic Editor Access
 *
 * Provides access to the current editor (ReactFlow) from child components.
 * Used by BlockLibrary to add blocks on double-click, and other UI components
 * that need to interact with the editor.
 */

import React, { createContext, useContext, useState } from 'react';
import type { EditorHandle } from './EditorHandle';

interface EditorContextValue {
  editorHandle: EditorHandle | null;
  setEditorHandle: (handle: EditorHandle | null) => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export const EditorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [editorHandle, setEditorHandle] = useState<EditorHandle | null>(null);

  return (
    <EditorContext.Provider value={{ editorHandle, setEditorHandle }}>
      {children}
    </EditorContext.Provider>
  );
};

export function useEditor(): EditorContextValue {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditor must be used within EditorProvider');
  }
  return context;
}
