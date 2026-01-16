/**
 * ConnectionMatrix Panel Wrapper
 *
 * Wraps ConnectionMatrix component for Dockview.
 */

import React from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { ConnectionMatrix } from '../../components/ConnectionMatrix';

export const ConnectionMatrixPanel: React.FC<IDockviewPanelProps> = () => {
  return <ConnectionMatrix />;
};
