/**
 * PayloadTesterApp — Root component for the standalone payload tester.
 *
 * Boots the Rust WASM renderer in a dedicated worker, connects the
 * DslPayloadSplitEditor to INSTALL_PIPELINE, and displays the canvas output.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { PAYLOAD_FIXTURES, type PayloadFixture } from '../render/rust/fixtures';
import { FixtureSelector } from './FixtureSelector';
import { DslPayloadSplitEditor, type CompileStatus } from './DslPayloadSplitEditor';
import { HEARTBEAT_BUFFER_BYTES } from '../render/rust/runtime-input-layout';
import type {
  RustRendererWorkerOutboundMessage,
  RustRendererBootstrapMessage,
  RustRendererInstallPipelineMessage,
} from '../render/rust/worker-protocol';

type RendererStatus =
  | { kind: 'idle' }
  | { kind: 'booting'; message: string }
  | { kind: 'ready'; message: string }
  | { kind: 'info'; message: string }
  | { kind: 'error'; message: string };

const STORAGE_KEY = 'oscilla-payload-tester-fixture';

function getQueryParams(): { fixture?: string; canvasOnly: boolean } {
  const params = new URLSearchParams(window.location.search);
  return {
    fixture: params.get('fixture') ?? undefined,
    canvasOnly: params.has('canvas-only'),
  };
}

function getInitialFixture(): PayloadFixture {
  // Query param takes priority over sessionStorage
  const qp = getQueryParams();
  if (qp.fixture) {
    const found = PAYLOAD_FIXTURES.find(f => f.id === qp.fixture);
    if (found) return found;
  }
  try {
    const savedId = sessionStorage.getItem(STORAGE_KEY);
    if (savedId) {
      const found = PAYLOAD_FIXTURES.find(f => f.id === savedId);
      if (found) return found;
    }
  } catch { /* sessionStorage unavailable */ }
  return PAYLOAD_FIXTURES[0];
}

