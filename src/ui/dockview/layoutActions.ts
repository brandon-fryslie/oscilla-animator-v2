import type { DockviewApi, DockviewGroupPanel } from 'dockview';
import { PANEL_DEFINITIONS } from './panelRegistry';
import { createDefaultLayout } from './defaultLayout';
import { clearStoredDockviewLayout } from './layoutPersistence';

type SidebarSide = 'left' | 'right';

const SIDEBAR_PANEL_IDS: Record<SidebarSide, string[]> = {
  left: ['block-library', 'block-inspector'],
  right: ['settings'],
};

export const SIDEBAR_DEFAULT_WIDTH: Record<SidebarSide, number> = {
  left: 280,
  right: 260,
};

const sidebarExpandedWidth: Record<SidebarSide, number> = {
  left: SIDEBAR_DEFAULT_WIDTH.left,
  right: SIDEBAR_DEFAULT_WIDTH.right,
};

function getSidebarGroup(api: DockviewApi, side: SidebarSide): DockviewGroupPanel | null {
  const panel = SIDEBAR_PANEL_IDS[side]
    .map((id) => api.getPanel(id))
    .find((candidate) => Boolean(candidate));
  return panel?.group ?? null;
}

function getSidebarForPanel(panelId: string): SidebarSide | null {
  if (SIDEBAR_PANEL_IDS.left.includes(panelId)) {
    return 'left';
  }
  if (SIDEBAR_PANEL_IDS.right.includes(panelId)) {
    return 'right';
  }
  return null;
}

export function isSidebarCollapsed(api: DockviewApi, side: SidebarSide): boolean {
  const group = getSidebarGroup(api, side);
  if (!group) {
    return false;
  }
  return group.api.width <= 1;
}

export function setSidebarCollapsed(api: DockviewApi, side: SidebarSide, collapsed: boolean): boolean {
  const group = getSidebarGroup(api, side);
  if (!group) {
    return false;
  }

  if (collapsed) {
    if (group.api.width > 1) {
      sidebarExpandedWidth[side] = group.api.width;
    }
    group.api.setSize({ width: 0 });
    return true;
  }

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

export function openOrFocusPanel(api: DockviewApi, panelId: string): boolean {
  const existing = api.getPanel(panelId);
  if (existing) {
    const sidebar = getSidebarForPanel(panelId);
    if (sidebar) {
      setSidebarCollapsed(api, sidebar, false);
    }
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
  const sidebar = getSidebarForPanel(panelId);
  if (sidebar) {
    setSidebarCollapsed(api, sidebar, false);
  }
  api.getPanel(definition.id)?.api.setActive();
  return true;
}

export function resetDockviewLayout(api: DockviewApi): void {
  // [LAW:one-source-of-truth] default layout structure is owned by createDefaultLayout.
  clearStoredDockviewLayout();
  api.clear();
  createDefaultLayout(api);
}
