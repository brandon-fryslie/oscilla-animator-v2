import React, { useCallback, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { PaneviewReact, type IPaneviewPanelProps, type PaneviewReadyEvent } from 'dockview';
import type { BlockId } from '../../types';
import { useStores } from '../../stores';
import { SharedExpressionEditor } from './SharedExpressionEditor';
import './ExpressionEditorWorkbench.css';

export interface ExpressionEditorWorkbenchProps {
  readonly blockId: BlockId | null;
}

export const ExpressionEditorWorkbench = observer(function ExpressionEditorWorkbench({
  blockId,
}: ExpressionEditorWorkbenchProps) {
  const { patch: patchStore, diagnostics } = useStores();
  const patch = patchStore.patch;

  const block = blockId && patch ? patch.blocks.get(blockId) : null;
  const expressionValue = String(block?.params?.expression ?? '');
  // [LAW:dataflow-not-control-flow] Keep hook order stable; render variants
  // are driven by data state instead of early-returning before later hooks run.
  const workbenchState = patch && blockId && block
    ? { kind: 'ready' as const, patch, blockId, block, expressionValue }
    : { kind: 'empty' as const };

  const expressionDiagnostics = useMemo(() => {
    if (!blockId) return [];
    return diagnostics.activeDiagnostics.filter(
      (diag) =>
        diag.primaryTarget.kind === 'block' &&
        diag.primaryTarget.blockId === blockId &&
        (diag.code === 'E_EXPR_SYNTAX' || diag.code === 'E_EXPR_TYPE' || diag.code === 'E_EXPR_COMPILE'),
    );
  }, [blockId, diagnostics.activeDiagnostics]);

  const paneComponents = useMemo<Record<string, React.FC<IPaneviewPanelProps>>>(() => ({
    editor: () => {
      if (workbenchState.kind === 'empty') {
        return (
          <div className="expression-workbench__pane expression-workbench__empty-pane">
            Select an Expression block to edit.
          </div>
        );
      }
      return (
        <div className="expression-workbench__pane expression-workbench__pane--editor">
          <SharedExpressionEditor
            blockId={workbenchState.blockId}
            value={workbenchState.expressionValue}
            patch={workbenchState.patch}
            showPopOutButton={false}
          />
        </div>
      );
    },
    reference: () => (
      <div className="expression-workbench__pane">
        <div className="expression-workbench__docs-body">
          <p>Use block outputs by canonical address only.</p>
          <p>Autocomplete: type, or press Ctrl/Cmd+Space.</p>
          <p>Functions are inserted with placeholders and can be nested.</p>
        </div>
      </div>
    ),
    diagnostics: () => (
      <div className="expression-workbench__pane">
        {expressionDiagnostics.length === 0 ? (
          <div className="expression-workbench__empty">No expression diagnostics.</div>
        ) : (
          <div className="expression-workbench__warnings">
            {expressionDiagnostics.map((diag) => (
              <div key={`${diag.code}-${diag.message}`} className="expression-workbench__warning">
                [{diag.code}] {diag.message}
              </div>
            ))}
          </div>
        )}
      </div>
    ),
    tips: () => (
      <div className="expression-workbench__pane">
        <div className="expression-workbench__docs-body">
          <p>Expression diagnostics now come from the real compiler fragment path.</p>
          <p>Inline squiggles anchor to compiler-reported source ranges.</p>
          <p>Turn on auto-compile to persist expression edits on each keypress.</p>
        </div>
      </div>
    ),
  }), [expressionDiagnostics, workbenchState]);

  const handlePaneReady = useCallback((event: PaneviewReadyEvent) => {
    [
      { id: 'editor', title: 'Editor', size: 520, isExpanded: true },
      { id: 'reference', title: 'Reference', size: 140, isExpanded: false },
      { id: 'diagnostics', title: 'Diagnostics', size: 140, isExpanded: false },
      { id: 'tips', title: 'Tips', size: 120, isExpanded: false },
    ].forEach((panel) => {
      if (event.api.getPanel(panel.id)) {
        return;
      }
      event.api.addPanel({
        id: panel.id,
        component: panel.id,
        title: panel.title,
        size: panel.size,
        isExpanded: panel.isExpanded,
      });
    });
    event.api.getPanel('editor')?.api.setActive();
  }, []);

  return (
    <div className="expression-workbench">
      <div className="expression-workbench__header">
        <div className="expression-workbench__title">Expression Editor</div>
        <div className="expression-workbench__subtitle">
          {workbenchState.kind === 'ready' ? (workbenchState.block.displayName ?? workbenchState.block.type) : 'No block selected'}
        </div>
      </div>

      <div className="expression-workbench__body">
        <PaneviewReact
          className="expression-workbench__paneview oscilla-sidebar-paneview"
          components={paneComponents}
          onReady={handlePaneReady}
        />
      </div>
    </div>
  );
});
