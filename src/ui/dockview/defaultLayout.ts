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
 *
 * EXPLICIT GROUP CREATION APPROACH:
 * This implementation creates the group structure FIRST using api.addGroup(),
 * then adds panels to those groups. This makes layout deterministic and
 * independent of panel creation order.
 */

import type { DockviewApi, DockviewGroupPanel } from 'dockview';
import { PANEL_DEFINITIONS } from './panelRegistry';
import type { EditorHandle } from '../editorCommon';

interface LayoutCallbacks {
  onReteEditorReady?: (handle: EditorHandle) => void;
  onReactFlowEditorReady?: (handle: EditorHandle) => void;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

/**
 * Builds the default layout with floating preview and split bottom.
 *
 * PHASE 1: Create group structure explicitly
 * PHASE 2: Add panels to those groups (order-independent)
 *
 * Target Structure:
 * +------------------+------------------------+
 * | left-top         |  center                |
 * | (Library)        |  (Rete|Flow|Table|Mat) |
 * +------------------+                        |
 * | left-bottom      |                        |
 * | (Inspector)      |                        |
 * +------------------+------------------------+
 * | bottom-left      | bottom-right           |
 * | (Diagnostics)    | (empty)                |
 * +-------------------------------------------+
 * + Floating: preview (300x300)
 */
export function createDefaultLayout(api: DockviewApi, callbacks: LayoutCallbacks = {}): void {
  // Get panel definitions by group
  const leftTopPanels = PANEL_DEFINITIONS.filter((p) => p.group === 'left-top');
  const leftBottomPanels = PANEL_DEFINITIONS.filter((p) => p.group === 'left-bottom');
  const centerPanels = PANEL_DEFINITIONS.filter((p) => p.group === 'center');
  const bottomLeftPanels = PANEL_DEFINITIONS.filter((p) => p.group === 'bottom-left');
  const floatingPanels = PANEL_DEFINITIONS.filter((p) => p.floating);

  // Validate we have required panels
  if (leftTopPanels.length === 0) {
    throw new Error('Layout requires at least one left-top panel as anchor');
  }

  // ============================================================================
  // PHASE 1: Create group structure explicitly
  // ============================================================================

  // 1. Create left-top group (anchor - first group in the layout)
  const leftTopGroup = api.addGroup();

  // 2. Create center group to the RIGHT of left-top
  //    This establishes the left sidebar | center split
  const centerGroup = api.addGroup({
    referenceGroup: leftTopGroup,
    direction: 'right',
  });

  // 3. Create left-bottom group BELOW left-top (within left column)
  //    This splits the left sidebar vertically
  const leftBottomGroup = api.addGroup({
    referenceGroup: leftTopGroup,
    direction: 'below',
  });

  // 4. Create bottom-left group BELOW center (spans to bottom)
  //    This creates the bottom bar
  const bottomLeftGroup = api.addGroup({
    referenceGroup: centerGroup,
    direction: 'below',
  });

  // 5. Create bottom-right group to the RIGHT of bottom-left
  //    This splits the bottom bar horizontally
  //    Note: Empty groups may collapse, but the structure exists for docking
  const bottomRightGroup = api.addGroup({
    referenceGroup: bottomLeftGroup,
    direction: 'right',
  });

  // Store group references for panel addition
  const groups: Record<string, DockviewGroupPanel> = {
    'left-top': leftTopGroup,
    'left-bottom': leftBottomGroup,
    center: centerGroup,
    'bottom-left': bottomLeftGroup,
    'bottom-right': bottomRightGroup,
  };

  // ============================================================================
  // PHASE 2: Add panels to groups (order-independent)
  // ============================================================================

  // Add left-top panels (Library, etc.)
  leftTopPanels.forEach((panel, index) => {
    api.addPanel({
      id: panel.id,
      component: panel.component,
      title: panel.title,
      position: {
        referenceGroup: groups['left-top'].id,
        direction: 'within', // Add as tab in same group
      },
    });

    // Activate the first panel in the group
    if (index === 0) {
      const addedPanel = api.getPanel(panel.id);
      addedPanel?.api.setActive();
    }
  });

  // Add center panels (Rete, Flow, Table, Matrix)
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
        referenceGroup: groups.center.id,
        direction: 'within', // Add as tab in same group
      },
      params: Object.keys(params).length > 0 ? params : undefined,
      minimumHeight: 200, // Ensure panels have minimum height for React Flow
      minimumWidth: 200,  // Ensure panels have minimum width for React Flow
    });
  });

  // Activate the flow editor tab (now the primary editor)
  const flowPanel = api.getPanel('flow-editor');
  if (flowPanel) {
    flowPanel.api.setActive();
  }

  // Add left-bottom panels (Inspector, etc.)
  leftBottomPanels.forEach((panel, index) => {
    api.addPanel({
      id: panel.id,
      component: panel.component,
      title: panel.title,
      position: {
        referenceGroup: groups['left-bottom'].id,
        direction: 'within',
      },
    });

    if (index === 0) {
      const addedPanel = api.getPanel(panel.id);
      addedPanel?.api.setActive();
    }
  });

  // Add bottom-left panels (Diagnostics, etc.)
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
      const addedPanel = api.getPanel(panel.id);
      addedPanel?.api.setActive();
    }
  });

  // Note: bottom-right group intentionally left empty (available for docking)

  // ============================================================================
  // PHASE 3: Set initial group sizes
  // ============================================================================

  // Set left sidebar width
  leftTopGroup.api.setSize({ width: 280 });

  // Set bottom bar height
  bottomLeftGroup.api.setSize({ height: 240 });

  // ============================================================================
  // PHASE 4: Add floating preview panel (LAST)
  // ============================================================================

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
      minimumWidth: 150,
      minimumHeight: 150,
    });
  }
}
