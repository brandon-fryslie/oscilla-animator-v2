/**
 * SceneModulationTablePanel — dockview host for the pillar modulation table (the
 * spreadsheet routing view over PillarPatchStore). It is an alternate projection
 * of the same authored patch the scene graph panel edits, so switching between
 * them moves no state. [LAW:one-source-of-truth] It is pillar-native and stays
 * (editor-ux .20): the retirement is the hand-rolled center-pane toggle, not this
 * view.
 */

import React from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { ModulationTablePanel } from '../../../nativeEditor/ModulationTablePanel';

export const SceneModulationTablePanel: React.FC<IDockviewPanelProps> = () => <ModulationTablePanel />;
