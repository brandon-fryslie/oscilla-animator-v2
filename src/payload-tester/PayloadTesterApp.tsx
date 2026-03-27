/**
 * PayloadTesterApp — Root component for the standalone payload tester.
 *
 * Manages renderer + Naga shim lifecycle and layout.
 * No MobX, no stores, no dockview.
 *
 * Pipeline: NagaModuleIR (JSON) → NagaService.compile() → WGSL → renderer
 *
 * To get visible pixels, the tester also runs a rAF loop that publishes
 * shape bank + sink table + viewport data via renderer.render().
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { createWebGPURenderer, type WebGPURenderer, type GpuFault } from '../render/webgpu/RustWasmWebGPURenderer';
import { NagaService } from '../compiler/naga-bridge';
import type { NagaModuleIR } from '../compiler/ir/naga-emitter/ScheduleNagaLowering';
import {
  PAYLOAD_FIXTURES,
  TIER_0C_MODULE_A,
  TIER_0C_MODULE_B,
  type PayloadFixture,
} from '../render/rust/fixtures';
import { buildMinimalRenderInput } from './renderInput';
import { FixtureSelector } from './FixtureSelector';
import { PayloadEditor } from './PayloadEditor';

type BootState =
  | { kind: 'booting'; message: string }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

type SubmitResult =
  | { kind: 'idle' }
  | { kind: 'ok'; message: string }
  | { kind: 'error'; message: string };

export const PayloadTesterApp: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGPURenderer | null>(null);
  const [bootState, setBootState] = useState<BootState>({ kind: 'booting', message: 'Initializing...' });
  const [submitResult, setSubmitResult] = useState<SubmitResult>({ kind: 'idle' });
  const [json, setJson] = useState('{}');
  const rafRef = useRef<number>(0);

  // Boot Naga shim + renderer, then start render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;

    (async () => {
      setBootState({ kind: 'booting', message: 'Booting Naga shim...' });
      await NagaService.boot();
      if (cancelled) return;

      setBootState({ kind: 'booting', message: 'Booting WebGPU renderer...' });
      const renderer = await createWebGPURenderer(canvas, {
        onGpuFault: (fault: GpuFault) => {
          console.error('GPU fault:', fault);
          setBootState({ kind: 'error', message: `GPU fault: ${fault.message}` });
        },
      });
      if (cancelled) return;

      rendererRef.current = renderer;
      setBootState({ kind: 'ready' });

      // Start render loop — publishes shape bank + sink table + viewport every frame
      const startMs = performance.now();
      const renderInput = buildMinimalRenderInput();
      const tick = () => {
        if (cancelled) return;
        const now = performance.now();
        renderInput.timeMs = now - startMs;
        renderInput.width = canvas.clientWidth * (window.devicePixelRatio || 1);
        renderInput.height = canvas.clientHeight * (window.devicePixelRatio || 1);
        try {
          renderer.render(renderInput);
        } catch (e) {
          console.error('Render tick error:', e);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    })().catch((err) => {
      if (cancelled) return;
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Boot failed:', err);
      setBootState({ kind: 'error', message: msg });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Track the active fixture so we can use its manifest on submit
  const activeFixtureRef = useRef<PayloadFixture | null>(null);

  const handleFixtureSelect = useCallback((fixture: PayloadFixture) => {
    activeFixtureRef.current = fixture;
    if (fixture.id === 'tier-0c-two-pass') {
      const payload = {
        description: fixture.description,
        manifest: fixture.manifest,
        modules: [
          { passId: 'sine_generate', module: TIER_0C_MODULE_A },
          { passId: 'double_values', module: TIER_0C_MODULE_B },
        ],
      };
      setJson(JSON.stringify(payload, null, 2));
    } else {
      const payload = {
        manifest: fixture.manifest,
        module: fixture.module,
      };
      setJson(JSON.stringify(payload, null, 2));
    }
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

    try {
      const obj = parsed as Record<string, unknown>;
      const manifest = obj.manifest as import('../compiler/ir/program').MemoryManifestIR | undefined;

      const modules: Array<{ passId: string; module: NagaModuleIR }> = [];

      if (isMultiModulePayload(parsed)) {
        for (const entry of (obj.modules as Array<{ passId: string; module: NagaModuleIR }>)) {
          modules.push(entry);
        }
      } else if (obj.module) {
        modules.push({ passId: 'pass_0', module: obj.module as NagaModuleIR });
      } else {
        modules.push({ passId: 'pass_0', module: parsed as NagaModuleIR });
      }

      const passes = modules.map(({ passId, module }) => {
        const { wgsl } = NagaService.compile(module, { memoryManifest: manifest });
        return {
          passId,
          stage: 'compute' as const,
          entryPoint: 'compute_main',
          wgsl,
        };
      });

      await renderer.rebuildGpuPipelines(passes);
      setSubmitResult({
        kind: 'ok',
        message: `Compiled ${passes.length} module(s) via Naga → submitted ${passes.length} pass(es) to renderer`,
      });
    } catch (e) {
      setSubmitResult({ kind: 'error', message: `${e instanceof Error ? e.message : String(e)}` });
    }
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ width: 220, minWidth: 180, borderRight: '1px solid #333', overflow: 'auto' }}>
          <FixtureSelector fixtures={PAYLOAD_FIXTURES} onSelect={handleFixtureSelect} />
        </div>
        <div style={{ flex: 1, minWidth: 300, borderRight: '1px solid #333', display: 'flex', flexDirection: 'column' }}>
          <PayloadEditor json={json} onJsonChange={setJson} onSubmit={handleSubmit} disabled={bootState.kind !== 'ready'} />
        </div>
        <div style={{ flex: 1, minWidth: 200, background: '#000', position: 'relative' }}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
          {bootState.kind === 'booting' && <div style={overlayStyle}>{bootState.message}</div>}
          {bootState.kind === 'error' && <div style={{ ...overlayStyle, color: '#ff6b6b' }}>{bootState.message}</div>}
        </div>
      </div>
      <div style={{
        height: 32, borderTop: '1px solid #333', padding: '0 12px',
        display: 'flex', alignItems: 'center', fontSize: 12,
        fontFamily: '"SF Mono", Monaco, Consolas, monospace', background: '#141517',
      }}>
        {bootState.kind === 'booting' && <span style={{ color: '#ffd43b' }}>{bootState.message}</span>}
        {bootState.kind === 'ready' && submitResult.kind === 'idle' && <span style={{ color: '#69db7c' }}>Ready (Naga shim + renderer)</span>}
        {submitResult.kind === 'ok' && <span style={{ color: '#51cf66' }}>{submitResult.message}</span>}
        {submitResult.kind === 'error' && <span style={{ color: '#ff6b6b' }}>{submitResult.message}</span>}
      </div>
    </div>
  );
};

function isMultiModulePayload(obj: unknown): boolean {
  return obj !== null && typeof obj === 'object' && 'modules' in (obj as Record<string, unknown>) && Array.isArray((obj as Record<string, unknown>).modules);
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 14, color: '#888', background: 'rgba(0,0,0,0.7)',
};
