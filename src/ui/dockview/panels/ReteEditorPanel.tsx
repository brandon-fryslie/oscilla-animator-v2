/**
 * ReteEditor Panel Wrapper
 *
 * Wraps ReteEditor for Dockview with editor handle management.
 */

import React from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { ReteEditor } from '../../reteEditor/ReteEditor';
import type { EditorHandle } from '../../editorCommon';

export const ReteEditorPanel: React.FC<IDockviewPanelProps<{ onEditorReady?: (handle: EditorHandle) => void }>> = ({ params }) => {
  return <ReteEditor onEditorReady={params?.onEditorReady} />;
};
