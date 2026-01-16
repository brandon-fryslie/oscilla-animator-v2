/**
 * BlockLibrary Panel Wrapper
 *
 * Wraps BlockLibrary component for Dockview.
 */

import React from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { BlockLibrary } from '../../components/BlockLibrary';

export const BlockLibraryPanel: React.FC<IDockviewPanelProps> = () => {
  return <BlockLibrary />;
};
