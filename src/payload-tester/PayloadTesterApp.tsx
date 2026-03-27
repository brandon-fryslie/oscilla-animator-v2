/**
 * PayloadTesterApp — Root component for the standalone payload tester.
 *
 * Manages renderer lifecycle and layout. No MobX, no stores, no dockview.
 * Imports only: RustWasmWebGPURenderer, boundary-contract, fixtures.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { createWebGPURenderer, type WebGPURenderer, type GpuFault } from '../render/webgpu/RustWasmWebGPURenderer';
import { validateRawPayload } from '../render/rust/boundary-contract';
import { PAYLOAD_FIXTURES, type PayloadFixture } from '../render/rust/fixtures';
import { FixtureSelector } from './FixtureSelector';
import { PayloadEditor } from './PayloadEditor';

type RendererState =
  | { kind: 'booting' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

type SubmitResult =
  | { kind: 'idle' }
  | { kind: 'ok'; message: string }
  | { kind: 'error'; message: string };

export const PayloadTesterApp: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGPURenderer | null>(null);
  const [rendererState, setRendererState] = useState<RendererState>({ kind: 'booting' });
  const [submitResult, setSubmitResult] = useState<SubmitResult>({ kind: 'idle' });
  const [json, setJson] = useState('[]');

  // Boot renderer on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    createWebGPURenderer(canvas, {
      onGpuFault: (fault: GpuFault) => {
        console.error('GPU fault:', fault);
        setRendererState({ kind: 'error', message: `GPU fault: ${fault.message}` });
      },
    })
      .then((renderer) => {
        if (cancelled) return;
        rendererRef.current = renderer;
        setRendererState({ kind: 'ready' });
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error('Renderer boot failed:', err);
        setRendererState({ kind: 'error', message: msg });
      });

    return () => { cancelled = true; };
  }, []);

  const handleFixtureSelect = useCallback((fixture: PayloadFixture) => {
    setJson(JSON.stringify(fixture.passes, null, 2));
    setSubmitResult({ kind: 'idle' });
  }, []);

  const handleSubmit = useCallback(async (rawJson: string) => {
    const renderer = rendererRef.current;
    if (!renderer) {
      setSubmitResult({ kind: 'error', message: 'Renderer not yet ready' });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch (e) {
      setSubmitResult({ kind: 'error', message: `JSON parse error: ${e instanceof Error ? e.message : String(e)}` });
      return;
    }

    const validation = validateRawPayload(parsed);
    if (!validation.valid) {
      setSubmitResult({ kind: 'error', message: validation.errors.join('\n') });
      return;
    }

    try {
      await renderer.rebuildGpuPipelines(validation.passes);
      setSubmitResult({ kind: 'ok', message: `Submitted ${validation.passes.length} pass(es) successfully` });
    } catch (e) {
      setSubmitResult({ kind: 'error', message: `Renderer error: ${e instanceof Error ? e.message : String(e)}` });
    }
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
            disabled={rendererState.kind !== 'ready'}
          />
        </div>

        {/* Right: canvas preview */}
        <div style={{ flex: 1, minWidth: 200, background: '#000', position: 'relative' }}>
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
          {rendererState.kind === 'booting' && (
            <div style={overlayStyle}>Booting renderer...</div>
          )}
          {rendererState.kind === 'error' && (
            <div style={{ ...overlayStyle, color: '#ff6b6b' }}>{rendererState.message}</div>
          )}
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
        {rendererState.kind === 'booting' && <span style={{ color: '#ffd43b' }}>Renderer booting...</span>}
        {rendererState.kind === 'ready' && submitResult.kind === 'idle' && <span style={{ color: '#69db7c' }}>Renderer ready</span>}
        {submitResult.kind === 'ok' && <span style={{ color: '#51cf66' }}>{submitResult.message}</span>}
        {submitResult.kind === 'error' && <span style={{ color: '#ff6b6b' }}>{submitResult.message}</span>}
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
