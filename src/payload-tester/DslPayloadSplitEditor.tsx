/**
 * DslPayloadSplitEditor — Horizontal split pane: DSL source (top) → JSON payload (bottom).
 *
 * Top pane: Editable GPU-IR DSL source code.
 * Bottom pane: Read-only JSON output, auto-generated from the DSL.
 * Compile errors shown inline between the panes AND bubbled to parent via onCompileStatus.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { evalDsl, type DslResult } from './dsl-eval';
import type { GpuContext } from '../render/gpu-ir/compile';

export interface CompileStatus {
  readonly ok: boolean;
  readonly error?: string;
}

interface DslPayloadSplitEditorProps {
  /** Initial DSL source (set when a fixture is selected) */
  dslSource: string;
  /** Called when JSON payload changes (successful compile) */
  onJsonChange: (json: string) => void;
  /** Called when user submits (Cmd+Enter) */
  onSubmit: (json: string) => void;
  /** Called on every compile attempt — lets parent update status bar */
  onCompileStatus: (status: CompileStatus) => void;
  disabled: boolean;
  /** Canvas dimensions for viewport/scissor resolution */
  gpuCtx?: GpuContext;
}

const MONO_FONT = '"SF Mono", Monaco, Consolas, "Liberation Mono", monospace';
const DEBOUNCE_MS = 300;

export const DslPayloadSplitEditor: React.FC<DslPayloadSplitEditorProps> = ({
  dslSource: initialDsl,
  onJsonChange,
  onSubmit,
  onCompileStatus,
  disabled,
  gpuCtx,
}) => {
  const [dsl, setDsl] = useState(initialDsl);
  const [result, setResult] = useState<DslResult>(() => evalDsl(initialDsl, gpuCtx));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compile and notify parent
  const compile = useCallback((source: string): DslResult => {
    const r = evalDsl(source, gpuCtx);
    setResult(r);
    if (r.ok) {
      onJsonChange(r.json);
      onCompileStatus({ ok: true });
    } else {
      onCompileStatus({ ok: false, error: r.error });
    }
    return r;
  }, [onJsonChange, onCompileStatus, gpuCtx]);

  // When external DSL source changes (fixture selected), update both panes
  useEffect(() => {
    setDsl(initialDsl);
    compile(initialDsl);
  }, [initialDsl]); // compile is stable ref — intentionally omitted

  const handleDslChange = useCallback((newDsl: string) => {
    setDsl(newDsl);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      compile(newDsl);
    }, DEBOUNCE_MS);
  }, [compile]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const r = compile(dsl);
      if (r.ok) onSubmit(r.json);
    }
  }, [disabled, dsl, compile, onSubmit]);

  const json = result.ok ? result.json : '';
  const error = !result.ok ? result.error : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top pane label */}
      <div style={{
        padding: '4px 8px',
        fontSize: 10,
        fontFamily: MONO_FONT,
        color: '#666',
        background: '#1a1b1e',
        borderBottom: '1px solid #333',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        fontWeight: 600,
      }}>
        GPU-IR DSL
      </div>

      {/* Top pane: DSL editor */}
      <textarea
        value={dsl}
        onChange={(e) => handleDslChange(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        style={{
          flex: 1,
          resize: 'none',
          fontFamily: MONO_FONT,
          fontSize: 12,
          lineHeight: 1.5,
          padding: 8,
          background: '#141517',
          color: '#e0def4',
          border: 'none',
          outline: 'none',
          tabSize: 2,
        }}
      />

      {/* Error bar (only shown on compile error) */}
      {error && (
        <div style={{
          padding: '4px 8px',
          fontSize: 11,
          fontFamily: MONO_FONT,
          color: '#ff6b6b',
          background: '#2a1515',
          borderTop: '1px solid #4a2020',
          borderBottom: '1px solid #4a2020',
          whiteSpace: 'pre-wrap',
          maxHeight: 60,
          overflow: 'auto',
        }}>
          {error}
        </div>
      )}

      {/* Divider + bottom pane label */}
      <div style={{
        padding: '4px 8px',
        fontSize: 10,
        fontFamily: MONO_FONT,
        color: '#666',
        background: '#1a1b1e',
        borderTop: '1px solid #333',
        borderBottom: '1px solid #333',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        fontWeight: 600,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span>Payload JSON {result.ok && <span style={{ color: '#69db7c' }}>(compiled)</span>}</span>
        <button
          onClick={() => result.ok && onSubmit(result.json)}
          disabled={disabled || !result.ok}
          style={{
            padding: '2px 12px',
            background: (disabled || !result.ok) ? '#333' : '#7950F2',
            color: '#fff',
            border: 'none',
            borderRadius: 3,
            cursor: (disabled || !result.ok) ? 'not-allowed' : 'pointer',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.3,
          }}
        >
          Install + Run ({'\u2318'}{'\u23CE'})
        </button>
      </div>

      {/* Bottom pane: JSON output (read-only) */}
      <textarea
        value={json}
        readOnly
        spellCheck={false}
        style={{
          flex: 1,
          resize: 'none',
          fontFamily: MONO_FONT,
          fontSize: 11,
          lineHeight: 1.4,
          padding: 8,
          background: '#111214',
          color: '#888',
          border: 'none',
          outline: 'none',
          tabSize: 2,
        }}
      />
    </div>
  );
};
