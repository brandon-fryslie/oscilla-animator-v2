/**
 * DebugMiniView Panel Wrapper
 *
 * Wraps DebugMiniView component for Dockview.
 */

import React from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { DebugMiniView } from '../../debug-viz/DebugMiniView';

export const DebugMiniViewPanel: React.FC<IDockviewPanelProps> = () => {
  return <DebugMiniView />;
};
