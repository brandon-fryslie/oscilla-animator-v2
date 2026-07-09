/**
 * SceneInspectorPanel — dockview host for the ONE neutral inspector body
 * (SelectionDetailView). The era's SelectionDetail is supplied at the boot shell
 * via SelectionDetailProvider, so this panel is era-agnostic: it renders whatever
 * detail the in-scope provider carries for the current selection. [LAW:one-source-of-truth]
 */

import React from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { SelectionDetailView } from '../../../graphEditor/SelectionDetailView';

export const SceneInspectorPanel: React.FC<IDockviewPanelProps> = () => (
  <div style={{ height: '100%', overflow: 'auto', background: '#12121a' }}>
    <SelectionDetailView />
  </div>
);
