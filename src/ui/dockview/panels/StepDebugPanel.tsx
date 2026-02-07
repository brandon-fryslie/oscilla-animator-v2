/**
 * StepDebugPanel - Dockview Panel Wrapper
 *
 * Wraps StepDebugPanel component for use in Dockview layout.
 */

import React from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { StepDebugPanel as StepDebugPanelComponent } from '../../components/StepDebugPanel';

export const StepDebugPanel: React.FC<IDockviewPanelProps> = () => {
  return <StepDebugPanelComponent />;
};
