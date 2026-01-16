/**
 * HelpPanel Wrapper
 *
 * Wraps HelpPanel component for Dockview.
 */

import React from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { HelpPanel } from '../../components/app/HelpPanel';

export const HelpPanelWrapper: React.FC<IDockviewPanelProps> = () => {
  return <HelpPanel />;
};
