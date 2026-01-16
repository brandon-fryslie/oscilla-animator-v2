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
 *
 * Note: Dockview creates groups implicitly when adding panels with position directives.
 * We don't need to call addGroup() explicitly.
 */
export function createDefaultLayout(api: DockviewApi, callbacks: LayoutCallbacks = {}): void {
  // Get panel definitions by group
  const leftTopPanels = PANEL_DEFINITIONS.filter((p) => p.group === 'left-top');
  const leftBottomPanels = PANEL_DEFINITIONS.filter((p) => p.group === 'left-bottom');
  const centerPanels = PANEL_DEFINITIONS.filter((p) => p.group === 'center');
  const rightTopPanels = PANEL_DEFINITIONS.filter((p) => p.group === 'right-top');
  const rightBottomPanels = PANEL_DEFINITIONS.filter((p) => p.group === 'right-bottom');
  const bottomPanels = PANEL_DEFINITIONS.filter((p) => p.group === 'bottom');

  // Add first left-top panel (creates the first group)
  const firstLeftTopPanel = leftTopPanels[0];
  if (firstLeftTopPanel) {
    api.addPanel({
      id: firstLeftTopPanel.id,
      component: firstLeftTopPanel.component,
      title: firstLeftTopPanel.title,
    });

    // Add remaining left-top panels as tabs in same group
    leftTopPanels.slice(1).forEach((panel) => {
      api.addPanel({
        id: panel.id,
        component: panel.component,
        title: panel.title,
        position: { referencePanel: firstLeftTopPanel.id },
      });
    });
  }

  // Add left-bottom panels (below left-top)
  leftBottomPanels.forEach((panel, index) => {
    api.addPanel({
      id: panel.id,
      component: panel.component,
      title: panel.title,
      position: {
        referencePanel: firstLeftTopPanel.id,
        direction: index === 0 ? 'below' : 'within',
      },
    });
  });

  // Add center panels (right of left-top) - all as tabs in same group
  centerPanels.forEach((panel, index) => {
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
      position: {
        referencePanel: firstLeftTopPanel.id,
        direction: index === 0 ? 'right' : 'within',
      },
      params: Object.keys(params).length > 0 ? params : undefined,
    });
  });

  // Activate the rete editor tab
  const retePanel = api.getPanel('rete-editor');
  if (retePanel) {
    retePanel.api.setActive();
  }

  // Add right-top panels (right of center)
  const firstCenterPanel = centerPanels[0];
  rightTopPanels.forEach((panel, index) => {
    api.addPanel({
      id: panel.id,
      component: panel.component,
      title: panel.title,
      position: {
        referencePanel: firstCenterPanel?.id || firstLeftTopPanel.id,
        direction: index === 0 ? 'right' : 'within',
      },
    });
  });

  // Add right-bottom panels (below right-top)
  const firstRightTopPanel = rightTopPanels[0];
  rightBottomPanels.forEach((panel, index) => {
    api.addPanel({
      id: panel.id,
      component: panel.component,
      title: panel.title,
      position: {
        referencePanel: firstRightTopPanel?.id || firstLeftTopPanel.id,
        direction: index === 0 ? 'below' : 'within',
      },
    });
  });

  // Add bottom panels (below left-bottom, spanning width)
  const firstLeftBottomPanel = leftBottomPanels[0];
  bottomPanels.forEach((panel, index) => {
    api.addPanel({
      id: panel.id,
      component: panel.component,
      title: panel.title,
      position: {
        referencePanel: firstLeftBottomPanel?.id || firstLeftTopPanel.id,
        direction: index === 0 ? 'below' : 'within',
      },
    });
  });

  // Set initial sizes
  // Note: Dockview will adjust sizes dynamically, these are suggestions
  const leftTopPanel = api.getPanel(firstLeftTopPanel.id);
  if (leftTopPanel?.api.group) {
    leftTopPanel.api.group.api.setSize({ width: 280 });
  }

  const firstRightPanel = api.getPanel(firstRightTopPanel?.id || '');
  if (firstRightPanel?.api.group) {
    firstRightPanel.api.group.api.setSize({ width: 300 });
  }

  const bottomPanel = api.getPanel(bottomPanels[0]?.id || '');
  if (bottomPanel?.api.group) {
    bottomPanel.api.group.api.setSize({ height: 150 });
  }
}
