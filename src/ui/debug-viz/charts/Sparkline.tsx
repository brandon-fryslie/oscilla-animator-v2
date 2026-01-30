/**
 * Sparkline - Canvas-based temporal value chart.
 *
 * Reads from a HistoryView ring buffer and draws a line chart
 * showing value over time (oldest left, newest right).
 *
 * Features:
 * - Auto-scale from visible samples (min/max → full height)
 * - Flat-line handling (centered horizontal line if range < epsilon)
 * - NaN/Inf gap handling (skip invalid samples)
 * - Phase wrap markers (for unit:phase01)
 * - Scale markers (min/max labels at right edge)
 * - 2x DPR retina rendering
 */

import React, { useRef, useEffect } from 'react';
import type { HistoryView } from '../types';
import type { UnitType } from '../../../core/canonical-types';
import { isInvalidFloat } from '../renderers/formatFloat';

export interface SparklineProps {
  history: HistoryView;
  width: number;
  height: number;
  unit?: UnitType;
}

/** Minimum range to avoid division by zero. */
const EPSILON = 1e-10;

/** Line color (teal/cyan matching debug panel). */
const LINE_COLOR = '#4ecdc4';
/** Invalid value overlay color. */
const INVALID_COLOR = '#ff4444';
/** Scale marker text color. */
const SCALE_COLOR = '#666666';
/** Phase wrap marker color. */
const WRAP_COLOR = 'rgba(255, 255, 255, 0.3)';

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
 * Read samples from ring buffer in chronological order (oldest first).
 * Returns array of values and the count of valid samples.
 */
function readSamples(history: HistoryView): number[] {
  const { buffer, writeIndex, capacity, filled } = history;
  const count = filled ? capacity : writeIndex;
  if (count === 0) return [];

  const result: number[] = new Array(count);
  const startIdx = filled ? writeIndex : 0;

  for (let i = 0; i < count; i++) {
    const bufPos = ((startIdx + i) % capacity + capacity) % capacity;
    result[i] = buffer[bufPos];
  }
  return result;
}

/**
 * Draw the sparkline onto a canvas context.
 */
function drawSparkline(
  ctx: CanvasRenderingContext2D,
  samples: number[],
  width: number,
  height: number,
  dpr: number,
  unit?: UnitType,
): void {
  const w = width * dpr;
  const h = height * dpr;

  ctx.clearRect(0, 0, w, h);

  if (samples.length === 0) return;

  // Compute auto-scale range (ignoring invalid values)
  let min = Infinity;
  let max = -Infinity;
  let hasInvalid = false;

  for (const v of samples) {
    if (isInvalidFloat(v)) {
      hasInvalid = true;
      continue;
    }
    if (v < min) min = v;
    if (v > max) max = v;
  }

  // If all values are invalid
  if (!Number.isFinite(min)) {
    ctx.fillStyle = INVALID_COLOR;
    ctx.font = `${10 * dpr}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('invalid', w / 2, h / 2 + 4 * dpr);
    return;
  }

  // Flat-line handling
  const range = max - min;
  const isFlatLine = range < EPSILON;
  const yMin = isFlatLine ? min - 0.5 : min;
  const yMax = isFlatLine ? max + 0.5 : max;
  const yRange = yMax - yMin;

  // Map value to canvas Y (inverted: high values at top)
  const toY = (v: number) => h - ((v - yMin) / yRange) * h;
  const toX = (i: number) => (i / (samples.length - 1)) * w;

  // Draw line
  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = 1.5 * dpr;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  let inPath = false;
  ctx.beginPath();

  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    if (isInvalidFloat(v)) {
      inPath = false;
      continue;
    }

    const x = samples.length === 1 ? w / 2 : toX(i);
    const y = toY(v);

    if (!inPath) {
      ctx.moveTo(x, y);
      inPath = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  // Phase wrap markers (only for phase01 unit)
  if (unit?.kind === 'angle' && unit.unit === 'phase01') {
    ctx.strokeStyle = WRAP_COLOR;
    ctx.lineWidth = 1 * dpr;
    ctx.setLineDash([2 * dpr, 2 * dpr]);

    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1];
      const curr = samples[i];
      if (isInvalidFloat(prev) || isInvalidFloat(curr)) continue;

      // Detect phase wrap: large jump across 0/1 boundary
      if ((prev > 0.9 && curr < 0.1) || (prev < 0.1 && curr > 0.9)) {
        const x = toX(i);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }

  // Scale markers (min/max at right edge)
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

  // Invalid value indicator
  if (hasInvalid) {
    ctx.fillStyle = INVALID_COLOR;
    ctx.font = `bold ${8 * dpr}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('!', labelPadding, 9 * dpr);
  }
}

export const Sparkline: React.FC<SparklineProps> = ({ history, width, height, unit }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const samples = readSamples(history);
    drawSparkline(ctx, samples, width, height, dpr, unit);
  });

  return React.createElement('canvas', {
    ref: canvasRef,
    width: width * 2, // Initial size, overridden in useEffect
    height: height * 2,
    style: { width: `${width}px`, height: `${height}px`, display: 'block' },
  });
};
