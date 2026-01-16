/**
 * Dockview Integration
 *
 * Public API for Dockview-based layout system.
 */

export { DockviewProvider, DockviewContext } from './DockviewProvider';
export type { DockviewContextValue } from './DockviewProvider';
export { useDockview } from './hooks';
export { PANEL_DEFINITIONS, PANEL_COMPONENTS } from './panelRegistry';
export type { PanelDefinition } from './panelRegistry';
export { createDefaultLayout } from './defaultLayout';
