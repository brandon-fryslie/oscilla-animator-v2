import React from 'react';
import type { BootSnapshot } from '../../../services/BootService';

interface BootGateScreenProps {
  readonly snapshot: BootSnapshot;
}

const STATUS_LABEL: Record<BootSnapshot['state'], string> = {
  initial: 'Initializing...',
  fetching: 'Downloading compiler runtime...',
  compiling: 'Compiling compiler runtime...',
  ready: 'Ready',
  error: 'Initialization failed',
};

export const BootGateScreen: React.FC<BootGateScreenProps> = ({ snapshot }) => {
  const isError = snapshot.state === 'error';
  const title = isError ? 'WASM Boot Failed' : 'Initializing Engine';
  const subtitle = STATUS_LABEL[snapshot.state];

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0d14',
        color: '#e6edf3',
        fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif",
      }}
      data-testid="boot-gate-screen"
    >
      <div
        style={{
          width: 'min(560px, 92vw)',
          border: isError ? '1px solid #7f1d1d' : '1px solid #1f2937',
          borderRadius: 12,
          padding: 24,
          background: isError ? '#210f12' : '#111827',
          boxShadow: '0 16px 42px rgba(0, 0, 0, 0.35)',
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 14, opacity: 0.9 }}>{subtitle}</div>
        {isError ? (
          <pre
            style={{
              marginTop: 16,
              fontSize: 12,
              lineHeight: 1.45,
              color: '#fecaca',
              background: '#3f161d',
              borderRadius: 8,
              padding: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {snapshot.error ?? 'Unknown boot failure'}
          </pre>
        ) : null}
      </div>
    </div>
  );
};

