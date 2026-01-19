/**
 * Continuity Panel Wrapper
 *
 * Wraps ContinuityPanel component for Dockview.
 */

import React from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { ContinuityPanel as ContinuityPanelComponent } from '../../components/app/ContinuityPanel';

export const ContinuityPanel: React.FC<IDockviewPanelProps> = () => {
  return <ContinuityPanelComponent />;
};
