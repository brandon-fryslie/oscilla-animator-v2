/**
 * PayloadTesterApp — Root component for the standalone payload tester.
 *
 * Minimal stub: renderer pipeline deleted (scorched earth), rebuild in progress.
 * Layout preserved: left fixture selector, center editor, right canvas placeholder, bottom status bar.
 */

import React, { useState, useCallback } from 'react';
import { PAYLOAD_FIXTURES, type PayloadFixture } from '../render/rust/fixtures';
import { FixtureSelector } from './FixtureSelector';
import { PayloadEditor } from './PayloadEditor';

type StatusMessage =
  | { kind: 'idle' }
  | { kind: 'info'; message: string }
  | { kind: 'error'; message: string };

export const PayloadTesterApp: React.FC = () => {
  const [status, setStatus] = useState<StatusMessage>({ kind: 'idle' });
  const [json, setJson] = useState(() =>
    PAYLOAD_FIXTURES.length > 0
      ? JSON.stringify(PAYLOAD_FIXTURES[0].payload, null, 2)
      : '{}',
  );

  const handleFixtureSelect = useCallback((fixture: PayloadFixture) => {
    setJson(JSON.stringify(fixture.payload, null, 2));
    setStatus({ kind: 'idle' });
  }, []);

  const handleSubmit = useCallback((_rawJson: string) => {
    setStatus({ kind: 'info', message: 'Submit not yet implemented — renderer rebuild in progress' });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {/* Main content area */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left: fixture selector */}
        <div style={{ width: 220, minWidth: 180, borderRight: '1px solid #333', overflow: 'auto' }}>
          <FixtureSelector
            fixtures={PAYLOAD_FIXTURES}
            onSelect={handleFixtureSelect}
          />
        </div>

        {/* Center: payload editor */}
        <div style={{ flex: 1, minWidth: 300, borderRight: '1px solid #333', display: 'flex', flexDirection: 'column' }}>
          <PayloadEditor
            json={json}
            onJsonChange={setJson}
            onSubmit={handleSubmit}
            disabled={false}
          />
        </div>

        {/* Right: canvas placeholder */}
        <div style={{ flex: 1, minWidth: 200, background: '#000', position: 'relative' }}>
          <div style={overlayStyle}>Renderer not available — rebuild in progress</div>
        </div>
      </div>

      {/* Bottom: status bar */}
      <div style={{
        height: 32,
        borderTop: '1px solid #333',
        padding: '0 12px',
        display: 'flex',
        alignItems: 'center',
        fontSize: 12,
        fontFamily: '"SF Mono", Monaco, Consolas, monospace',
        background: '#141517',
      }}>
        {status.kind === 'idle' && <span style={{ color: '#888' }}>Renderer unavailable</span>}
        {status.kind === 'info' && <span style={{ color: '#ffd43b' }}>{status.message}</span>}
        {status.kind === 'error' && <span style={{ color: '#ff6b6b' }}>{status.message}</span>}
      </div>
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
  color: '#888',
  background: 'rgba(0,0,0,0.7)',
};
