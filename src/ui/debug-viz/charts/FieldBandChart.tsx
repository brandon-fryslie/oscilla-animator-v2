/**
 * FieldBandChart - Canvas-based temporal distribution chart for numeric fields.
 *
 * Shows distribution evolution over time:
 * - Outer band: min ↔ max
 * - Inner band: p25 ↔ p75 (IQR)
 * - Mean line (un-smoothed — already stable from accumulator)
 * - Scale labels at right edge
 *
 * Improvements over raw full-buffer rendering:
 * - 64-frame visible window (~1s at 60fps)
 * - Percentile-based Y range (5th/95th) to clip extreme spikes
 * - 3-point moving average on band edges for visual smoothing
 *
 * Same pattern as Sparkline.tsx (2x DPR retina rendering, canvas-based).
 */

import React, { useRef, useEffect } from 'react';
import type { FieldHistoryView } from '../FieldStatsAccumulator';

export interface FieldBandChartProps {
  history: FieldHistoryView;
  width: number;
  height: number;
}

/** Colors matching debug panel teal/cyan theme. */
const OUTER_BAND_COLOR = 'rgba(78, 205, 196, 0.08)';
const INNER_BAND_COLOR = 'rgba(78, 205, 196, 0.22)';
const MEAN_LINE_COLOR = '#4ecdc4';
const SCALE_COLOR = '#666666';

/** Minimum range to avoid division by zero. */
const EPSILON = 1e-10;

/** Maximum frames shown in the visible window (~1s at 60fps). */
const MAX_VISIBLE_FRAMES = 64;

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
 * 3-point moving average smoother for band edge arrays.
 * Averages each point with its neighbors. First and last points
 * average with their single neighbor.
 */
function smooth3(values: number[]): number[] {
  const n = values.length;
  if (n < 3) return values;
  const out = new Array<number>(n);
  out[0] = (values[0] + values[1]) / 2;
  for (let i = 1; i < n - 1; i++) {
    out[i] = (values[i - 1] + values[i] + values[i + 1]) / 3;
  }
  out[n - 1] = (values[n - 2] + values[n - 1]) / 2;
  return out;
}

/**
 * Compute percentile value from a sorted array.
 * Uses linear interpolation between nearest ranks.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/**
 * Draw the band chart onto a canvas context.
 * Reads component 0 from each snapshot.
 */
