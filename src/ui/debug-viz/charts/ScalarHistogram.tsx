/**
 * ScalarHistogram - Distribution histogram for scalar history values.
 *
 * Uses a HistoryView ring buffer and renders a compact binned histogram.
 * Intended for cardinality:one scalar probes (component 0).
 */

import React from 'react';
import type { HistoryView } from '../types';
import { isInvalidFloat } from '../renderers/formatFloat';

export interface ScalarHistogramProps {
  history: HistoryView;
  width: number;
  height?: number;
  bins?: number;
}

function readScalarSamples(history: HistoryView): number[] {
  const count = history.filled ? history.capacity : Math.min(history.writeIndex, history.capacity);
  if (count <= 0 || history.stride <= 0) return [];

  const result: number[] = [];
  const startIdx = history.filled ? history.writeIndex % history.capacity : 0;
  const stride = history.stride;

  for (let i = 0; i < count; i += 1) {
    const sampleIdx = (startIdx + i) % history.capacity;
    const component0 = history.buffer[sampleIdx * stride];
    if (!isInvalidFloat(component0)) result.push(component0);
  }
  return result;
}

function buildBins(values: readonly number[], binCount: number): {
  readonly min: number;
  readonly max: number;
  readonly counts: readonly number[];
} | null {
  if (values.length === 0 || binCount <= 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

  const counts = new Array<number>(binCount).fill(0);
  const range = max - min;
  if (range <= 1e-12) {
    counts[Math.floor(binCount / 2)] = values.length;
    return { min, max, counts };
  }

  for (const v of values) {
    const normalized = (v - min) / range;
    const idx = Math.max(0, Math.min(binCount - 1, Math.floor(normalized * binCount)));
    counts[idx] += 1;
  }
  return { min, max, counts };
}

export const ScalarHistogram: React.FC<ScalarHistogramProps> = ({
  history,
  width,
  height = 42,
  bins = 24,
}) => {
  const values = readScalarSamples(history);
  const binned = buildBins(values, bins);

  if (!binned) {
    return React.createElement(
      'div',
      {
        style: {
          color: '#666',
          fontStyle: 'italic',
          fontSize: '10px',
          fontFamily: 'monospace',
        },
      },
      'no histogram data',
    );
  }

  const maxBin = Math.max(1, ...binned.counts);
  const barWidth = width / bins;
  const bars = binned.counts.map((count, i) => {
    const h = Math.max(1, (count / maxBin) * height);
    const x = i * barWidth;
    const y = height - h;
    return React.createElement('rect', {
      key: i,
      x,
      y,
      width: Math.max(1, barWidth - 1),
      height: h,
      fill: 'rgba(78, 205, 196, 0.6)',
    });
  });

  return React.createElement(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
    React.createElement(
      'svg',
      {
        width,
        height,
        style: {
          display: 'block',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '3px',
          background: 'rgba(255,255,255,0.02)',
        },
      },
      ...bars,
    ),
    React.createElement(
      'div',
      {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          color: '#666',
          fontSize: '9px',
          fontFamily: 'monospace',
        },
      },
      React.createElement('span', null, binned.min.toPrecision(4)),
      React.createElement('span', null, binned.max.toPrecision(4)),
    ),
  );
};
