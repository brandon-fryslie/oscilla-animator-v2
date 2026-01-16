/**
 * DomainsPanel Wrapper
 *
 * Wraps DomainsPanel component for Dockview.
 */

import React from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { DomainsPanel } from '../../components/DomainsPanel';

export const DomainsPanelWrapper: React.FC<IDockviewPanelProps> = () => {
  return <DomainsPanel />;
};
