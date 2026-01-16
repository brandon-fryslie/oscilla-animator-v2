/**
 * Default Layout Builder
 *
 * Creates the initial Dockview layout structure:
 * - Left sidebar: Library (top), Inspector (bottom) - stacked
 * - Center: Blocks, Matrix, Rete, Flow, Preview - tabbed
 * - Right sidebar: Domains (top), Help (bottom) - stacked
 * - Bottom: Diagnostic Console
 */

import type { DockviewApi } from 'dockview';
import { PANEL_DEFINITIONS } from './panelRegistry';
import type { EditorHandle } from '../editorCommon';

interface LayoutCallbacks {
  onReteEditorReady?: (handle: EditorHandle) => void;
  onReactFlowEditorReady?: (handle: EditorHandle) => void;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

/**
 * Builds the default 6-group layout.
 * Groups are created left-to-right, top-to-bottom.
 */
export function createDefaultLayout(api: DockviewApi, callbacks: LayoutCallbacks = {}): void {
  // Get panel definitions by group
  const leftTopPanels = PANEL_DEFINITIONS.filter((p) => p.group === 'left-top');
  const leftBottomPanels = PANEL_DEFINITIONS.filter((p) => p.group === 'left-bottom');
  const centerPanels = PANEL_DEFINITIONS.filter((p) => p.group === 'center');
  const rightTopPanels = PANEL_DEFINITIONS.filter((p) => p.group === 'right-top');
  const rightBottomPanels = PANEL_DEFINITIONS.filter((p) => p.group === 'right-bottom');
  const bottomPanels = PANEL_DEFINITIONS.filter((p) => p.group === 'bottom');

  // Create left-top group (first group, no reference needed)
  const leftTopGroup = api.addGroup({ id: 'left-top' });
  leftTopPanels.forEach((panel) => {
    api.addPanel({
      id: panel.id,
      component: panel.component,
      title: panel.title,
      position: { referenceGroup: leftTopGroup },
    });
  });

  // Create left-bottom group (below left-top)
  const leftBottomGroup = api.addGroup({
    id: 'left-bottom',
    position: { referenceGroup: leftTopGroup, direction: 'below' },
  });
  leftBottomPanels.forEach((panel) => {
    api.addPanel({
      id: panel.id,
      component: panel.component,
      title: panel.title,
      position: { referenceGroup: leftBottomGroup },
    });
  });

  // Create center group (right of left-top)
  const centerGroup = api.addGroup({
    id: 'center',
    position: { referenceGroup: leftTopGroup, direction: 'right' },
  });
  centerPanels.forEach((panel) => {
    const params: Record<string, unknown> = {};

    // Pass callbacks to panels that need them
    if (panel.id === 'rete-editor' && callbacks.onReteEditorReady) {
      params.onEditorReady = callbacks.onReteEditorReady;
    } else if (panel.id === 'flow-editor' && callbacks.onReactFlowEditorReady) {
      params.onEditorReady = callbacks.onReactFlowEditorReady;
    } else if (panel.id === 'preview' && callbacks.onCanvasReady) {
      params.onCanvasReady = callbacks.onCanvasReady;
    }

    api.addPanel({
      id: panel.id,
      component: panel.component,
      title: panel.title,
      position: { referenceGroup: centerGroup },
      params: Object.keys(params).length > 0 ? params : undefined,
    });
  });

  // Activate the first center panel (Rete editor by default)
  const retePanel = api.getPanel('rete-editor');
  if (retePanel) {
    retePanel.api.setActive();
  }

  // Create right-top group (right of center)
  const rightTopGroup = api.addGroup({
    id: 'right-top',
    position: { referenceGroup: centerGroup, direction: 'right' },
  });
  rightTopPanels.forEach((panel) => {
    api.addPanel({
      id: panel.id,
      component: panel.component,
      title: panel.title,
      position: { referenceGroup: rightTopGroup },
    });
  });

  // Create right-bottom group (below right-top)
  const rightBottomGroup = api.addGroup({
    id: 'right-bottom',
    position: { referenceGroup: rightTopGroup, direction: 'below' },
  });
  rightBottomPanels.forEach((panel) => {
    api.addPanel({
      id: panel.id,
      component: panel.component,
      title: panel.title,
      position: { referenceGroup: rightBottomGroup },
    });
  });

  // Create bottom group (below left-bottom, spanning width)
  const bottomGroup = api.addGroup({
    id: 'bottom',
    position: { referenceGroup: leftBottomGroup, direction: 'below' },
  });
  bottomPanels.forEach((panel) => {
    api.addPanel({
      id: panel.id,
      component: panel.component,
      title: panel.title,
      position: { referenceGroup: bottomGroup },
    });
  });

  // Set initial sizes via group APIs
  // Left sidebar: 280px
  if (leftTopGroup.api.width !== 280) {
    leftTopGroup.api.setSize({ width: 280 });
  }

  // Right sidebar: 300px
  if (rightTopGroup.api.width !== 300) {
    rightTopGroup.api.setSize({ width: 300 });
  }

  // Bottom: 150px
  if (bottomGroup.api.height !== 150) {
    bottomGroup.api.setSize({ height: 150 });
  }

  // Split left sidebar 50/50
  if (leftTopGroup.api.height && leftBottomGroup.api.height) {
    const totalHeight = leftTopGroup.api.height + leftBottomGroup.api.height;
    const halfHeight = totalHeight / 2;
    leftTopGroup.api.setSize({ height: halfHeight });
  }

  // Split right sidebar 50/50
  if (rightTopGroup.api.height && rightBottomGroup.api.height) {
    const totalHeight = rightTopGroup.api.height + rightBottomGroup.api.height;
    const halfHeight = totalHeight / 2;
    rightTopGroup.api.setSize({ height: halfHeight });
  }
}
