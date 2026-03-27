/**
 * Payload Editor Panel
 *
 * A textarea for pasting/editing JSON GPU pass payloads, with a Submit button
 * that sends the payload directly to the Rust renderer via RuntimeService.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { IDockviewPanelProps } from 'dockview';
import { usePayloadSubmitter } from '../../PayloadSubmitterContext';
import { validateRawPayload } from '../../../render/rust/boundary-contract';
import { FIXTURE_SELECTED_EVENT } from './FixtureSelectorPanel';
import type { PayloadFixture } from '../../../render/rust/fixtures';

export const PayloadEditorPanel: React.FC<IDockviewPanelProps> = () => {
  const [json, setJson] = useState('[]');
  const [status, setStatus] = useState<{ kind: 'idle' } | { kind: 'ok'; message: string } | { kind: 'error'; message: string }>({ kind: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const submitPayload = usePayloadSubmitter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Listen for fixture selection events
  useEffect(() => {
    const handler = (e: Event) => {
      const fixture = (e as CustomEvent<PayloadFixture>).detail;
      const formatted = JSON.stringify(fixture.passes, null, 2);
      setJson(formatted);
      setStatus({ kind: 'idle' });
    };
    window.addEventListener(FIXTURE_SELECTED_EVENT, handler);
    return () => window.removeEventListener(FIXTURE_SELECTED_EVENT, handler);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!submitPayload) {
      setStatus({ kind: 'error', message: 'Renderer not yet active' });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      setStatus({ kind: 'error', message: `JSON parse error: ${e instanceof Error ? e.message : String(e)}` });
      return;
    }

    const validation = validateRawPayload(parsed);
    if (!validation.valid) {
      setStatus({ kind: 'error', message: validation.errors.join('\n') });
      return;
    }

    setSubmitting(true);
    try {
      await submitPayload(validation.passes);
      setStatus({ kind: 'ok', message: `Submitted ${validation.passes.length} pass(es) successfully` });
    } catch (e) {
      setStatus({ kind: 'error', message: `Renderer error: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setSubmitting(false);
    }
  }, [json, submitPayload]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1a1b1e' }}>
      <textarea
        ref={textareaRef}
        value={json}
        onChange={(e) => setJson(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        style={{
          flex: 1,
          resize: 'none',
          fontFamily: '"SF Mono", Monaco, Consolas, "Liberation Mono", monospace',
          fontSize: 12,
          lineHeight: 1.5,
          padding: 8,
          background: '#141517',
          color: '#ccc',
          border: 'none',
          borderBottom: '1px solid #333',
          outline: 'none',
          tabSize: 2,
        }}
      />
      <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={handleSubmit}
          disabled={submitting || !submitPayload}
          style={{
            padding: '4px 16px',
            background: submitting ? '#333' : '#7950F2',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: submitting ? 'wait' : 'pointer',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          {submitting ? 'Submitting...' : 'Submit (Cmd+Enter)'}
        </button>
        {status.kind !== 'idle' && (
          <span style={{
            fontSize: 11,
            color: status.kind === 'ok' ? '#51cf66' : '#ff6b6b',
            fontFamily: 'monospace',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {status.message}
          </span>
        )}
      </div>
    </div>
  );
};
