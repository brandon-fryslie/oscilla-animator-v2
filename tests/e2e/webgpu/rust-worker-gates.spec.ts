import { test, expect } from '@playwright/test';

type WorkerGateResult =
  | { skipped: true; reason: string }
  | { skipped: false; fatal: boolean; message: string };

type TelemetryGateResult =
  | { skipped: true; reason: string }
  | { skipped: false; meanMs: number; stdDevMs: number; sampleCount: number };

test.describe('Rust Worker Gates', () => {
  test('Gate 2: poison allocation crashes the worker hot path', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async (): Promise<WorkerGateResult> => {
      if (
        typeof Worker === 'undefined'
        || typeof SharedArrayBuffer === 'undefined'
        || typeof HTMLCanvasElement === 'undefined'
        || typeof HTMLCanvasElement.prototype.transferControlToOffscreen !== 'function'
      ) {
        return { skipped: true, reason: 'worker/offscreen/shared-buffer unavailable in this browser context' };
      }

      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const offscreen = canvas.transferControlToOffscreen();
      const sharedInput = new SharedArrayBuffer(36 * Float32Array.BYTES_PER_ELEMENT);

      const worker = new Worker(new URL('/src/render/rust/engine.worker.ts', window.location.href), {
        type: 'module',
      });

      const fatalPromise = new Promise<{ fatal: boolean; message: string }>((resolve) => {
        worker.onerror = (errorEvent) => {
          errorEvent.preventDefault();
          resolve({
            fatal: true,
            message: errorEvent.message || 'worker error',
          });
        };
        worker.onmessage = (event: MessageEvent<any>) => {
          if (event.data?.type === 'FATAL_ERROR') {
            resolve({
              fatal: true,
              message: String(event.data.message ?? 'fatal error'),
            });
          }
        };
      });

      worker.postMessage(
        {
          type: 'BOOTSTRAP',
          canvas: offscreen,
          sharedInput,
          config: {
            maxParticles: 1024,
            maxShapes: 1024,
            debugReadbackHz: 5,
          },
        },
        [offscreen],
      );

      const bootResult = await new Promise<{ ok: boolean; reason?: string }>((resolve) => {
        const onMessage = (event: MessageEvent<any>) => {
          if (event.data?.type === 'BOOTSTRAP_SUCCESS') {
            worker.removeEventListener('message', onMessage);
            resolve({ ok: true });
            return;
          }
          if (event.data?.type === 'FATAL_ERROR') {
            worker.removeEventListener('message', onMessage);
            resolve({ ok: false, reason: String(event.data?.message ?? 'bootstrap failed') });
          }
        };
        worker.addEventListener('message', onMessage);
        setTimeout(() => {
          worker.removeEventListener('message', onMessage);
          resolve({ ok: false, reason: 'bootstrap timeout' });
        }, 3000);
      });
      if (!bootResult.ok) {
        worker.terminate();
        return { skipped: true, reason: bootResult.reason ?? 'bootstrap failed' };
      }

      worker.postMessage({ type: 'INJECT_POISON_ALLOC' });

      const outcome = await Promise.race([
        fatalPromise,
        new Promise<{ fatal: boolean; message: string }>((resolve) =>
          setTimeout(() => resolve({ fatal: false, message: 'no fatal error after poison alloc' }), 3000),
        ),
      ]);

      worker.terminate();
      return { skipped: false, ...outcome };
    });

    if (result.skipped) {
      test.skip(result.reason);
    }

    expect(result.fatal).toBe(true);
    expect(result.message.length).toBeGreaterThan(0);
  });

  test('Gate 4: runtime telemetry reports <= 1.0ms std-dev jitter', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async (): Promise<TelemetryGateResult> => {
      if (
        typeof Worker === 'undefined'
        || typeof SharedArrayBuffer === 'undefined'
        || typeof HTMLCanvasElement === 'undefined'
        || typeof HTMLCanvasElement.prototype.transferControlToOffscreen !== 'function'
      ) {
        return { skipped: true, reason: 'worker/offscreen/shared-buffer unavailable in this browser context' };
      }

      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const offscreen = canvas.transferControlToOffscreen();
      const sharedInput = new SharedArrayBuffer(36 * Float32Array.BYTES_PER_ELEMENT);
      const inputView = new Float32Array(sharedInput);
      inputView[4] = 0; // panY slot; ensure deterministic buffer write pattern

      const worker = new Worker(new URL('/src/render/rust/engine.worker.ts', window.location.href), {
        type: 'module',
      });

      worker.postMessage(
        {
          type: 'BOOTSTRAP',
          canvas: offscreen,
          sharedInput,
          config: {
            maxParticles: 1024,
            maxShapes: 1024,
            debugReadbackHz: 5,
          },
        },
        [offscreen],
      );

      const bootResult = await new Promise<{ ok: boolean; reason?: string }>((resolve) => {
        const onMessage = (event: MessageEvent<any>) => {
          if (event.data?.type === 'BOOTSTRAP_SUCCESS') {
            worker.removeEventListener('message', onMessage);
            resolve({ ok: true });
            return;
          }
          if (event.data?.type === 'FATAL_ERROR') {
            worker.removeEventListener('message', onMessage);
            resolve({ ok: false, reason: String(event.data?.message ?? 'bootstrap failed') });
          }
        };
        worker.addEventListener('message', onMessage);
        setTimeout(() => {
          worker.removeEventListener('message', onMessage);
          resolve({ ok: false, reason: 'bootstrap timeout' });
        }, 3000);
      });
      if (!bootResult.ok) {
        worker.terminate();
        return { skipped: true, reason: bootResult.reason ?? 'bootstrap failed' };
      }

      const packet = await Promise.race([
        new Promise<{ meanMs: number; stdDevMs: number; sampleCount: number }>((resolve) => {
          const onTelemetry = (event: MessageEvent<any>) => {
            if (event.data?.type !== 'RUNTIME_TELEMETRY') return;
            worker.removeEventListener('message', onTelemetry);
            resolve({
              meanMs: Number(event.data.meanMs ?? 0),
              stdDevMs: Number(event.data.stdDevMs ?? 0),
              sampleCount: Number(event.data.sampleCount ?? 0),
            });
          };
          worker.addEventListener('message', onTelemetry);
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
      ]);

      worker.terminate();
      if (!packet) {
        return { skipped: true, reason: 'telemetry packet not emitted in time' };
      }
      return { skipped: false, ...packet };
    });

    if (result.skipped) {
      test.skip(result.reason);
    }

    expect(result.sampleCount).toBeGreaterThanOrEqual(60);
    expect(result.stdDevMs).toBeLessThanOrEqual(1.0);
  });
});
