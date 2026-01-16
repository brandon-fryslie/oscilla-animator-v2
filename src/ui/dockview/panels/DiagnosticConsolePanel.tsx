/**
 * DiagnosticConsole Panel Wrapper
 *
 * Wraps DiagnosticConsole component for Dockview.
 */

import React from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { DiagnosticConsole } from '../../components/app/DiagnosticConsole';

export const DiagnosticConsolePanel: React.FC<IDockviewPanelProps> = () => {
  return <DiagnosticConsole />;
};
