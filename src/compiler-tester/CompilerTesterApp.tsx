/**
 * CompilerTesterApp — Root component for the standalone C1 compiler tester.
 *
 * Boots the Rust WASM renderer in a dedicated worker, compiles NormalizedPatch
 * fixtures through compileC1FromNormalized(), sends the resulting
 * PipelineInstallPayload JSON to the worker via INSTALL_PIPELINE, and displays
 * the canvas output.
 *
 * Bypasses the frontend entirely — fixtures build NormalizedPatch directly.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { COMPILER_TESTER_FIXTURES, type CompilerFixture } from './fixtures';
import { HEARTBEAT_BUFFER_BYTES } from '../render/rust/runtime-input-layout';
import type {
  RustRendererWorkerOutboundMessage,
  RustRendererBootstrapMessage,
  RustRendererInstallPipelineMessage,
} from '../render/rust/worker-protocol';
import { compileC1FromNormalized } from '../compiler/backend-v2';

// ─── Types ──────────────────────────────────────────────────────────────────

type RendererStatus =
  | { kind: 'idle' }
  | { kind: 'booting'; message: string }
  | { kind: 'ready'; message: string }
  | { kind: 'info'; message: string }
  | { kind: 'error'; message: string };

type CompileStatus =
  | { ok: true }
  | { ok: false; error: string };

// ─── Helpers ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'oscilla-compiler-tester-fixture';

function getQueryParams(): { fixture?: string; canvasOnly: boolean } {
  const params = new URLSearchParams(window.location.search);
  return {
    fixture: params.get('fixture') ?? undefined,
    canvasOnly: params.has('canvas-only'),
  };
}

function getInitialFixture(): CompilerFixture {
  const qp = getQueryParams();
  if (qp.fixture) {
    const found = COMPILER_TESTER_FIXTURES.find(f => f.id === qp.fixture);
    if (found) return found;
  }
  try {
    const savedId = sessionStorage.getItem(STORAGE_KEY);
    if (savedId) {
      const found = COMPILER_TESTER_FIXTURES.find(f => f.id === savedId);
      if (found) return found;
    }
  } catch { /* sessionStorage unavailable */ }
  return COMPILER_TESTER_FIXTURES[0];
}

// [LAW:single-enforcer] One compilation path for all fixture selections
function compileFixture(fixture: CompilerFixture): { json: string; error?: string } {
  const patch = fixture.makeNormalizedPatch();
  const result = compileC1FromNormalized(patch);
  if (result.kind === 'error') {
    return { json: '', error: result.errors.join('; ') };
  }
  return { json: JSON.stringify(result.payload) };
}

// ─── Component ──────────────────────────────────────────────────────────────

export const CompilerTesterApp: React.FC = () => {
  const [rendererStatus, setRendererStatus] = useState<RendererStatus>({ kind: 'idle' });
  const [compileStatus, setCompileStatus] = useState<CompileStatus>({ ok: true });
  const [selectedId, setSelectedId] = useState(() => getInitialFixture().id);
  const { canvasOnly } = getQueryParams();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const latestJsonRef = useRef('');
  const rendererReadyRef = useRef(false);
  const pendingInstallRef = useRef<string | null>(null);
  const rendererReady = rendererStatus.kind === 'ready' || rendererStatus.kind === 'info';

  // Compile initial fixture eagerly and queue for install
  const initialCompiled = useRef<string | null>(null);
  if (initialCompiled.current === null) {
    const result = compileFixture(getInitialFixture());
    if (!result.error) {
      initialCompiled.current = result.json;
      pendingInstallRef.current = result.json;
    } else {
      initialCompiled.current = ''; // Mark as attempted
    }
  }

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
            setRendererStatus((prev) =>
              prev.kind === 'error' && prev.message.includes('GPU fault')
                ? prev
                : { kind: 'error', message: errorMsg },
            );
            break;
          }
          case 'FATAL_ERROR':
            setRendererStatus((prev) =>
              prev.kind === 'error' && prev.message.includes('GPU fault')
                ? prev
                : { kind: 'error', message: `Renderer: ${msg.message}` },
            );
            break;
          case 'ENGINE_ERROR':
            setRendererStatus((prev) =>
              prev.kind === 'error' && prev.message.includes('GPU fault')
                ? prev
                : { kind: 'error', message: `GPU fault [${msg.source}]: ${msg.message} (${msg.location})` },
            );
            break;
        }
      };

      worker.onerror = (err) => {
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

  const handleFixtureSelect = useCallback((fixture: CompilerFixture) => {
    try { sessionStorage.setItem(STORAGE_KEY, fixture.id); } catch { /* ignore */ }
    setSelectedId(fixture.id);

    const result = compileFixture(fixture);
    if (result.error) {
      setCompileStatus({ ok: false, error: result.error });
      return;
    }
    setCompileStatus({ ok: true });
    latestJsonRef.current = result.json;
    installPipeline(result.json);
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
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left: fixture selector */}
        <div style={{
          width: 220, minWidth: 180, borderRight: '1px solid #333',
          overflow: 'auto', background: '#1a1b1e', padding: '8px 0',
        }}>
          <div style={{
            padding: '4px 12px 8px', fontSize: 11, fontWeight: 600,
            color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            C1 Fixtures
          </div>
          {COMPILER_TESTER_FIXTURES.map((fixture) => (
            <button
              key={fixture.id}
              onClick={() => handleFixtureSelect(fixture)}
              title={fixture.description}
              style={{
                display: 'block', width: '100%', padding: '6px 12px',
                border: 'none',
                background: fixture.id === selectedId ? '#2c2e33' : 'transparent',
                color: fixture.id === selectedId ? '#fff' : '#ccc',
                textAlign: 'left', cursor: 'pointer', fontSize: 13,
                fontFamily: '"SF Mono", Monaco, Consolas, monospace',
              }}
            >
              {fixture.label}
            </button>
          ))}
        </div>

        {/* Right: canvas */}
        <div style={{ flex: 1, minWidth: 200, background: '#000', position: 'relative' }}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>
      </div>

      {/* Bottom status bar */}
      <div style={{
        height: 32, borderTop: '1px solid #333', padding: '0 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 12, fontFamily: '"SF Mono", Monaco, Consolas, monospace',
        background: '#141517', gap: 16,
      }}>
        <span style={{ color: compileStatus.ok ? '#69db7c' : '#ff6b6b', flexShrink: 0 }}>
          {compileStatus.ok ? 'C1 OK' : `C1: ${compileStatus.error}`}
        </span>
        <span style={{
          color: rendererStatus.kind === 'error' ? '#ff6b6b'
            : rendererStatus.kind === 'ready' ? '#69db7c'
            : rendererStatus.kind === 'info' ? '#ffd43b' : '#888',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
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
