/**
 * FieldBandChart - Canvas-based temporal distribution chart for numeric fields.
 *
 * Shows distribution evolution over time:
 * - Outer band: min ↔ max
 * - Inner band: p25 ↔ p75 (IQR)
 * - Mean line
 * - Scale labels at right edge
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
  const sampleCount = filled ? capacity : Math.min(writeIndex, capacity);

  if (sampleCount < 2) {
    ctx.fillStyle = '#555';
    ctx.font = `${10 * dpr}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('accumulating...', w / 2, h / 2 + 4 * dpr);
    return;
  }

  // Read snapshots chronologically (oldest first)
  const startIdx = filled ? writeIndex : 0;

  // Find global Y range across all visible snapshots (component 0)
  let globalMin = Infinity;
  let globalMax = -Infinity;
  for (let i = 0; i < sampleCount; i++) {
    const snap = snapshots[(startIdx + i) % capacity];
    if (snap.count === 0) continue;
    const sMin = snap.min[0];
    const sMax = snap.max[0];
    if (sMin < globalMin) globalMin = sMin;
    if (sMax > globalMax) globalMax = sMax;
  }

  if (!Number.isFinite(globalMin) || !Number.isFinite(globalMax)) return;

  const range = globalMax - globalMin;
  const isFlatLine = range < EPSILON;
  const yMin = isFlatLine ? globalMin - 0.5 : globalMin;
  const yMax = isFlatLine ? globalMax + 0.5 : globalMax;
  const yRange = yMax - yMin;

  // Map value to canvas Y (inverted: high values at top)
  const toY = (v: number) => h - ((v - yMin) / yRange) * h;
  const toX = (i: number) => (i / (sampleCount - 1)) * w;

  // Draw outer band (min ↔ max)
  ctx.fillStyle = OUTER_BAND_COLOR;
  ctx.beginPath();
  // Top edge (max, left to right)
  for (let i = 0; i < sampleCount; i++) {
    const snap = snapshots[(startIdx + i) % capacity];
    const x = toX(i);
    const y = toY(snap.count > 0 ? snap.max[0] : globalMax);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  // Bottom edge (min, right to left)
  for (let i = sampleCount - 1; i >= 0; i--) {
    const snap = snapshots[(startIdx + i) % capacity];
    const x = toX(i);
    const y = toY(snap.count > 0 ? snap.min[0] : globalMin);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  // Draw inner band (p25 ↔ p75)
  ctx.fillStyle = INNER_BAND_COLOR;
  ctx.beginPath();
  for (let i = 0; i < sampleCount; i++) {
    const snap = snapshots[(startIdx + i) % capacity];
    const x = toX(i);
    const y = toY(snap.count > 0 ? snap.p75[0] : globalMax);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = sampleCount - 1; i >= 0; i--) {
    const snap = snapshots[(startIdx + i) % capacity];
    const x = toX(i);
    const y = toY(snap.count > 0 ? snap.p25[0] : globalMin);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  // Draw mean line
  ctx.strokeStyle = MEAN_LINE_COLOR;
  ctx.lineWidth = 1.5 * dpr;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < sampleCount; i++) {
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
