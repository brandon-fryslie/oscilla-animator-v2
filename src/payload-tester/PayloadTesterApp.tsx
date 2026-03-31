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
  const firstFixture = PAYLOAD_FIXTURES[0] ?? null;
  const [status, setStatus] = useState<StatusMessage>({ kind: 'idle' });
  const [json, setJson] = useState(() =>
    firstFixture
      ? JSON.stringify(firstFixture.payload, null, 2)
      : '{}',
  );
  const [installedFixtureId, setInstalledFixtureId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const selectedFixtureIdRef = useRef<string | null>(firstFixture?.id ?? null);
  const pendingInstallFixtureIdRef = useRef<string | null>(null);
  const pendingAutoSubmitJsonRef = useRef<string | null>(null);
  const lastSubmittedJsonRef = useRef<string>(json);
  const rendererReady = status.kind === 'ready' || status.kind === 'info';

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
            setInstalledFixtureId(pendingInstallFixtureIdRef.current);
            // Count passes from the current payload
            let passCount = 0;
            try {
              const payload = JSON.parse(lastSubmittedJsonRef.current);
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

  const handleSubmit = useCallback((rawJson: string) => {
    pendingAutoSubmitJsonRef.current = null;
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
    pendingInstallFixtureIdRef.current = selectedFixtureIdRef.current;
    lastSubmittedJsonRef.current = rawJson;
    worker.postMessage(installMsg);
    setStatus({ kind: 'info', message: 'Installing pipeline...' });
  }, []);

  const handleFixtureSelect = useCallback((fixture: PayloadFixture) => {
    // [LAW:one-source-of-truth] Serialize once and reuse the exact payload JSON
    // for both editor display and install submission.
    const fixtureJson = JSON.stringify(fixture.payload, null, 2);
    selectedFixtureIdRef.current = fixture.id;
    setJson(fixtureJson);
    pendingAutoSubmitJsonRef.current = fixtureJson;
    if (rendererReady) {
      handleSubmit(fixtureJson);
      return;
    }
    setStatus({ kind: 'info', message: 'Fixture queued until renderer is ready...' });
  }, [handleSubmit, rendererReady]);

  useEffect(() => {
    if (!rendererReady) {
      return;
    }
    const queuedJson = pendingAutoSubmitJsonRef.current;
    if (!queuedJson) {
      return;
    }
    handleSubmit(queuedJson);
  }, [handleSubmit, rendererReady]);

  useEffect(() => {
    if (!rendererReady || installedFixtureId !== 'audio-reactive') {
      return;
    }
    const worker = workerRef.current;
    if (!worker) {
      return;
    }

    let phase = 0;
    const emitFrame = () => {
      // [LAW:dataflow-not-control-flow] Stream updates always execute on a
      // fixed cadence; waveform variation is encoded in the payload values.
      const bins = new Float32Array(128);
      for (let i = 0; i < bins.length; i += 1) {
        const t = phase + i * 0.09;
        const waveA = (Math.sin(t) + 1) * 0.5;
        const waveB = (Math.cos(t * 0.37) + 1) * 0.5;
        bins[i] = Math.min(1, waveA * 0.65 + waveB * 0.35);
      }
      worker.postMessage(
        { type: 'UPDATE_DATA_STREAM', streamId: 'fft', data: bins.buffer },
        [bins.buffer],
      );
      phase += 0.08;
    };

    emitFrame();
    const timer = window.setInterval(emitFrame, 50);
    return () => {
      window.clearInterval(timer);
    };
  }, [installedFixtureId, rendererReady]);

  useEffect(() => {
    if (!rendererReady) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const postResize = () => {
      const worker = workerRef.current;
      const targetCanvas = canvasRef.current;
      if (!worker || !targetCanvas) {
        return;
      }
      const rect = targetCanvas.getBoundingClientRect();
      const payload = {
        width: Math.max(1, Math.floor(rect.width || targetCanvas.width || 1)),
        height: Math.max(1, Math.floor(rect.height || targetCanvas.height || 1)),
      };
      worker.postMessage({
        type: 'ENVIRONMENT_RESIZE',
        payloadJson: JSON.stringify(payload),
      });
    };

    let rafId: number | null = null;
    const scheduleResize = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        rafId = null;
        postResize();
      });
    };

    postResize();
    window.addEventListener('resize', scheduleResize);
    const observer = new ResizeObserver(scheduleResize);
    observer.observe(canvas);

    return () => {
      window.removeEventListener('resize', scheduleResize);
      observer.disconnect();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [rendererReady, installedFixtureId]);

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
