/**
 * EditorContext - React Context for Editor Access
 *
 * Provides access to the Rete editor from child components.
 * Used by BlockLibrary to add blocks on double-click.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import type { ReteEditorHandle } from './ReteEditor';

interface EditorContextValue {
  editorHandle: ReteEditorHandle | null;
  setEditorHandle: (handle: ReteEditorHandle | null) => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export const EditorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [editorHandle, setEditorHandle] = useState<ReteEditorHandle | null>(null);

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
