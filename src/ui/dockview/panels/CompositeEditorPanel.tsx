/**
 * Composite Editor Panel Wrapper
 *
 * Wraps the CompositeEditor component for Dockview integration.
 */

import React from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { CompositeEditor } from '../../components/CompositeEditor';
import './CompositeEditorPanel.css';

export const CompositeEditorPanel: React.FC<IDockviewPanelProps> = () => {
  return (
    <div className="composite-editor-panel">
      <CompositeEditor />
    </div>
  );
};
