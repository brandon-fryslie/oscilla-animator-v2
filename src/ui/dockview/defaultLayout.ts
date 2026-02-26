/**
 * Default Layout Builder
 *
 * Creates the initial Dockview layout structure:
 * - Left sidebar: PaneView-backed sidebar panel
 * - Center: Patch, Table, Matrix, Composite
 * - Right sidebar: PaneView-backed sidebar panel
 * - Bottom: diagnostics + debug split
 * - Floating: preview
 */

import type { DockviewApi, DockviewGroupPanel } from 'dockview';
import { PANEL_DEFINITIONS } from './panelRegistry';
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from './sidebarConfig';

export function createDefaultLayout(api: DockviewApi): void {
  const visible = PANEL_DEFINITIONS.filter((p) => !p.initiallyHidden);
  const leftTopPanels = visible.filter((p) => p.group === 'left-top');
  const centerPanels = visible.filter((p) => p.group === 'center');
  const rightTopPanels = visible.filter((p) => p.group === 'right-top');
  const bottomLeftPanels = visible.filter((p) => p.group === 'bottom-left');
  const bottomRightPanels = visible.filter((p) => p.group === 'bottom-right');
  const floatingPanels = visible.filter((p) => p.floating);

  if (leftTopPanels.length === 0) {
    throw new Error('Layout requires at least one left-top panel as anchor');
  }

  const leftTopGroup = api.addGroup();
  const centerGroup = api.addGroup({
    referenceGroup: leftTopGroup,
    direction: 'right',
  });
  const rightTopGroup = api.addGroup({
    referenceGroup: centerGroup,
    direction: 'right',
  });
  const bottomLeftGroup = api.addGroup({
    referenceGroup: centerGroup,
    direction: 'below',
  });
  const bottomRightGroup = api.addGroup({
    referenceGroup: bottomLeftGroup,
    direction: 'right',
  });

  const groups: Record<string, DockviewGroupPanel> = {
    'left-top': leftTopGroup,
    center: centerGroup,
    'right-top': rightTopGroup,
    'bottom-left': bottomLeftGroup,
    'bottom-right': bottomRightGroup,
  };

  leftTopPanels.forEach((panel, index) => {
    api.addPanel({
      id: panel.id,
      component: panel.component,
      title: panel.title,
      position: {
        referenceGroup: groups['left-top'].id,
        direction: 'within',
      },
      minimumWidth: SIDEBAR_MIN_WIDTH.left,
      maximumWidth: SIDEBAR_MAX_WIDTH.left,
    });

    if (index === 0) {
      api.getPanel(panel.id)?.api.setActive();
    }
  });

  centerPanels.forEach((panel) => {
    api.addPanel({
      id: panel.id,
      component: panel.component,
      title: panel.title,
      position: {
        referenceGroup: groups.center.id,
        direction: 'within',
      },
      minimumHeight: 200,
      minimumWidth: 200,
    });
  });
  api.getPanel('flow-editor')?.api.setActive();

  bottomLeftPanels.forEach((panel, index) => {
    api.addPanel({
      id: panel.id,
      component: panel.component,
      title: panel.title,
      position: {
        referenceGroup: groups['bottom-left'].id,
        direction: 'within',
      },
    });
    if (index === 0) {
      api.getPanel(panel.id)?.api.setActive();
    }
  });

  bottomRightPanels.forEach((panel) => {
    api.addPanel({
      id: panel.id,
      component: panel.component,
      title: panel.title,
      position: {
        referenceGroup: groups['bottom-right'].id,
        direction: 'within',
      },
    });
  });

  rightTopPanels.forEach((panel, index) => {
    api.addPanel({
      id: panel.id,
      component: panel.component,
      title: panel.title,
      position: {
        referenceGroup: groups['right-top'].id,
        direction: 'within',
      },
      minimumWidth: SIDEBAR_MIN_WIDTH.right,
      maximumWidth: SIDEBAR_MAX_WIDTH.right,
    });
    if (index === 0) {
      api.getPanel(panel.id)?.api.setActive();
    }
  });

  // [LAW:single-enforcer] Sidebar width constraints are owned at layout creation.
  leftTopGroup.api.setConstraints({
    minimumWidth: SIDEBAR_MIN_WIDTH.left,
    maximumWidth: SIDEBAR_MAX_WIDTH.left,
  });
  leftTopGroup.api.setSize({ width: SIDEBAR_DEFAULT_WIDTH.left });

  rightTopGroup.api.setConstraints({
    minimumWidth: SIDEBAR_MIN_WIDTH.right,
    maximumWidth: SIDEBAR_MAX_WIDTH.right,
  });
  rightTopGroup.api.setSize({ width: SIDEBAR_DEFAULT_WIDTH.right });

  bottomLeftGroup.api.setSize({ height: 240 });

  const previewPanel = floatingPanels.find((p) => p.id === 'preview');
  if (previewPanel) {
    api.addPanel({
      id: previewPanel.id,
      component: previewPanel.component,
      title: previewPanel.title,
      floating: {
        x: Math.floor(window.innerWidth * 0.6),
        y: 50,
        width: 300,
        height: 300,
      },
      minimumWidth: 150,
      minimumHeight: 150,
    });
  }
}

