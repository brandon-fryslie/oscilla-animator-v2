/**
 * TableView Panel Wrapper
 *
 * Wraps TableView component for Dockview.
 */

import React from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { TableView } from '../../components/TableView';

export const TableViewPanel: React.FC<IDockviewPanelProps> = () => {
  return <TableView />;
};
