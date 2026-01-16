/**
 * ReactFlowEditor Panel Wrapper
 *
 * Wraps ReactFlowEditor for Dockview with editor handle management.
 */

import React from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { ReactFlowEditor } from '../../reactFlowEditor/ReactFlowEditor';
import type { EditorHandle } from '../../editorCommon';

export const ReactFlowEditorPanel: React.FC<IDockviewPanelProps<{ onEditorReady?: (handle: EditorHandle) => void }>> = ({ params }) => {
  return <ReactFlowEditor onEditorReady={params?.onEditorReady} />;
};