function drawBandChart(
  ctx: CanvasRenderingContext2D,
  history: FieldHistoryView,
  width: number,
  height: number,
  dpr: number,
): void {
  const w = width * dpr;
  const h = height * dpr;
  ctx.clearRect(0, 0, w, h);

  const { snapshots, writeIndex, capacity, filled } = history;
  const totalSamples = filled ? capacity : Math.min(writeIndex, capacity);

  if (totalSamples < 2) {
    ctx.fillStyle = '#555';
    ctx.font = `${10 * dpr}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('accumulating...', w / 2, h / 2 + 4 * dpr);
    return;
  }

  // Limit visible window to most recent MAX_VISIBLE_FRAMES
  const visibleCount = Math.min(totalSamples, MAX_VISIBLE_FRAMES);
  // startIdx points to the oldest visible snapshot in the ring buffer
  const ringStart = filled ? writeIndex : 0;
  const skipCount = totalSamples - visibleCount;
  const startIdx = ringStart + skipCount;

  // Collect min/max values for percentile-based Y range
  const minValues: number[] = [];
  const maxValues: number[] = [];
  for (let i = 0; i < visibleCount; i++) {
    const snap = snapshots[(startIdx + i) % capacity];
    if (snap.count === 0) continue;
    minValues.push(snap.min[0]);
    maxValues.push(snap.max[0]);
  }

  if (minValues.length === 0) return;

  // Percentile-based Y range: 5th percentile of mins, 95th percentile of maxes
  minValues.sort((a, b) => a - b);
  maxValues.sort((a, b) => a - b);
  const globalMin = percentile(minValues, 5);
  const globalMax = percentile(maxValues, 95);

  if (!Number.isFinite(globalMin) || !Number.isFinite(globalMax)) return;

  const range = globalMax - globalMin;
  const isFlatLine = range < EPSILON;
  const yMin = isFlatLine ? globalMin - 0.5 : globalMin;
  const yMax = isFlatLine ? globalMax + 0.5 : globalMax;
  const yRange = yMax - yMin;

  // Map value to canvas Y (inverted: high values at top), clamped to chart bounds
  const toY = (v: number) => {
    const normalized = (v - yMin) / yRange;
    const clamped = Math.max(0, Math.min(1, normalized));
    return h - clamped * h;
  };
  const toX = (i: number) => (i / (visibleCount - 1)) * w;

  // Extract raw band edge arrays for smoothing
  const rawMin: number[] = [];
  const rawMax: number[] = [];
  const rawP25: number[] = [];
  const rawP75: number[] = [];
  for (let i = 0; i < visibleCount; i++) {
    const snap = snapshots[(startIdx + i) % capacity];
    rawMin.push(snap.count > 0 ? snap.min[0] : globalMin);
    rawMax.push(snap.count > 0 ? snap.max[0] : globalMax);
    rawP25.push(snap.count > 0 ? snap.p25[0] : globalMin);
    rawP75.push(snap.count > 0 ? snap.p75[0] : globalMax);
  }

  // Apply 3-point moving average to band edges
  const smoothedMin = smooth3(rawMin);
  const smoothedMax = smooth3(rawMax);
  const smoothedP25 = smooth3(rawP25);
  const smoothedP75 = smooth3(rawP75);

  // Draw outer band (min ↔ max)
  ctx.fillStyle = OUTER_BAND_COLOR;
  ctx.beginPath();
  for (let i = 0; i < visibleCount; i++) {
    const x = toX(i);
    const y = toY(smoothedMax[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = visibleCount - 1; i >= 0; i--) {
    ctx.lineTo(toX(i), toY(smoothedMin[i]));
  }
  ctx.closePath();
  ctx.fill();

  // Draw inner band (p25 ↔ p75)
  ctx.fillStyle = INNER_BAND_COLOR;
  ctx.beginPath();
  for (let i = 0; i < visibleCount; i++) {
    const x = toX(i);
    const y = toY(smoothedP75[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = visibleCount - 1; i >= 0; i--) {
    ctx.lineTo(toX(i), toY(smoothedP25[i]));
  }
  ctx.closePath();
  ctx.fill();

  // Draw mean line (un-smoothed — already stable from accumulator)
  ctx.strokeStyle = MEAN_LINE_COLOR;
  ctx.lineWidth = 1.5 * dpr;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < visibleCount; i++) {
    const snap = snapshots[(startIdx + i) % capacity];
    if (snap.count === 0) { started = false; continue; }
    const x = toX(i);
    const y = toY(snap.mean[0]);
    if (!started) { ctx.moveTo(x, y); started = true; }
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Scale labels at right edge
  const labelPadding = 2 * dpr;
  ctx.font = `${9 * dpr}px monospace`;
  ctx.fillStyle = SCALE_COLOR;
  ctx.textAlign = 'right';

  if (!isFlatLine) {
    ctx.fillText(scaleLabel(globalMax), w - labelPadding, 9 * dpr);
    ctx.fillText(scaleLabel(globalMin), w - labelPadding, h - 2 * dpr);
  } else {
    ctx.fillText(scaleLabel(globalMin), w - labelPadding, h / 2 - 2 * dpr);
  }
}

export const FieldBandChart: React.FC<FieldBandChartProps> = ({ history, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawBandChart(ctx, history, width, height, dpr);
  });

  return React.createElement('canvas', {
    ref: canvasRef,
    width: width * 2,
    height: height * 2,
    style: { width: `${width}px`, height: `${height}px`, display: 'block' },
  });
};
