/**
 * Panel Registry
 *
 * Single source of truth for all panel definitions in the Dockview layout.
 * Maps panel IDs to their React components.
 */

import { TableViewPanel } from './panels/TableViewPanel';
import { ConnectionMatrixPanel } from './panels/ConnectionMatrixPanel';
import { ReactFlowEditorPanel } from './panels/ReactFlowEditorPanel';
import { PreviewPanel } from './panels/PreviewPanel';
import { DiagnosticConsolePanel } from './panels/DiagnosticConsolePanel';
import { LogPanel } from './panels/LogPanel';
import { ContinuityPanel } from './panels/ContinuityPanel';
import { CompilationInspectorPanel } from './panels/CompilationInspectorPanel';
import { DebugMiniViewPanel } from './panels/DebugMiniViewPanel';
import { CompositeEditorPanel } from './panels/CompositeEditorPanel';
import { StepDebugPanel } from './panels/StepDebugPanel';
import { HelpPanelWrapper } from './panels/HelpPanelWrapper';
import { ExpressionEditorPanel } from './panels/ExpressionEditorPanel';
import { LeftSidebarPanel } from './panels/LeftSidebarPanel';
import { RightSidebarPanel } from './panels/RightSidebarPanel';

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
  floating?: boolean;       // true for floating panels
  initiallyHidden?: boolean; // true for panels opened on-demand only
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
  { id: 'left-sidebar', component: 'left-sidebar', title: 'Library', group: 'left-top' },

  // Center (tabbed editors)
  { id: 'flow-editor', component: 'flow-editor', title: 'Patch', group: 'center' },
  { id: 'table-view', component: 'table-view', title: 'Table', group: 'center' },
  { id: 'connection-matrix', component: 'connection-matrix', title: 'Matrix', group: 'center' },
  { id: 'composite-editor', component: 'composite-editor', title: 'Composite', group: 'center' },
  { id: 'expression-editor', component: 'expression-editor', title: 'Expression Editor', group: 'center', initiallyHidden: true },

  // Right sidebar
  { id: 'right-sidebar', component: 'right-sidebar', title: 'Settings', group: 'right-top' },

  // Bottom (split)
  { id: 'diagnostic-console', component: 'diagnostic-console', title: 'Console', group: 'bottom-left' },
  { id: 'log-panel', component: 'log-panel', title: 'Logs', group: 'bottom-left' },
  { id: 'continuity-panel', component: 'continuity-panel', title: 'Continuity', group: 'bottom-left' },
  { id: 'compilation-inspector', component: 'compilation-inspector', title: 'Compilation', group: 'bottom-left' },
  { id: 'debug-miniview', component: 'debug-miniview', title: 'Debug', group: 'bottom-right' },
  { id: 'step-debugger', component: 'step-debugger', title: 'Step Debugger', group: 'bottom-right' },

  // Help (not in default layout — opened on demand by ChartHelpButton)
  { id: 'help', component: 'help', title: 'Help', group: 'bottom-right', initiallyHidden: true },

  // Floating
  { id: 'preview', component: 'preview', title: 'Preview', group: 'preview-float', floating: true },
];

/**
 * Component map for Dockview.
 * Keys must match the 'component' field in PANEL_DEFINITIONS.
 */
export const PANEL_COMPONENTS = {
  'left-sidebar': LeftSidebarPanel,
  'right-sidebar': RightSidebarPanel,
  'table-view': TableViewPanel,
  'connection-matrix': ConnectionMatrixPanel,
  'flow-editor': ReactFlowEditorPanel,
  'composite-editor': CompositeEditorPanel,
  'preview': PreviewPanel,
  'diagnostic-console': DiagnosticConsolePanel,
  'log-panel': LogPanel,
  'continuity-panel': ContinuityPanel,
  'compilation-inspector': CompilationInspectorPanel,
  'debug-miniview': DebugMiniViewPanel,
  'step-debugger': StepDebugPanel,
  'help': HelpPanelWrapper,
  'expression-editor': ExpressionEditorPanel,
};
