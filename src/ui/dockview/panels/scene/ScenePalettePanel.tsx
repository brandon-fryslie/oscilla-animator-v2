/**
 * ScenePalettePanel — dockview host for the pillar authoring surface (palette,
 * per-block config, connection picker, diagnostics). The body reads/writes
 * PillarPatchStore only; this wrapper just docks it. Block-add for the scene era
 * lives here until the catalog-driven BlockLibrary parity lands (editor-ux .7).
 */

import React from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { NativeEditorPanel } from '../../../nativeEditor/NativeEditorPanel';

export const ScenePalettePanel: React.FC<IDockviewPanelProps> = () => <NativeEditorPanel />;
