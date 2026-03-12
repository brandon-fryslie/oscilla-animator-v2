import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { observer } from 'mobx-react-lite';
import { formatWgslWithLineNumbers } from '../../../render/shader-debug';
import { shaderInspector } from '../../../services/ShaderInspectorService';
import { useStores } from '../../../stores';

interface EngineErrorDetail {
  readonly kind: 'engineError';
  readonly source: string;
  readonly message: string;
  readonly location: string;
  readonly fatal: boolean;
}

function isEngineErrorDetail(value: unknown): value is EngineErrorDetail {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<EngineErrorDetail>;
  return (
    candidate.kind === 'engineError'
    && typeof candidate.source === 'string'
    && typeof candidate.message === 'string'
    && typeof candidate.location === 'string'
    && typeof candidate.fatal === 'boolean'
  );
}

const ShaderInspectorPanel: React.FC = () => {
  const snapshot = useSyncExternalStore(
    (listener) => shaderInspector.subscribe(listener),
    () => shaderInspector.getSnapshot(),
    () => shaderInspector.getSnapshot(),
  );
  const [open, setOpen] = useState(false);
  const [activePassId, setActivePassId] = useState<string | null>(null);

  useEffect(() => {
    if (!snapshot || snapshot.passes.length === 0) {
      setActivePassId(null);
      return;
    }
    if (!activePassId || !snapshot.passes.some((pass) => pass.passId === activePassId)) {
      setActivePassId(snapshot.passes[0]?.passId ?? null);
    }
  }, [snapshot, activePassId]);

  if (!snapshot || snapshot.passes.length === 0) {
    return null;
  }

  const activePass = snapshot.passes.find((pass) => pass.passId === activePassId) ?? snapshot.passes[0]!;
  const numberedWgsl = formatWgslWithLineNumbers(activePass.wgsl);

  return (
    <div
      style={{
        position: 'fixed',
        top: 56,
        left: 12,
        width: open ? '42vw' : 'auto',
        maxWidth: '720px',
        minWidth: open ? '360px' : '0',
        zIndex: 50,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          border: '1px solid #334155',
          background: '#020617',
          color: '#93c5fd',
          padding: '6px 10px',
          borderRadius: 8,
          fontFamily: 'monospace',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        {open ? 'Hide Shader Inspector' : 'Show Shader Inspector'}
      </button>
      {open ? (
        <div
          style={{
            marginTop: 8,
            border: '1px solid #334155',
            borderRadius: 10,
            overflow: 'hidden',
            background: '#020617',
            boxShadow: '0 12px 24px rgba(0, 0, 0, 0.45)',
          }}
        >
          <div style={{ display: 'flex', borderBottom: '1px solid #1e293b', flexWrap: 'wrap' }}>
            {snapshot.passes.map((pass) => (
              <button
                key={pass.passId}
                type="button"
                onClick={() => setActivePassId(pass.passId)}
                style={{
                  border: 'none',
                  borderRight: '1px solid #1e293b',
                  background: pass.passId === activePass.passId ? '#0f172a' : 'transparent',
                  color: pass.passId === activePass.passId ? '#f8fafc' : '#94a3b8',
                  padding: '8px 10px',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {pass.passId}
              </button>
            ))}
          </div>
          <pre
            style={{
              margin: 0,
              padding: 10,
              height: '42vh',
              overflow: 'auto',
              color: '#86efac',
              fontSize: 11,
              lineHeight: 1.35,
              whiteSpace: 'pre',
            }}
          >
            {numberedWgsl}
          </pre>
        </div>
      ) : null}
    </div>
  );
};

const EngineErrorPanel: React.FC = observer(() => {
  const { diagnostics } = useStores();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const visibleErrors = useMemo(() => {
    const entries: Array<{ id: string; timestamp: number; payload: EngineErrorDetail }> = [];
    for (const log of diagnostics.logs) {
      if (dismissedIds.has(log.id)) {
        continue;
      }
      if (!isEngineErrorDetail(log.data)) {
        continue;
      }
      entries.push({
        id: log.id,
        timestamp: log.timestamp,
        payload: log.data,
      });
    }
    return entries;
  }, [diagnostics.logs, dismissedIds]);

  if (visibleErrors.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        right: 12,
        bottom: 12,
        width: 'min(560px, 92vw)',
        maxHeight: '48vh',
        zIndex: 60,
        border: '1px solid #7f1d1d',
        borderRadius: 10,
        background: '#1f0b0b',
        color: '#ffe4e6',
        fontFamily: 'monospace',
        fontSize: 12,
        boxShadow: '0 12px 24px rgba(0, 0, 0, 0.45)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '8px 10px',
          borderBottom: '1px solid #7f1d1d',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <strong>Engine Fault Detected</strong>
        <button
          type="button"
          onClick={() => {
            setDismissedIds((prev) => {
              const next = new Set(prev);
              for (const error of visibleErrors) {
                next.add(error.id);
              }
              return next;
            });
          }}
          style={{
            border: '1px solid #b91c1c',
            background: '#7f1d1d',
            color: '#ffe4e6',
            borderRadius: 6,
            padding: '3px 8px',
            fontFamily: 'monospace',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          Dismiss
        </button>
      </div>
      <div style={{ maxHeight: '42vh', overflow: 'auto', padding: 10 }}>
        {visibleErrors.map((entry) => (
          <div
            key={entry.id}
            style={{
              borderBottom: '1px solid rgba(248, 113, 113, 0.3)',
              paddingBottom: 8,
              marginBottom: 8,
            }}
          >
            <div style={{ color: entry.payload.fatal ? '#fda4af' : '#fcd34d' }}>
              [{entry.payload.source}] {entry.payload.fatal ? 'fatal' : 'recoverable'}
            </div>
            <div style={{ color: '#cbd5e1' }}>at {entry.payload.location}</div>
            <pre style={{ margin: '6px 0 0 0', whiteSpace: 'pre-wrap', color: '#f8fafc' }}>
              {entry.payload.message}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
});

export const EngineDebugOverlay: React.FC = () => (
  <>
    <ShaderInspectorPanel />
    <EngineErrorPanel />
  </>
);
