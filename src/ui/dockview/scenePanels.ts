/**
 * Scene (pillar) era panel set for the unified dockview shell.
 *
 * The pillar era renders the SAME dockview shell as V1, but with its own panel
 * set: the mature GraphEditorCore over the pillar patch, the modulation table,
 * the authoring palette, the neutral inspector, and the live Three preview. It
 * deliberately uses plain docked panels (no paneview collapsible sidebars), so
 * the V1 sidebar-routing machinery in layoutActions is naturally inert for it.
 * [LAW:decomposition]
 */

import React from 'react';
import type { IDockviewPanelProps } from 'dockview';
import type { PanelDefinition, PanelMenuItem } from './panelMetadata';
import { PreviewPanel } from './panels/PreviewPanel';
import { SceneGraphEditorPanel } from './panels/scene/SceneGraphEditorPanel';
import { SceneModulationTablePanel } from './panels/scene/SceneModulationTablePanel';
import { ScenePalettePanel } from './panels/scene/ScenePalettePanel';
import { SceneInspectorPanel } from './panels/scene/SceneInspectorPanel';

export const SCENE_PANEL_COMPONENTS: Record<string, React.FC<IDockviewPanelProps>> = {
  'scene-palette': ScenePalettePanel,
  'scene-graph': SceneGraphEditorPanel,
  'scene-table': SceneModulationTablePanel,
  'scene-inspector': SceneInspectorPanel,
  'preview': PreviewPanel,
};

export const SCENE_PANEL_DEFINITIONS: readonly PanelDefinition[] = [
  { id: 'scene-palette', component: 'scene-palette', title: 'Blocks', group: 'left-top' },
  { id: 'scene-graph', component: 'scene-graph', title: 'Patch', group: 'center' },
  { id: 'scene-table', component: 'scene-table', title: 'Table', group: 'center' },
  { id: 'preview', component: 'preview', title: 'Preview', group: 'right-top' },
  { id: 'scene-inspector', component: 'scene-inspector', title: 'Inspector', group: 'right-bottom' },
];

// [LAW:one-source-of-truth] Panels-menu entries are derived from the canonical
// scene panel set, so the menu can never offer a panel the era does not register.
export const SCENE_PANEL_MENU_ITEMS: readonly PanelMenuItem[] = SCENE_PANEL_DEFINITIONS.map(
  (panel) => ({ id: panel.id, title: panel.title }),
);
