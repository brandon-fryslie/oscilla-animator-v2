export type RightSidebarTabId =
  | 'right-sidebar-debug-pane'
  | 'right-sidebar-settings-pane';

export interface RightSidebarTabDefinition {
  id: RightSidebarTabId;
  component: string;
  title: string;
  minimumBodySize: number;
  size: number;
  defaultActive?: boolean;
  requestPanelIds: readonly string[];
}

export const RIGHT_SIDEBAR_TAB_DEFINITIONS: readonly RightSidebarTabDefinition[] = [
  {
    id: 'right-sidebar-debug-pane',
    component: 'right-sidebar-debug',
    title: 'Debug',
    minimumBodySize: 120,
    size: 1,
    defaultActive: true,
    requestPanelIds: ['right-sidebar', 'debug-miniview'],
  },
  {
    id: 'right-sidebar-settings-pane',
    component: 'right-sidebar-settings',
    title: 'Settings',
    minimumBodySize: 120,
    size: 1,
    requestPanelIds: ['settings'],
  },
];

export const RIGHT_SIDEBAR_DEFAULT_TAB_ID =
  RIGHT_SIDEBAR_TAB_DEFINITIONS.find((tab) => tab.defaultActive)?.id ??
  RIGHT_SIDEBAR_TAB_DEFINITIONS[0].id;

// [LAW:one-source-of-truth] Logical panel requests resolve through one map so
// toolbar actions and sidebar tab selection cannot drift apart.
const RIGHT_SIDEBAR_REQUEST_TO_TAB: Readonly<Record<string, RightSidebarTabId>> =
  RIGHT_SIDEBAR_TAB_DEFINITIONS.reduce<Record<string, RightSidebarTabId>>(
    (mapping, tab) => {
      tab.requestPanelIds.forEach((panelId) => {
        mapping[panelId] = tab.id;
      });
      return mapping;
    },
    {}
  );

export function getRightSidebarTabForPanelRequest(panelId: string): RightSidebarTabId | null {
  return RIGHT_SIDEBAR_REQUEST_TO_TAB[panelId] ?? null;
}
