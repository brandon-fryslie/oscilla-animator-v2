/**
 * Panel Registry
 *
 * Maps canonical panel metadata to concrete React components.
 */

import {
  PANEL_DEFINITIONS,
  PANEL_MENU_ITEMS,
  type PanelDefinition,
  type PanelGroup,
  type PanelMenuItem,
} from './panelMetadata';
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

export { PANEL_DEFINITIONS, PANEL_MENU_ITEMS };
export type { PanelDefinition, PanelGroup, PanelMenuItem };
