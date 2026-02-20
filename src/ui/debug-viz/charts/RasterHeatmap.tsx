/**
 * RasterHeatmap - Canvas-based spatiotemporal field visualization.
 *
 * Renders a 2D heatmap where X=time, Y=instance, brightness=value.
 * Reveals spatiotemporal structure (wave propagation, phase gradients)
 * that no other viz can show.
 *
 * Rendering:
 * - Renders ImageData at data resolution (frameCount × rowCount)
 * - Scales to display canvas with imageSmoothingEnabled=false (crisp pixels)
 * - Teal ramp: v * [78, 205, 196] where v is normalized [0,1]
 * - Auto-range: min/max from visible frames
 * - DPR-aware, same pattern as Sparkline/FieldBandChart
 */

import React, { useRef, useEffect } from 'react';
import type { BufferHistoryView } from '../types';

export interface RasterHeatmapProps {
  history: BufferHistoryView;
  width: number;
  height: number;
}

/** Minimum range to avoid division by zero. */
const EPSILON = 1e-10;

/** Scale marker text color. */
const SCALE_COLOR = '#666666';

/**
 * Format a scale label (compact).
 */
function scaleLabel(value: number): string {
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toExponential(1);
  if (abs >= 1) return value.toFixed(1);
  if (abs >= 0.01) return value.toFixed(3);
  return value.toExponential(1);
}

/**
 * Draw the raster heatmap onto a canvas context.
 */
function drawRasterHeatmap(
  ctx: CanvasRenderingContext2D,
  history: BufferHistoryView,
  width: number,
  height: number,
  dpr: number,
): void {
  const w = width * dpr;
  const h = height * dpr;
  ctx.clearRect(0, 0, w, h);

  const { frames, writeIndex, capacity, rowCount, filled } = history;
  const totalFrames = filled ? capacity : Math.min(writeIndex, capacity);

  if (totalFrames < 2 || rowCount === 0) {
    ctx.fillStyle = '#555';
    ctx.font = `${10 * dpr}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('accumulating...', w / 2, h / 2 + 4 * dpr);
    return;
  }

  // Compute auto-range from all visible frames
  let min = Infinity;
  let max = -Infinity;
  const ringStart = filled ? writeIndex : 0;

  for (let f = 0; f < totalFrames; f++) {
    const frame = frames[(ringStart + f) % capacity];
    for (let r = 0; r < rowCount; r++) {
      const v = frame[r];
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return;

  const range = max - min;
  const isFlatLine = range < EPSILON;
  const effectiveMin = isFlatLine ? min - 0.5 : min;
  const effectiveRange = isFlatLine ? 1.0 : range;

  // Render at data resolution into ImageData
  const imgW = totalFrames;
  const imgH = rowCount;
  const imageData = ctx.createImageData(imgW, imgH);
  const data = imageData.data;

  for (let f = 0; f < totalFrames; f++) {
    const frame = frames[(ringStart + f) % capacity];
    for (let r = 0; r < rowCount; r++) {
      const v = (frame[r] - effectiveMin) / effectiveRange;
      const clamped = Math.max(0, Math.min(1, v));

      // Teal ramp: v * [78, 205, 196]
      const pixIdx = (r * imgW + f) * 4;
      data[pixIdx]     = Math.round(clamped * 78);
      data[pixIdx + 1] = Math.round(clamped * 205);
      data[pixIdx + 2] = Math.round(clamped * 196);
      data[pixIdx + 3] = 255;
    }
  }

  // Draw ImageData at native resolution into a temporary canvas, then scale up
  // This avoids putImageData scaling issues (putImageData doesn't respect transforms)
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = imgW;
  tmpCanvas.height = imgH;
  const tmpCtx = tmpCanvas.getContext('2d')!;
  tmpCtx.putImageData(imageData, 0, 0);

  // Scale to display canvas with crisp pixels
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmpCanvas, 0, 0, w, h);
  ctx.imageSmoothingEnabled = true; // restore

  // Scale labels at edges
  const labelPadding = 2 * dpr;
  ctx.font = `${9 * dpr}px monospace`;
  ctx.fillStyle = SCALE_COLOR;
  ctx.textAlign = 'right';

  if (!isFlatLine) {
    ctx.fillText(scaleLabel(max), w - labelPadding, 9 * dpr);
    ctx.fillText(scaleLabel(min), w - labelPadding, h - 2 * dpr);
  } else {
    ctx.fillText(scaleLabel(min), w - labelPadding, h / 2 - 2 * dpr);
  }
}

export const RasterHeatmap: React.FC<RasterHeatmapProps> = ({ history, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawRasterHeatmap(ctx, history, width, height, dpr);
  });

  return React.createElement('canvas', {
    ref: canvasRef,
    width: width * 2,
    height: height * 2,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      display: 'block',
      imageRendering: 'pixelated' as any,
    },
  });
};
