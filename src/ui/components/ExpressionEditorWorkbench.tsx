import React, { useMemo } from 'react';
import { observer } from 'mobx-react-lite';
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

  const expressionDiagnostics = useMemo(() => {
    if (!blockId) return [];
    return diagnostics.activeDiagnostics.filter(
      (diag) =>
        diag.primaryTarget.kind === 'block' &&
        diag.primaryTarget.blockId === blockId &&
        (diag.code === 'E_EXPR_SYNTAX' || diag.code === 'E_EXPR_TYPE' || diag.code === 'E_EXPR_COMPILE'),
    );
  }, [blockId, diagnostics.activeDiagnostics]);

  if (!patch || !blockId || !block) {
    return (
      <div className="expression-workbench expression-workbench--empty">
        Select an Expression block to edit.
      </div>
    );
  }

  return (
    <div className="expression-workbench">
      <div className="expression-workbench__header">
        <div className="expression-workbench__title">Expression Editor</div>
        <div className="expression-workbench__subtitle">{block.displayName ?? block.type}</div>
      </div>

      <div className="expression-workbench__grid">
        <section className="expression-workbench__editor">
          <div className="expression-workbench__section-title">Editor</div>
          <SharedExpressionEditor
            blockId={blockId}
            value={expressionValue}
            patch={patch}
            showPopOutButton={false}
          />
        </section>

        <section className="expression-workbench__docs">
          <div className="expression-workbench__section-title">Reference</div>
          <div className="expression-workbench__docs-body">
            <p>Use block outputs as <code>blockId.portId</code>.</p>
            <p>Autocomplete: type, or press Ctrl/Cmd+Space.</p>
            <p>Functions are inserted with placeholders and can be nested.</p>
          </div>
        </section>

        <section className="expression-workbench__debug">
          <div className="expression-workbench__section-title">Diagnostics</div>
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
        </section>

        <section className="expression-workbench__library">
          <div className="expression-workbench__section-title">Tips</div>
          <div className="expression-workbench__docs-body">
            <p>Cardinality is inferred from connected ports.</p>
            <p>Use explicit constructs for vectors/colors when needed.</p>
            <p>Prefer deterministic expressions without hidden state.</p>
          </div>
        </section>
      </div>
    </div>
  );
});
