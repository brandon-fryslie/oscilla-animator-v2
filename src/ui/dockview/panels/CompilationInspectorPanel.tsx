/**
 * CompilationInspectorPanel - Dockview Panel Wrapper
 *
 * Wraps CompilationInspector component for use in Dockview layout.
 */

import React from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { CompilationInspector } from '../../components/CompilationInspector';

export const CompilationInspectorPanel: React.FC<IDockviewPanelProps> = () => {
  return <CompilationInspector />;
};
