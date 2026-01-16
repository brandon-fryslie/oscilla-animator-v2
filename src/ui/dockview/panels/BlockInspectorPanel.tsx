/**
 * BlockInspector Panel Wrapper
 *
 * Wraps BlockInspector component for Dockview.
 */

import React from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { BlockInspector } from '../../components/BlockInspector';

export const BlockInspectorPanel: React.FC<IDockviewPanelProps> = () => {
  return <BlockInspector />;
};
