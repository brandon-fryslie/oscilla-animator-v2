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
 * Render 2D instances with shape support
 *
 * Shape encoding:
 *   0 = circle
 *   1 = square
 *   2 = triangle
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
  const shapes = typeof pass.shape === 'number' ? null : pass.shape as Float32Array;
  const uniformShape = typeof pass.shape === 'number' ? Math.floor(pass.shape) : 0;

  for (let i = 0; i < pass.count; i++) {
    const x = position[i * 2] * width;
    const y = position[i * 2 + 1] * height;
    const size = sizes ? sizes[i] : uniformSize;
    const shape = shapes ? Math.floor(shapes[i]) : uniformShape;

    ctx.fillStyle = `rgba(${color[i * 4]},${color[i * 4 + 1]},${color[i * 4 + 2]},${color[i * 4 + 3] / 255})`;

    switch (shape) {
      case 0: // circle
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 1: // square
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
        break;
      case 2: // triangle
        ctx.beginPath();
        ctx.moveTo(x, y - size / 2);
        ctx.lineTo(x + size / 2, y + size / 2);
        ctx.lineTo(x - size / 2, y + size / 2);
        ctx.closePath();
        ctx.fill();
        break;
      default:
        // fallback to circle
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.fill();
    }
  }
}
