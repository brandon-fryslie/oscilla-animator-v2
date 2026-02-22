import type { DockviewApi } from 'dockview';
import type { BlockId } from '../../types';

export const EXPRESSION_EDITOR_PANEL_ID = 'expression-editor';
export const EXPRESSION_EDITOR_COMPONENT_ID = 'expression-editor';

function getSplitReferencePanel(api: DockviewApi) {
  return (
    api.getPanel('flow-editor')
    ?? api.getPanel('composite-editor')
    ?? api.getPanel('table-view')
    ?? api.getPanel('connection-matrix')
    ?? api.activePanel
  );
}

/**
 * Opens (or focuses) the shared Expression Editor panel for a block.
 *
 * // [LAW:one-source-of-truth] A single panel id is reused for all expression edits.
 */
export function openExpressionEditorPanel(api: DockviewApi, blockId: BlockId): void {
  const existing = api.getPanel(EXPRESSION_EDITOR_PANEL_ID);
  if (existing) {
    existing.update({ params: { blockId } });
    existing.api.setActive();
    return;
  }

  const referencePanel = getSplitReferencePanel(api);

  // [LAW:dataflow-not-control-flow] Always attempt visible side-by-side split first; fallback is data-driven error handling.
  try {
    if (referencePanel) {
      api.addPanel({
        id: EXPRESSION_EDITOR_PANEL_ID,
        component: EXPRESSION_EDITOR_COMPONENT_ID,
        title: 'Expression Editor',
        params: { blockId },
        position: {
          referencePanel,
          direction: 'right',
        },
        minimumWidth: 320,
        minimumHeight: 220,
      });
    } else {
      api.addPanel({
        id: EXPRESSION_EDITOR_PANEL_ID,
        component: EXPRESSION_EDITOR_COMPONENT_ID,
        title: 'Expression Editor',
        params: { blockId },
        minimumWidth: 320,
        minimumHeight: 220,
      });
    }
  } catch {
    api.addPanel({
      id: EXPRESSION_EDITOR_PANEL_ID,
      component: EXPRESSION_EDITOR_COMPONENT_ID,
      title: 'Expression Editor',
      params: { blockId },
      minimumWidth: 320,
      minimumHeight: 220,
    });
  }
  api.getPanel(EXPRESSION_EDITOR_PANEL_ID)?.api.setActive();
}
