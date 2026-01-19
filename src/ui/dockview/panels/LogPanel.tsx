/**
 * Log Panel Wrapper
 *
 * Wraps LogPanel component for Dockview.
 */

import React from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { LogPanel as LogPanelComponent } from '../../components/app/LogPanel';

export const LogPanel: React.FC<IDockviewPanelProps> = () => {
  return <LogPanelComponent />;
};