export const PayloadTesterApp: React.FC = () => {
  const [rendererStatus, setRendererStatus] = useState<RendererStatus>({ kind: 'idle' });
  const [dslStatus, setDslStatus] = useState<CompileStatus>({ ok: true });
  const { canvasOnly } = getQueryParams();
  const initialFixture = getInitialFixture();
  const [dslSource, setDslSource] = useState(
    initialFixture.dslSource ?? JSON.stringify(initialFixture.payload ?? {}, null, 2),
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const latestJsonRef = useRef('');
  const rendererReadyRef = useRef(false);
  const pendingInstallRef = useRef<string | null>(
    JSON.stringify(initialFixture.payload, null, 2),
  );
  const rendererReady = rendererStatus.kind === 'ready' || rendererStatus.kind === 'info';

  useEffect(() => {
    rendererReadyRef.current = rendererReady;
    // Expose status for CDP screenshot script
    (window as any).__rendererStatus = rendererStatus.kind === 'error'
      ? `GPU fault: ${rendererStatus.message}`
      : rendererStatus.kind === 'info'
        ? rendererStatus.message
        : rendererStatus.kind === 'ready'
          ? 'Renderer ready'
          : '';
  }, [rendererReady, rendererStatus]);

  const installPipeline = useCallback((payloadJson: string) => {
    const worker = workerRef.current;
    latestJsonRef.current = payloadJson;

    // [LAW:one-source-of-truth] All install requests share one dispatch path
    if (!worker || !rendererReadyRef.current) {
      pendingInstallRef.current = payloadJson;
      setRendererStatus({ kind: 'info', message: 'Renderer not ready yet. Queued install request.' });
      return;
    }

    const installMsg: RustRendererInstallPipelineMessage = {
      type: 'INSTALL_PIPELINE',
      payloadJson,
    };
    worker.postMessage(installMsg);
    setRendererStatus({ kind: 'info', message: 'Installing pipeline...' });
  }, []);

  // Boot the renderer worker on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let worker: Worker | null = null;
    let aborted = false;

    async function boot() {
      if (!canvas) return;
      setRendererStatus({ kind: 'booting', message: 'Renderer booting...' });

      const wasmModule = await import('../render/wasm/pkg/oscilla_rust_renderer_bg.wasm?url');
      const wasmUrl = (wasmModule as { default: string }).default;
      const wasmResponse = await fetch(wasmUrl);
      const wasmBytes = await wasmResponse.arrayBuffer();

      if (aborted) return;

      const offscreen = canvas.transferControlToOffscreen();
      const sharedHeartbeat = new SharedArrayBuffer(HEARTBEAT_BUFFER_BYTES);

      worker = new Worker(
        new URL('../render/rust/engine.worker.ts', import.meta.url),
        { type: 'module' },
      );
      workerRef.current = worker;

      worker.onmessage = (event: MessageEvent<RustRendererWorkerOutboundMessage>) => {
        const msg = event.data;
        if (!msg || typeof msg !== 'object' || !('type' in msg)) return;

        switch (msg.type) {
          case 'BOOTSTRAP_SUCCESS':
            rendererReadyRef.current = true;
            setRendererStatus({ kind: 'ready', message: 'Renderer ready' });
            if (pendingInstallRef.current) {
              const payloadJson = pendingInstallRef.current;
              pendingInstallRef.current = null;
              if (worker) {
                worker.postMessage({
                  type: 'INSTALL_PIPELINE',
                  payloadJson,
                } satisfies RustRendererInstallPipelineMessage);
                setRendererStatus({ kind: 'info', message: 'Installing queued pipeline...' });
              }
            }
            break;
          case 'INSTALL_PIPELINE_SUCCESS': {
            let passCount = 0;
            try {
              const payload = JSON.parse(latestJsonRef.current);
              passCount = Array.isArray(payload?.roster) ? payload.roster.length : 0;
            } catch { /* ignore */ }
            setRendererStatus({
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
            // Don't overwrite a GPU fault (RUST_PANIC) — the catch block only has
            // "Unreachable code" while the panic hook has the real message.
            setRendererStatus((prev) =>
              prev.kind === 'error' && prev.message.includes('GPU fault')
                ? prev
                : { kind: 'error', message: errorMsg },
            );
            break;
          }
          case 'FATAL_ERROR':
            // Don't overwrite a specific ENGINE_ERROR with the generic "Unreachable code"
            // RuntimeError that follows every WASM panic.
            setRendererStatus((prev) =>
              prev.kind === 'error' && prev.message.includes('GPU fault')
                ? prev
                : { kind: 'error', message: `Renderer: ${msg.message}` },
            );
            break;
          case 'ENGINE_ERROR':
            console.error(`[GPU fault] [${msg.source}] ${msg.message} (${msg.location})`);
            // Keep the FIRST engine error — subsequent panics (e.g. "RefCell already borrowed")
            // are cascade failures from the original panic leaving a borrow unreleased.
            setRendererStatus((prev) =>
              prev.kind === 'error' && prev.message.includes('GPU fault')
                ? prev
                : { kind: 'error', message: `GPU fault [${msg.source}]: ${msg.message} (${msg.location})` },
            );
            break;
        }
      };

      worker.onerror = (err) => {
        console.error('[Worker error]', err.message);
        // Don't overwrite ENGINE_ERROR with generic worker error either
        setRendererStatus((prev) =>
          prev.kind === 'error' && prev.message.includes('GPU fault')
            ? prev
            : { kind: 'error', message: `Worker error: ${err.message}` },
        );
      };

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
      setRendererStatus({
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
    try { sessionStorage.setItem(STORAGE_KEY, fixture.id); } catch { /* ignore */ }
    const source = fixture.dslSource ?? JSON.stringify(fixture.payload, null, 2);
    setDslSource(source);

    // Also immediately install the fixture payload (don't wait for DSL compile)
    const fixtureJson = JSON.stringify(fixture.payload, null, 2);
    latestJsonRef.current = fixtureJson;
    installPipeline(fixtureJson);
  }, [installPipeline]);

  const handleJsonChange = useCallback((json: string) => {
    latestJsonRef.current = json;
  }, []);

  const handleCompileStatus = useCallback((cs: CompileStatus) => {
    setDslStatus(cs);
  }, []);

  const handleSubmit = useCallback((rawJson: string) => {
    try {
      JSON.parse(rawJson);
    } catch (e) {
      setRendererStatus({ kind: 'error', message: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` });
      return;
    }
    latestJsonRef.current = rawJson;
    installPipeline(rawJson);
  }, [installPipeline]);

  if (canvasOnly) {
    return (
      <div style={{ width: '100%', height: '100%', background: '#000' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {/* Main content area */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left: fixture selector */}
        <div style={{ width: 220, minWidth: 180, borderRight: '1px solid #333', overflow: 'auto' }}>
          <FixtureSelector
            fixtures={PAYLOAD_FIXTURES}
            initialSelectedId={initialFixture.id}
            onSelect={handleFixtureSelect}
          />
        </div>

        {/* Center: DSL + JSON split editor */}
        <div style={{ flex: 1, minWidth: 300, borderRight: '1px solid #333', display: 'flex', flexDirection: 'column' }}>
          <DslPayloadSplitEditor
            dslSource={dslSource}
            onJsonChange={handleJsonChange}
            onSubmit={handleSubmit}
            onCompileStatus={handleCompileStatus}
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

      {/* Bottom: status bar — DSL status (left) + Renderer status (right) */}
      <div style={{
        height: 32,
        borderTop: '1px solid #333',
        padding: '0 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 12,
        fontFamily: '"SF Mono", Monaco, Consolas, monospace',
        background: '#141517',
        gap: 16,
      }}>
        {/* Left: DSL compile status */}
        <span style={{ color: dslStatus.ok ? '#69db7c' : '#ff6b6b', flexShrink: 0 }}>
          {dslStatus.ok ? 'DSL ✓' : `DSL ✗ ${dslStatus.error ?? ''}`}
        </span>

        {/* Right: Renderer status */}
        <span style={{
          color:
            rendererStatus.kind === 'error' ? '#ff6b6b' :
            rendererStatus.kind === 'ready' ? '#69db7c' :
            rendererStatus.kind === 'info' ? '#ffd43b' :
            '#888',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {rendererStatus.kind === 'idle' && 'Renderer: initializing...'}
          {rendererStatus.kind === 'booting' && `Renderer: ${rendererStatus.message}`}
          {rendererStatus.kind === 'ready' && `Renderer: ${rendererStatus.message}`}
          {rendererStatus.kind === 'info' && `Renderer: ${rendererStatus.message}`}
          {rendererStatus.kind === 'error' && `Renderer: ${rendererStatus.message}`}
        </span>
      </div>
    </div>
  );
};
