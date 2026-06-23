/**
 * src/render/webgpu/index.ts
 *
 * The single app-facing renderer construction seam. `createWebGPURenderer()` is
 * the one boundary the app/runtime uses to obtain a renderer; everything behind
 * it is backend-local (canon: design-docs/three-migration-backend-canon.md
 * §"Stable Seams"). The scorched-earth stub is replaced here by the Three
 * backend (oscilla-pillars-cleanup-ulu.2).
 *
 * [LAW:single-enforcer] This file is the only place the renderer backend is
 *   chosen and constructed; RuntimeService depends on the seam, never on
 *   `ThreeForkRenderer` directly.
 * [LAW:locality-or-seam] The return type is the backend-neutral
 *   `WebGPURenderer` contract; no `three` type escapes this module to app code.
 */

export type { WebGPURendererExecutionState } from './renderer-circuit-breaker';

export type {
  WebGPURenderer,
  GpuFault,
  GpuFaultCallback,
  RuntimeInputChannelValues,
} from './three/renderer-contract';

import type { GpuFault, WebGPURenderer } from './three/renderer-contract';
import { ThreeForkRenderer } from './three/ThreeForkRenderer';

export async function createWebGPURenderer(
  canvas: HTMLCanvasElement,
  options?: { onGpuFault?: (fault: GpuFault) => void },
): Promise<WebGPURenderer> {
  const renderer = new ThreeForkRenderer(canvas);
  // [LAW:no-ambient-temporal-coupling] The GPU device is acquired lazily on the
  //   first frame, so construction never requires a WebGPU adapter — the app
  //   shell boots even where no device is available, and a plan can be
  //   installed before any frame is drawn.
  if (options?.onGpuFault) {
    renderer.setGpuFaultCallback(options.onGpuFault);
  }
  return renderer;
}

export function assertWebGPUStartupContract(): void {
  // The Three backend negotiates device/adapter (with WebGL fallback) lazily at
  // first frame and reports any failure as a fatal GpuFault, so there is no
  // separate startup contract to assert here.
}
