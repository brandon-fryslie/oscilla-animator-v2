/**
 * ReactFlowEditor Panel Wrapper
 *
 * Wraps ReactFlowEditor for Dockview with editor handle management.
 */

import React from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { ReactFlowEditor } from '../../reactFlowEditor/ReactFlowEditor';
import { useDockviewRuntimeCallbacks } from '../runtimeCallbacks';
import './ReactFlowEditorPanel.css';

export const ReactFlowEditorPanel: React.FC<IDockviewPanelProps> = () => {
  const { onReactFlowEditorReady } = useDockviewRuntimeCallbacks();

  return (
    <div className="react-flow-editor-panel">
      <ReactFlowEditor onEditorReady={onReactFlowEditorReady} />
    </div>
  );
};
