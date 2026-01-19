/**
 * Panel Registry
 *
 * Single source of truth for all panel definitions in the Dockview layout.
 * Maps panel IDs to their React components.
 */

import { BlockLibraryPanel } from './panels/BlockLibraryPanel';
import { BlockInspectorPanel } from './panels/BlockInspectorPanel';
import { TableViewPanel } from './panels/TableViewPanel';
import { ConnectionMatrixPanel } from './panels/ConnectionMatrixPanel';
import { ReteEditorPanel } from './panels/ReteEditorPanel';
import { ReactFlowEditorPanel } from './panels/ReactFlowEditorPanel';
import { PreviewPanel } from './panels/PreviewPanel';
import { DiagnosticConsolePanel } from './panels/DiagnosticConsolePanel';
import { LogPanel } from './panels/LogPanel';

/**
 * Panel group assignments for layout.
 * Defines where each panel appears in the default layout.
 */
export type PanelGroup =
  | 'left-top'
  | 'left-bottom'
  | 'center'
  | 'right-top'      // empty by default
  | 'right-bottom'   // empty by default
  | 'bottom-left'    // diagnostics
  | 'bottom-right'   // empty by default
  | 'preview-float'; // floating preview

export interface PanelDefinition {
  id: string;
  component: string;
  title: string;
  group: PanelGroup;
  floating?: boolean;  // true for floating panels
}

/**
 * All registered panel definitions.
 * Order matters within each group (determines tab order).
 *
 * Note: Domains and Help are NOT included in default layout.
 * They can be added later via panel management UI.
 */
export const PANEL_DEFINITIONS: PanelDefinition[] = [
  // Left sidebar
  { id: 'block-library', component: 'block-library', title: 'Library', group: 'left-top' },
  { id: 'block-inspector', component: 'block-inspector', title: 'Inspector', group: 'left-bottom' },

  // Center (tabbed editors)
  { id: 'rete-editor', component: 'rete-editor', title: 'Rete', group: 'center' },
  { id: 'flow-editor', component: 'flow-editor', title: 'Flow', group: 'center' },
  { id: 'table-view', component: 'table-view', title: 'Table', group: 'center' },
  { id: 'connection-matrix', component: 'connection-matrix', title: 'Matrix', group: 'center' },

  // Bottom (split)
  { id: 'diagnostic-console', component: 'diagnostic-console', title: 'Console', group: 'bottom-left' },
  { id: 'log-panel', component: 'log-panel', title: 'Logs', group: 'bottom-left' },

  // Floating
  { id: 'preview', component: 'preview', title: 'Preview', group: 'preview-float', floating: true },
];

/**
 * Component map for Dockview.
 * Keys must match the 'component' field in PANEL_DEFINITIONS.
 */
export const PANEL_COMPONENTS = {
  'block-library': BlockLibraryPanel,
  'block-inspector': BlockInspectorPanel,
  'table-view': TableViewPanel,
  'connection-matrix': ConnectionMatrixPanel,
  'rete-editor': ReteEditorPanel,
  'flow-editor': ReactFlowEditorPanel,
  'preview': PreviewPanel,
  'diagnostic-console': DiagnosticConsolePanel,
  'log-panel': LogPanel,
};
