/**
 * Default Layout Builder
 *
 * Creates the initial Dockview layout structure:
 * - Left sidebar: Library (top), Inspector (bottom) - stacked
 * - Center: Rete, Flow, Table, Matrix - tabbed editors
 * - Bottom: Diagnostics (left), empty placeholder (right) - split
 * - Floating: Preview panel (draggable, resizable, dockable)
 *
 * Right sidebar groups are intentionally empty by default.
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
 * Builds the default layout with floating preview and split bottom.
 * Groups are created left-to-right, top-to-bottom, then floating last.
 *
 * Note: Dockview creates groups implicitly when adding panels with position directives.
 * We don't need to call addGroup() explicitly.
 */
export function createDefaultLayout(api: DockviewApi, callbacks: LayoutCallbacks = {}): void {
  // Get panel definitions by group (excluding floating panels)
  const leftTopPanels = PANEL_DEFINITIONS.filter((p) => p.group === 'left-top');
  const leftBottomPanels = PANEL_DEFINITIONS.filter((p) => p.group === 'left-bottom');
  const centerPanels = PANEL_DEFINITIONS.filter((p) => p.group === 'center');
  const bottomLeftPanels = PANEL_DEFINITIONS.filter((p) => p.group === 'bottom-left');
  const floatingPanels = PANEL_DEFINITIONS.filter((p) => p.floating);

  // 1. Add first left-top panel (creates the first group - anchor for layout)
  const firstLeftTopPanel = leftTopPanels[0];
  if (!firstLeftTopPanel) {
    throw new Error('Layout requires at least one left-top panel as anchor');
  }

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

  // 2. Add left-bottom panels (below left-top)
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

  // 3. Add center panels (right of left-top) - all as tabs in same group
  centerPanels.forEach((panel, index) => {
    const params: Record<string, unknown> = {};

    // Pass callbacks to panels that need them
    if (panel.id === 'rete-editor' && callbacks.onReteEditorReady) {
      params.onEditorReady = callbacks.onReteEditorReady;
    } else if (panel.id === 'flow-editor' && callbacks.onReactFlowEditorReady) {
      params.onEditorReady = callbacks.onReactFlowEditorReady;
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

  // 4. Add bottom-left panels (below left-bottom, spanning to center)
  const firstLeftBottomPanel = leftBottomPanels[0];
  bottomLeftPanels.forEach((panel, index) => {
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

  // 5. Create bottom-right group (split from bottom-left)
  // For now, we'll skip creating an empty group as Dockview may collapse it.
  // The group will be created when a panel is docked there.
  // TODO: If we want a visible empty group, we can add a placeholder panel.

  // 6. Add floating preview panel (LAST - after docked layout is complete)
  const previewPanel = floatingPanels.find((p) => p.id === 'preview');
  if (previewPanel) {
    const params: Record<string, unknown> = {};
    if (callbacks.onCanvasReady) {
      params.onCanvasReady = callbacks.onCanvasReady;
    }

    // Calculate position: ~60% from left, near top
    const x = Math.floor(window.innerWidth * 0.6);
    const y = 50;

    api.addPanel({
      id: previewPanel.id,
      component: previewPanel.component,
      title: previewPanel.title,
      params: Object.keys(params).length > 0 ? params : undefined,
      floating: {
        x,
        y,
        width: 300,
        height: 300,
      },
    });
  }

  // 7. Set initial sizes for groups
  // Note: Dockview will adjust sizes dynamically, these are suggestions
  const leftTopPanel = api.getPanel(firstLeftTopPanel.id);
  if (leftTopPanel?.api.group) {
    leftTopPanel.api.group.api.setSize({ width: 280 });
  }

  const bottomLeftPanel = api.getPanel(bottomLeftPanels[0]?.id || '');
  if (bottomLeftPanel?.api.group) {
    bottomLeftPanel.api.group.api.setSize({ height: 120 });
  }
}
