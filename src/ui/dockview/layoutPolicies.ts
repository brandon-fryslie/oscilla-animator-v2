/**
 * The two concrete EditorLayoutPolicy instances — one per era.
 *
 * These are the values the unified dockview shell reads. Each bundles the era's
 * panel components, panel metadata, Panels-menu entries, persistence slot, and
 * default-layout builder. The shell (DockviewProvider) and the toolbar's layout
 * actions consume the policy; neither branches on era. [LAW:one-source-of-truth]
 */

import type { EditorLayoutPolicy } from './editorLayoutPolicy';
import { PANEL_COMPONENTS, PANEL_DEFINITIONS, PANEL_MENU_ITEMS } from './panelRegistry';
import { createDefaultLayout } from './defaultLayout';
import {
  DOCKVIEW_LAYOUT_STORAGE_KEY,
  SCENE_DOCKVIEW_LAYOUT_STORAGE_KEY,
} from './layoutPersistence';
import {
  SCENE_PANEL_COMPONENTS,
  SCENE_PANEL_DEFINITIONS,
  SCENE_PANEL_MENU_ITEMS,
} from './scenePanels';
import { createSceneLayout } from './sceneLayout';

export const v1LayoutPolicy: EditorLayoutPolicy = {
  components: PANEL_COMPONENTS,
  definitions: PANEL_DEFINITIONS,
  menuItems: PANEL_MENU_ITEMS,
  storageKey: DOCKVIEW_LAYOUT_STORAGE_KEY,
  createLayout: createDefaultLayout,
};

export const sceneLayoutPolicy: EditorLayoutPolicy = {
  components: SCENE_PANEL_COMPONENTS,
  definitions: SCENE_PANEL_DEFINITIONS,
  menuItems: SCENE_PANEL_MENU_ITEMS,
  storageKey: SCENE_DOCKVIEW_LAYOUT_STORAGE_KEY,
  createLayout: createSceneLayout,
};
