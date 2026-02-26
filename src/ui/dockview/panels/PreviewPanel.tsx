/**
 * Preview Panel Wrapper
 *
 * Wraps CanvasTab for Dockview with canvas ready callback and external write bus.
 */

import React from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { CanvasTab } from '../../components/app/CanvasTab';
import { useDockviewRuntimeCallbacks } from '../runtimeCallbacks';

export const PreviewPanel: React.FC<IDockviewPanelProps> = () => {
  const { onCanvasReady } = useDockviewRuntimeCallbacks();

  return (
    <CanvasTab
      onCanvasReady={onCanvasReady}
    />
  );
};
