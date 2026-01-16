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
import { DomainsPanelWrapper } from './panels/DomainsPanelWrapper';
import { HelpPanelWrapper } from './panels/HelpPanelWrapper';
import { DiagnosticConsolePanel } from './panels/DiagnosticConsolePanel';

export interface PanelDefinition {
  id: string;
  component: string;
  title: string;
  group: 'left-top' | 'left-bottom' | 'center' | 'right-top' | 'right-bottom' | 'bottom';
}

/**
 * All registered panel definitions.
 * Order matters within each group (determines tab order).
 */
export const PANEL_DEFINITIONS: PanelDefinition[] = [
  // Left sidebar
  { id: 'block-library', component: 'block-library', title: 'Library', group: 'left-top' },
  { id: 'block-inspector', component: 'block-inspector', title: 'Inspector', group: 'left-bottom' },

  // Center (tabbed)
  { id: 'table-view', component: 'table-view', title: 'Blocks', group: 'center' },
  { id: 'connection-matrix', component: 'connection-matrix', title: 'Matrix', group: 'center' },
  { id: 'rete-editor', component: 'rete-editor', title: 'Rete', group: 'center' },
  { id: 'flow-editor', component: 'flow-editor', title: 'Flow', group: 'center' },
  { id: 'preview', component: 'preview', title: 'Preview', group: 'center' },

  // Right sidebar
  { id: 'domains', component: 'domains', title: 'Domains', group: 'right-top' },
  { id: 'help', component: 'help', title: 'Help', group: 'right-bottom' },

  // Bottom
  { id: 'diagnostic-console', component: 'diagnostic-console', title: 'Console', group: 'bottom' },
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
  'domains': DomainsPanelWrapper,
  'help': HelpPanelWrapper,
  'diagnostic-console': DiagnosticConsolePanel,
};
