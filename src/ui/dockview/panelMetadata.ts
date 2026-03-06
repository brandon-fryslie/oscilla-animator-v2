/**
 * Pure panel metadata for Dockview layout and panel menus.
 * Kept separate from component wiring so layout configuration stays testable.
 */

/**
 * Panel group assignments for layout.
 * Defines where each panel appears in the default layout.
 */
export type PanelGroup =
  | 'left-top'
  | 'left-bottom'
  | 'center'
  | 'right-top'      // right sidebar (present in default layout)
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
  menuHidden?: boolean;      // true when panel is not directly listed in Panels menu
}

export interface PanelMenuItem {
  id: string;
  title: string;
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
  { id: 'expression-editor', component: 'expression-editor', title: 'Expression Editor', group: 'center', initiallyHidden: true, menuHidden: true },

  // Right sidebar
  { id: 'right-sidebar', component: 'right-sidebar', title: 'Sidebar', group: 'right-top', menuHidden: true },

  // Bottom (split)
  { id: 'diagnostic-console', component: 'diagnostic-console', title: 'Console', group: 'bottom-left' },
  { id: 'log-panel', component: 'log-panel', title: 'Logs', group: 'bottom-left' },
  { id: 'continuity-panel', component: 'continuity-panel', title: 'Continuity', group: 'bottom-left' },
  { id: 'compilation-inspector', component: 'compilation-inspector', title: 'Compilation', group: 'bottom-left' },
  { id: 'debug-miniview', component: 'debug-miniview', title: 'Debug', group: 'bottom-right', initiallyHidden: true },
  { id: 'step-debugger', component: 'step-debugger', title: 'Step Debugger', group: 'bottom-right', initiallyHidden: true },

  // Help (not in default layout — opened on demand by ChartHelpButton)
  { id: 'help', component: 'help', title: 'Help', group: 'bottom-right', initiallyHidden: true, menuHidden: true },

  // Floating
  { id: 'preview', component: 'preview', title: 'Preview', group: 'preview-float', floating: true },
];

// [LAW:one-source-of-truth] Panels-menu entries are derived from the canonical
// panel registry, with one explicit logical Settings entry for the sidebar tab.
export const PANEL_MENU_ITEMS: readonly PanelMenuItem[] = (() => {
  const items = PANEL_DEFINITIONS
    .filter((panel) => !panel.menuHidden)
    .map((panel) => ({ id: panel.id, title: panel.title }));
  const debugIndex = items.findIndex((item) => item.id === 'debug-miniview');
  const settingsItem = { id: 'settings', title: 'Settings' };

  if (debugIndex < 0) {
    return [...items, settingsItem];
  }

  return [
    ...items.slice(0, debugIndex + 1),
    settingsItem,
    ...items.slice(debugIndex + 1),
  ];
})();
