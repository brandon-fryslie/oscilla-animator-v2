/**
 * PayloadTesterApp — Root component for the standalone payload tester.
 *
 * Boots the Rust WASM renderer in a dedicated worker, connects the PayloadEditor
 * to INSTALL_PIPELINE, and displays the canvas output.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { PAYLOAD_FIXTURES, type PayloadFixture } from '../render/rust/fixtures';
import { FixtureSelector } from './FixtureSelector';
import { PayloadEditor } from './PayloadEditor';
import { HEARTBEAT_BUFFER_BYTES } from '../render/rust/runtime-input-layout';
import type {
  RustRendererWorkerOutboundMessage,
  RustRendererBootstrapMessage,
  RustRendererInstallPipelineMessage,
} from '../render/rust/worker-protocol';

type StatusMessage =
  | { kind: 'idle' }
  | { kind: 'booting'; message: string }
  | { kind: 'ready'; message: string }
  | { kind: 'info'; message: string }
  | { kind: 'error'; message: string };

export const PayloadTesterApp: React.FC = () => {
  const [status, setStatus] = useState<StatusMessage>({ kind: 'idle' });
  const [json, setJson] = useState(() =>
    PAYLOAD_FIXTURES.length > 0
      ? JSON.stringify(PAYLOAD_FIXTURES[0].payload, null, 2)
      : '{}',
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const latestJsonRef = useRef(json);
  const rendererReady = status.kind === 'ready' || status.kind === 'info';

  useEffect(() => {
    latestJsonRef.current = json;
  }, [json]);

  // Boot the renderer worker on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let worker: Worker | null = null;
    let aborted = false;

    async function boot() {
      if (!canvas) return;
      setStatus({ kind: 'booting', message: 'Renderer booting...' });

      // Fetch WASM bytes
      const wasmModule = await import('../render/wasm/pkg/oscilla_rust_renderer_bg.wasm?url');
      const wasmUrl = (wasmModule as { default: string }).default;
      const wasmResponse = await fetch(wasmUrl);
      const wasmBytes = await wasmResponse.arrayBuffer();

      if (aborted) return;

      // Transfer canvas to OffscreenCanvas
      const offscreen = canvas.transferControlToOffscreen();

      // Create shared heartbeat buffer
      const sharedHeartbeat = new SharedArrayBuffer(HEARTBEAT_BUFFER_BYTES);

      // Spawn worker
      worker = new Worker(
        new URL('../render/rust/engine.worker.ts', import.meta.url),
        { type: 'module' },
      );
      workerRef.current = worker;

      // Listen for outbound messages
      worker.onmessage = (event: MessageEvent<RustRendererWorkerOutboundMessage>) => {
        const msg = event.data;
        if (!msg || typeof msg !== 'object' || !('type' in msg)) return;

        switch (msg.type) {
          case 'BOOTSTRAP_SUCCESS':
            setStatus({ kind: 'ready', message: 'Renderer ready' });
            break;
          case 'INSTALL_PIPELINE_SUCCESS': {
            // Count passes from the current payload
            let passCount = 0;
            try {
              const payload = JSON.parse(latestJsonRef.current);
              passCount = Array.isArray(payload?.roster) ? payload.roster.length : 0;
            } catch { /* ignore */ }
            setStatus({
              kind: 'info',
              message: `Installed ${passCount} pass(es) and started frame publication`,
            });
            break;
          }
          case 'INSTALL_PIPELINE_FAILURE': {
            let errorMsg = 'Pipeline install failed';
            try {
              const receipt = JSON.parse(msg.receiptJson) as {
                diagnostics?: { message: string }[];
              };
              if (receipt.diagnostics?.length) {
                errorMsg = receipt.diagnostics.map((d) => d.message).join('; ');
              }
            } catch { /* ignore */ }
            setStatus({ kind: 'error', message: errorMsg });
            break;
          }
          case 'FATAL_ERROR':
            setStatus({
              kind: 'error',
              message: `Renderer boot failed: ${msg.message}`,
            });
            break;
          case 'ENGINE_ERROR':
            setStatus({
              kind: 'error',
              message: `GPU fault: ${msg.message}`,
            });
            break;
        }
      };

      worker.onerror = (err) => {
        setStatus({ kind: 'error', message: `Worker error: ${err.message}` });
      };

      // Send bootstrap message
      const bootstrapMsg: RustRendererBootstrapMessage = {
        type: 'BOOTSTRAP',
        canvas: offscreen,
        rendererWasmBytes: wasmBytes,
        sharedHeartbeat,
        config: { debugReadbackHz: 0 },
        initialWidth: canvas?.clientWidth || 640,
        initialHeight: canvas?.clientHeight || 480,
      };
      worker.postMessage(bootstrapMsg, [offscreen, wasmBytes]);
    }

    boot().catch((err) => {
      setStatus({
        kind: 'error',
        message: `Renderer boot failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    });

    return () => {
      aborted = true;
      if (worker) {
        worker.postMessage({ type: 'SHUTDOWN' });
        worker.terminate();
      }
      workerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFixtureSelect = useCallback((fixture: PayloadFixture) => {
    setJson(JSON.stringify(fixture.payload, null, 2));
  }, []);

  const handleSubmit = useCallback((rawJson: string) => {
    const worker = workerRef.current;
    if (!worker) {
      setStatus({ kind: 'error', message: 'Worker not initialized' });
      return;
    }

    // Validate JSON
    try {
      JSON.parse(rawJson);
    } catch (e) {
      setStatus({ kind: 'error', message: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` });
      return;
    }

    const installMsg: RustRendererInstallPipelineMessage = {
      type: 'INSTALL_PIPELINE',
      payloadJson: rawJson,
    };
    worker.postMessage(installMsg);
    setStatus({ kind: 'info', message: 'Installing pipeline...' });
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
            disabled={!rendererReady}
            submitLabel="Install + Run"
          />
        </div>

        {/* Right: canvas */}
        <div style={{ flex: 1, minWidth: 200, background: '#000', position: 'relative' }}>
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
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
        {status.kind === 'idle' && <span style={{ color: '#888' }}>Initializing...</span>}
        {status.kind === 'booting' && <span style={{ color: '#ffd43b' }}>{status.message}</span>}
        {status.kind === 'ready' && <span style={{ color: '#69db7c' }}>{status.message}</span>}
        {status.kind === 'info' && <span style={{ color: '#ffd43b' }}>{status.message}</span>}
        {status.kind === 'error' && <span style={{ color: '#ff6b6b' }}>{status.message}</span>}
      </div>
    </div>
  );
};
