/**
 * ColorPalette - Canvas-based sorted color palette strip.
 *
 * Shows the actual N colors in a field buffer, sorted by luminance
 * (dark to light). Provides an immediate visual overview of the
 * color distribution across all lanes.
 *
 * Features:
 * - Luminance-sorted (dark left, light right)
 * - Checkerboard background for alpha visibility
 * - 2x DPR retina rendering (same pattern as Sparkline)
 * - Handles count > width by averaging groups
 */

import React, { useRef, useEffect } from 'react';
import { OKLCH_HUE_TAU, toCssOklch } from '../../../core/color/oklch';

export interface ColorPaletteProps {
  /** Interleaved OKLCH+A float buffer (stride 4) */
  buffer: Float32Array;
  /** Number of colors (lanes) in the buffer */
  count: number;
  /** Canvas CSS width */
  width: number;
  /** Canvas CSS height */
  height: number;
}

/** Checkerboard tile size (logical pixels). */
const CHECK_SIZE = 4;
const CHECK_LIGHT = '#c0c0c0';
const CHECK_DARK = '#808080';

/**
 * Luminance proxy from OKLCH (lightness channel).
 */
function luminanceFromOklch(lightness: number): number {
  return lightness;
}

/**
 * Draw the color palette onto a canvas context.
 */
function drawPalette(
  ctx: CanvasRenderingContext2D,
  buffer: Float32Array,
  count: number,
  width: number,
  height: number,
  dpr: number,
): void {
  const w = width * dpr;
  const h = height * dpr;
  ctx.clearRect(0, 0, w, h);

  if (count === 0) {
    ctx.fillStyle = '#333';
    ctx.font = `${10 * dpr}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('no colors', w / 2, h / 2 + 4 * dpr);
    return;
  }

  // [LAW:dataflow-not-control-flow] Palette rendering always consumes all lanes;
  // variability (sorting/visual result) is encoded in per-lane color values.
  // Extract and sort colors by lightness (OKLCH L channel)
  const colors: { h: number; c: number; l: number; a: number; lum: number }[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const hTurns = buffer[i * 4];
    const chroma = buffer[i * 4 + 1];
    const lightness = buffer[i * 4 + 2];
    const a = buffer[i * 4 + 3];
    colors[i] = { h: hTurns, c: chroma, l: lightness, a, lum: luminanceFromOklch(lightness) };
  }
  colors.sort((a, b) => a.lum - b.lum);

  // Draw checkerboard background
  const cs = CHECK_SIZE * dpr;
  for (let y = 0; y < h; y += cs) {
    for (let x = 0; x < w; x += cs) {
      const isLight = ((Math.floor(x / cs) + Math.floor(y / cs)) % 2) === 0;
      ctx.fillStyle = isLight ? CHECK_LIGHT : CHECK_DARK;
      ctx.fillRect(x, y, cs, cs);
    }
  }

  // Draw color columns
  if (count <= width) {
    // Each color gets floor(width/count) pixels
    const colW = w / count;
    for (let i = 0; i < count; i++) {
      const c = colors[i];
      ctx.fillStyle = toCssOklch(c.h, c.c, c.l, c.a);
      ctx.fillRect(Math.floor(i * colW), 0, Math.ceil(colW), h);
    }
  } else {
    // More colors than pixels: average groups per pixel column
    const groupSize = count / width;
    for (let px = 0; px < width; px++) {
      const start = Math.floor(px * groupSize);
      const end = Math.floor((px + 1) * groupSize);
      const n = end - start;
      let hueX = 0;
      let hueY = 0;
      let cSum = 0;
      let lSum = 0;
      let aSum = 0;
      for (let i = start; i < end; i++) {
        const angle = colors[i].h * OKLCH_HUE_TAU;
        hueX += Math.cos(angle);
        hueY += Math.sin(angle);
        cSum += colors[i].c;
        lSum += colors[i].l;
        aSum += colors[i].a;
      }
      const avgHue = hueX === 0 && hueY === 0
        ? 0
        : ((Math.atan2(hueY, hueX) / OKLCH_HUE_TAU) + 1) % 1;
      ctx.fillStyle = toCssOklch(avgHue, cSum / n, lSum / n, aSum / n);
      ctx.fillRect(px * dpr, 0, dpr, h);
    }
  }
}

export const ColorPalette: React.FC<ColorPaletteProps> = ({ buffer, count, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawPalette(ctx, buffer, count, width, height, dpr);
  });

  return React.createElement('canvas', {
    ref: canvasRef,
    width: width * 2,
    height: height * 2,
    style: { width: `${width}px`, height: `${height}px`, display: 'block', borderRadius: '3px' },
  });
};
