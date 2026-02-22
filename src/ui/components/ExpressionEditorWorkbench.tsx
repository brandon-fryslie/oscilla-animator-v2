import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../stores';
import type { BlockId } from '../../types';
import { DebugEdgeValueDisplay } from '../debug-viz/DebugMiniView';
import { useDebugPortMiniView } from '../debug-viz/useDebugMiniView';
import { extractExpressionProgram } from '../../expr/program';
import './ExpressionEditorWorkbench.css';

interface SavedExpressionSnippet {
  readonly id: string;
  readonly name: string;
  readonly expression: string;
}

const STORAGE_KEY = 'oscilla.expressionLibrary';

const EXAMPLE_LIBRARY: ReadonlyArray<{ name: string; expression: string }> = [
  {
    name: 'Pulse Scale',
    expression: `phase = mapField(clock.phaseA * 6.2832, points.t)
0.75 + 0.2 * sin(points.t * 12.5664 + phase)`,
  },
  {
    name: 'Orbit Position',
    expression: `angle = points.t * 18.8496 + mapField(clock.phaseA * 6.2832, points.t)
radius = 0.2 + 0.3 * points.t
vec3(radius * cos(angle), radius * sin(angle), 0.0)`,
  },
  {
    name: 'Bidirectional Ramp',
    expression: `points.t > 0.5 ? 1.0 - points.t : points.t`,
  },
];

function loadSavedSnippets(): SavedExpressionSnippet[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is SavedExpressionSnippet => (
        typeof item === 'object'
        && item !== null
        && typeof (item as SavedExpressionSnippet).id === 'string'
        && typeof (item as SavedExpressionSnippet).name === 'string'
        && typeof (item as SavedExpressionSnippet).expression === 'string'
      ));
  } catch {
    return [];
  }
}

function persistSavedSnippets(snippets: readonly SavedExpressionSnippet[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets));
  } catch {
    // Ignore storage failures (private mode/quota).
  }
}

interface ExpressionEditorWorkbenchProps {
  readonly blockId: BlockId | null;
}

export const ExpressionEditorWorkbench: React.FC<ExpressionEditorWorkbenchProps> = observer(function ExpressionEditorWorkbench({
  blockId,
}) {
  const { patch: patchStore, debug } = useStores();
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState<SavedExpressionSnippet[]>(() => loadSavedSnippets());

  const block = blockId ? patchStore.patch.blocks.get(blockId) : undefined;
  const blockExpression = typeof block?.params.expression === 'string' ? block.params.expression : '';
  const blockLabel = block?.displayName ?? block?.type ?? blockId ?? 'None';

  useEffect(() => {
    setDraft(blockExpression);
  }, [blockExpression, blockId]);

  useEffect(() => {
    persistSavedSnippets(saved);
  }, [saved]);

  // Debounced live apply so debug chart reflects active editor state.
  // [LAW:dataflow-not-control-flow] Apply loop always runs; data equality gates writes.
  useEffect(() => {
    if (!blockId || !block) return;
    if (draft === blockExpression) return;

    const timer = window.setTimeout(() => {
      patchStore.updateBlockParams(blockId, { expression: draft });
    }, 180);

    return () => window.clearTimeout(timer);
  }, [blockId, block, draft, blockExpression, patchStore]);

  const parsedProgram = useMemo(() => extractExpressionProgram(draft), [draft]);
  const debugLabel = blockId ? `${blockLabel}.out` : null;
  const debugData = useDebugPortMiniView(blockId, blockId ? 'out' : null, debugLabel);

  const handleSaveToLibrary = useCallback(() => {
    const suggestedName = `Snippet ${saved.length + 1}`;
    const name = window.prompt('Save expression as', suggestedName);
    if (!name || !name.trim()) return;
    const entry: SavedExpressionSnippet = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: name.trim(),
      expression: draft,
    };
    setSaved(prev => [entry, ...prev]);
  }, [saved.length, draft]);

  const handleDeleteSnippet = useCallback((id: string) => {
    setSaved(prev => prev.filter(item => item.id !== id));
  }, []);

  if (!blockId || !block) {
    return (
      <div className="expression-workbench expression-workbench--empty">
        Select an `Expression` block and use the pop-out button from Inspector.
      </div>
    );
  }

  return (
    <div className="expression-workbench">
      <div className="expression-workbench__header">
        <div className="expression-workbench__title">Expression Editor</div>
        <div className="expression-workbench__subtitle">{blockLabel}</div>
      </div>

      <div className="expression-workbench__grid">
        <section className="expression-workbench__editor">
          <div className="expression-workbench__section-title">Expression</div>
          <textarea
            className="expression-workbench__textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            placeholder={[
              'angle = points.t * 18.8496 + mapField(clock.phaseA * 6.2832, points.t)',
              'radius = 0.2 + 0.3 * points.t',
              'vec3(radius * cos(angle), radius * sin(angle), 0.0)',
            ].join('\n')}
          />
          <div className="expression-workbench__meta">
            <span>{draft.length} chars</span>
            <span>{parsedProgram.assignments.length} assignments</span>
            <span>{parsedProgram.output ? 'output ready' : 'missing output'}</span>
          </div>
          {parsedProgram.warnings.length > 0 && (
            <div className="expression-workbench__warnings">
              {parsedProgram.warnings.map((warning) => (
                <div key={`${warning.line}-${warning.code}`} className="expression-workbench__warning">
                  line {warning.line}: {warning.message}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="expression-workbench__docs">
          <div className="expression-workbench__section-title">Docs</div>
          <div className="expression-workbench__docs-body">
            <p>Program format:</p>
            <p><code>name = expression</code> on any non-final line.</p>
            <p>Final non-empty line is the output expression.</p>
            <p><code>// ...</code> single-line comments are supported.</p>
            <p>Variables are pure aliases and are inlined at compile time.</p>
            <p>Supported payloads: float, vec2, vec3, vec4.</p>
          </div>
        </section>

        <section className="expression-workbench__debug">
          <div className="expression-workbench__section-title">Debug View</div>
          {!debug.enabled && (
            <div className="expression-workbench__empty">Enable Debug to inspect live output values.</div>
          )}
          {debug.enabled && !debugData && (
            <div className="expression-workbench__empty">No runtime value mapped for this expression output yet.</div>
          )}
          {debug.enabled && debugData && <DebugEdgeValueDisplay data={debugData} />}
        </section>

        <section className="expression-workbench__library">
          <div className="expression-workbench__section-title">Expression Library</div>
          <div className="expression-workbench__library-actions">
            <button type="button" onClick={handleSaveToLibrary}>Save Current</button>
          </div>
          <div className="expression-workbench__library-group">
            <div className="expression-workbench__library-heading">Examples</div>
            {EXAMPLE_LIBRARY.map((entry) => (
              <button
                key={entry.name}
                type="button"
                onClick={() => setDraft(entry.expression)}
                className="expression-workbench__library-item"
              >
                {entry.name}
              </button>
            ))}
          </div>
          <div className="expression-workbench__library-group">
            <div className="expression-workbench__library-heading">Saved</div>
            {saved.length === 0 && <div className="expression-workbench__empty">No saved snippets yet.</div>}
            {saved.map((entry) => (
              <div key={entry.id} className="expression-workbench__saved-row">
                <button
                  type="button"
                  onClick={() => setDraft(entry.expression)}
                  className="expression-workbench__library-item"
                >
                  {entry.name}
                </button>
                <button
                  type="button"
                  className="expression-workbench__delete"
                  onClick={() => handleDeleteSnippet(entry.id)}
                >
                  remove
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
});
