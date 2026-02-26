import type { DockviewApi, DockviewGroupPanel } from 'dockview';
import { PANEL_DEFINITIONS } from './panelRegistry';
import { createDefaultLayout } from './defaultLayout';
import { clearStoredDockviewLayout } from './layoutPersistence';
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_PANEL_IDS,
  type SidebarSide,
} from './sidebarConfig';

const SIDEBAR_SIDES: readonly SidebarSide[] = ['left', 'right'];

const LEGACY_PANEL_TO_SIDEBAR: Partial<Record<string, SidebarSide>> = {
  'block-library': 'left',
  'block-inspector': 'left',
  settings: 'right',
};

const sidebarExpandedWidth: Record<SidebarSide, number> = {
  left: SIDEBAR_DEFAULT_WIDTH.left,
  right: SIDEBAR_DEFAULT_WIDTH.right,
};

function clampSidebarWidth(side: SidebarSide, width: number): number {
  return Math.max(SIDEBAR_MIN_WIDTH[side], Math.min(SIDEBAR_MAX_WIDTH[side], width));
}

function getSidebarGroup(api: DockviewApi, side: SidebarSide): DockviewGroupPanel | null {
  const panel = api.getPanel(SIDEBAR_PANEL_IDS[side]);
  return panel?.group ?? null;
}

export function getSidebarForPanel(panelId: string): SidebarSide | null {
  if (panelId === SIDEBAR_PANEL_IDS.left) {
    return 'left';
  }
  if (panelId === SIDEBAR_PANEL_IDS.right) {
    return 'right';
  }
  return LEGACY_PANEL_TO_SIDEBAR[panelId] ?? null;
}

function rememberExpandedSidebarWidth(group: DockviewGroupPanel, side: SidebarSide): void {
  if (!group.api.isVisible) {
    return;
  }
  if (group.api.width <= 1) {
    return;
  }
  sidebarExpandedWidth[side] = clampSidebarWidth(side, group.api.width);
}

export function applySidebarConstraints(api: DockviewApi): void {
  for (const side of SIDEBAR_SIDES) {
    const group = getSidebarGroup(api, side);
    if (!group) {
      continue;
    }

    group.api.setConstraints({
      minimumWidth: SIDEBAR_MIN_WIDTH[side],
      maximumWidth: SIDEBAR_MAX_WIDTH[side],
    });

    rememberExpandedSidebarWidth(group, side);
    if (group.api.isVisible) {
      group.api.setSize({ width: sidebarExpandedWidth[side] });
    }
  }
}

export function isSidebarCollapsed(api: DockviewApi, side: SidebarSide): boolean {
  const group = getSidebarGroup(api, side);
  if (!group) {
    return false;
  }
  return !group.api.isVisible;
}

export function setSidebarCollapsed(api: DockviewApi, side: SidebarSide, collapsed: boolean): boolean {
  const group = getSidebarGroup(api, side);
  if (!group) {
    return false;
  }

  // [LAW:no-silent-fallbacks] Sidebar visibility is explicitly controlled via
  // Dockview visibility state, not implicit zero-width conventions.
  if (collapsed) {
    rememberExpandedSidebarWidth(group, side);
    group.api.setVisible(false);
    return true;
  }

  group.api.setVisible(true);
  group.api.setConstraints({
    minimumWidth: SIDEBAR_MIN_WIDTH[side],
    maximumWidth: SIDEBAR_MAX_WIDTH[side],
  });
  group.api.setSize({ width: sidebarExpandedWidth[side] });
  group.api.setActive();
  return true;
}

export function toggleSidebar(api: DockviewApi, side: SidebarSide): boolean {
  return setSidebarCollapsed(api, side, !isSidebarCollapsed(api, side));
}

export function toggleSidebars(api: DockviewApi): void {
  const collapseBoth = !isSidebarCollapsed(api, 'left') || !isSidebarCollapsed(api, 'right');
  setSidebarCollapsed(api, 'left', collapseBoth);
  setSidebarCollapsed(api, 'right', collapseBoth);
}

export function closeActivePanel(api: DockviewApi): boolean {
  const panel = api.activePanel;
  if (!panel) {
    return false;
  }
  panel.api.close();
  return true;
}

export function toggleMaximizeActivePanel(api: DockviewApi): boolean {
  const panel = api.activePanel;
  if (!panel) {
    return false;
  }
  if (panel.api.isMaximized()) {
    panel.api.exitMaximized();
  } else {
    panel.api.maximize();
  }
  return true;
}

export function moveActivePanelToFloating(api: DockviewApi): boolean {
  const panel = api.activePanel;
  if (!panel || panel.api.location.type === 'floating') {
    return false;
  }

  api.addFloatingGroup(panel, {
    width: Math.max(320, panel.api.width),
    height: Math.max(240, panel.api.height),
  });
  return true;
}

function getReferenceGroup(api: DockviewApi, groupName: string): DockviewGroupPanel | undefined {
  const peerDefinition = PANEL_DEFINITIONS.find((panel) => panel.group === groupName && api.getPanel(panel.id));
  const peerPanel = peerDefinition ? api.getPanel(peerDefinition.id) : undefined;
  return peerPanel?.group ?? api.activeGroup ?? api.groups[0];
}

function getSidebarPanelIdForRequest(panelId: string): string | null {
  const sidebar = getSidebarForPanel(panelId);
  if (!sidebar) {
    return null;
  }
  return SIDEBAR_PANEL_IDS[sidebar];
}

export function openOrFocusPanel(api: DockviewApi, panelId: string): boolean {
  const sidebarPanelId = getSidebarPanelIdForRequest(panelId);
  if (sidebarPanelId) {
    const sidebar = getSidebarForPanel(sidebarPanelId)!;
    setSidebarCollapsed(api, sidebar, false);
    api.getPanel(sidebarPanelId)?.api.setActive();
    return true;
  }

  const existing = api.getPanel(panelId);
  if (existing) {
    existing.api.setActive();
    return true;
  }

  const definition = PANEL_DEFINITIONS.find((panel) => panel.id === panelId);
  if (!definition) {
    return false;
  }

  if (definition.floating) {
    api.addPanel({
      id: definition.id,
      component: definition.component,
      title: definition.title,
      floating: {
        x: Math.floor(window.innerWidth * 0.6),
        y: 64,
        width: 320,
        height: 320,
      },
      minimumWidth: 160,
      minimumHeight: 160,
    });
    return true;
  }

  const referenceGroup = getReferenceGroup(api, definition.group);
  api.addPanel({
    id: definition.id,
    component: definition.component,
    title: definition.title,
    position: referenceGroup
      ? {
          referenceGroup: referenceGroup.id,
          direction: 'within',
        }
      : undefined,
  });
  api.getPanel(definition.id)?.api.setActive();
  return true;
}

export function resetDockviewLayout(api: DockviewApi): void {
  // [LAW:one-source-of-truth] default layout structure is owned by createDefaultLayout.
  clearStoredDockviewLayout();
  api.clear();
  createDefaultLayout(api);
  applySidebarConstraints(api);
}

