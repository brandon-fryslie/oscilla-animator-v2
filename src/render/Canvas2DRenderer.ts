/**
 * Canvas 2D Renderer - Optimized
 *
 * Uses canvas API with strategic batching for performance.
 */

import type { RenderFrameIR, RenderPassIR } from './types';

/**
 * Render a frame to a 2D canvas context
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  frame: RenderFrameIR,
  width: number,
  height: number
): void {
  // Clear canvas once
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  // Render each pass
  for (const pass of frame.passes) {
    renderPass(ctx, pass, width, height);
  }
}

/**
 * Render a single pass
 */
function renderPass(
  ctx: CanvasRenderingContext2D,
  pass: RenderPassIR,
  width: number,
  height: number
): void {
  if (pass.kind === 'instances2d') {
    renderInstances2D(ctx, pass, width, height);
  } else {
    throw new Error(`Unknown pass kind: ${(pass as any).kind}`);
  }
}

/**
 * Render 2D instances with minimal fillStyle changes
 * Uses squares instead of circles for better performance
 */
function renderInstances2D(
  ctx: CanvasRenderingContext2D,
  pass: RenderPassIR,
  width: number,
  height: number
): void {
  const position = pass.position as Float32Array;
  const color = pass.color as Uint8ClampedArray;
  const sizes = typeof pass.size === 'number' ? null : pass.size as Float32Array;
  const uniformSize = typeof pass.size === 'number' ? pass.size : 3;

  // Simplest possible loop - JIT optimizes this best
  for (let i = 0; i < pass.count; i++) {
    const x = position[i * 2] * width;
    const y = position[i * 2 + 1] * height;
    const size = sizes ? sizes[i] : uniformSize;

    ctx.fillStyle = `rgba(${color[i * 4]},${color[i * 4 + 1]},${color[i * 4 + 2]},${color[i * 4 + 3] / 255})`;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
  }
}
