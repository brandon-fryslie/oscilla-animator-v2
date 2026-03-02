import { test, expect } from '@playwright/test';

type WorkerGateResult =
  | { skipped: true; reason: string }
  | { skipped: false; fatal: boolean; message: string };

type TelemetryGateResult =
  | { skipped: true; reason: string }
  | { skipped: false; meanMs: number; stdDevMs: number; sampleCount: number };

test.describe('Rust Worker Gates', () => {
  test('Gate 2: 100-frame strict hot path then poison allocation trap', async ({ page }) => {
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
      document.body.appendChild(canvas);
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
              message: String(event.data.message ?? event.data.code ?? 'fatal error'),
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
        canvas.remove();
        return { skipped: true, reason: bootResult.reason ?? 'bootstrap failed' };
      }

      const frameGateResult = await new Promise<{ ok: boolean; reason?: string }>((resolve) => {
        const onMessage = (event: MessageEvent<any>) => {
          if (event.data?.type !== 'SCHEDULER_HEARTBEAT') return;
          const frameCount = Number(event.data.frameCount ?? 0);
          if (frameCount < 100) return;
          worker.removeEventListener('message', onMessage);
          resolve({ ok: true });
        };
        worker.addEventListener('message', onMessage);
        setTimeout(() => {
          worker.removeEventListener('message', onMessage);
          resolve({ ok: false, reason: 'strict hot-path gate did not reach 100 frames in time' });
        }, 6000);
      });
      if (!frameGateResult.ok) {
        worker.terminate();
        canvas.remove();
        return { skipped: true, reason: frameGateResult.reason ?? '100-frame strict hot-path gate failed' };
      }

      worker.postMessage({ type: 'INJECT_POISON_ALLOC' });

      const outcome = await Promise.race([
        fatalPromise,
        new Promise<{ fatal: boolean; message: string }>((resolve) =>
          setTimeout(() => resolve({ fatal: false, message: 'no fatal error after poison alloc' }), 3000),
        ),
      ]);

      worker.terminate();
      canvas.remove();
      return { skipped: false, ...outcome };
    });

    if (result.skipped) {
      // [LAW:verifiable-goals] Browser gates must hard-fail on skipped
      // execution so local and CI runs enforce the same contract.
      throw new Error(`Gate 2 skipped: ${result.reason}`);
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
      document.body.appendChild(canvas);
      const offscreen = canvas.transferControlToOffscreen();
      const sharedInput = new SharedArrayBuffer(36 * Float32Array.BYTES_PER_ELEMENT);
      const inputView = new Float32Array(sharedInput);
      inputView[4] = 0; // panY slot; ensure deterministic buffer write pattern

      const worker = new Worker(new URL('/src/render/rust/engine.worker.ts', window.location.href), {
        type: 'module',
      });
      const fatalPromise = new Promise<{ type: 'fatal'; reason: string }>((resolve) => {
        worker.onerror = (event) => {
          event.preventDefault();
          resolve({
            type: 'fatal',
            reason: event.message || 'worker runtime error',
          });
        };
        worker.addEventListener('message', (event: MessageEvent<any>) => {
          if (event.data?.type === 'FATAL_ERROR') {
            resolve({
              type: 'fatal',
              reason: String(event.data?.message ?? event.data?.code ?? 'worker fatal message'),
            });
          }
        });
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
        canvas.remove();
        return { skipped: true, reason: bootResult.reason ?? 'bootstrap failed' };
      }

      const packet = await Promise.race([
        new Promise<{ meanMs: number; stdDevMs: number; sampleCount: number }>((resolve) => {
          const onTelemetry = (event: MessageEvent<any>) => {
            if (event.data?.type !== 'SCHEDULER_HEARTBEAT') return;
            const sampleCount = Number(event.data.sampleCount ?? 0);
            if (sampleCount < 60) return;
            worker.removeEventListener('message', onTelemetry);
            resolve({
              meanMs: Number(event.data.meanTickMs ?? 0),
              stdDevMs: Number(event.data.stdDevTickMs ?? 0),
              sampleCount,
            });
          };
          worker.addEventListener('message', onTelemetry);
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
        fatalPromise,
      ]);

      worker.terminate();
      canvas.remove();
      if (packet && typeof packet === 'object' && 'type' in packet && packet.type === 'fatal') {
        return { skipped: true, reason: packet.reason };
      }
      if (!packet) {
        return { skipped: true, reason: 'telemetry packet not emitted in time' };
      }
      return { skipped: false, ...packet };
    });

    if (result.skipped) {
      // [LAW:verifiable-goals] Browser gates must hard-fail on skipped
      // execution so local and CI runs enforce the same contract.
      throw new Error(`Gate 4 skipped: ${result.reason}`);
    }

    expect(result.sampleCount).toBeGreaterThanOrEqual(60);
    expect(result.stdDevMs).toBeLessThanOrEqual(1.0);
  });
});
