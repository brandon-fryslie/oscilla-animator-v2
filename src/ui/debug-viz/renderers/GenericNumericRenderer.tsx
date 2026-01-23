/**
 * GenericNumericValueRenderer - Category fallback for all numeric payloads.
 *
 * Handles both scalar and aggregate RendererSample modes.
 * Displays components as formatted numbers with monospace font.
 * Handles NaN/Inf gracefully with red badge styling.
 */

import React from 'react';
import type { ValueRenderer } from '../ValueRenderer';
import type { RendererSample, AggregateStats } from '../types';
import { formatFloat, isInvalidFloat } from './formatFloat';

const styles = {
  container: { fontFamily: 'monospace', fontSize: '12px', color: '#e0e0e0' } as const,
  invalidBadge: { color: '#ff4444', fontWeight: 'bold', padding: '0 2px' } as const,
  componentLabel: { color: '#888', marginRight: '4px', fontSize: '10px' } as const,
  row: { display: 'flex', gap: '8px', alignItems: 'center' } as const,
  statLabel: { color: '#666', fontSize: '10px', width: '32px' } as const,
};

function renderValue(value: number): React.ReactElement {
  if (isInvalidFloat(value)) {
    return React.createElement('span', { style: styles.invalidBadge }, formatFloat(value));
  }
  return React.createElement('span', null, formatFloat(value));
}

function renderScalarFull(components: Float32Array, stride: number): React.ReactElement {
  const items: React.ReactElement[] = [];
  for (let i = 0; i < stride; i++) {
    items.push(
      React.createElement('span', { key: i }, renderValue(components[i]))
    );
  }
  return React.createElement('div', { style: { ...styles.container, ...styles.row } }, ...items);
}

function renderAggregateFull(stats: AggregateStats): React.ReactElement {
  const rows: React.ReactElement[] = [];
  const labels = ['min', 'mean', 'max'] as const;
  const arrays = [stats.min, stats.mean, stats.max] as const;

  for (let r = 0; r < 3; r++) {
    const values: React.ReactElement[] = [
      React.createElement('span', { key: 'label', style: styles.statLabel }, labels[r]),
    ];
    for (let i = 0; i < stats.stride; i++) {
      values.push(React.createElement('span', { key: i }, renderValue(arrays[r][i])));
    }
    rows.push(React.createElement('div', { key: labels[r], style: styles.row }, ...values));
  }

  rows.push(
    React.createElement('div', { key: 'count', style: { color: '#666', fontSize: '10px' } },
      `n=${stats.count}`)
  );

  return React.createElement('div', { style: styles.container }, ...rows);
}

function renderScalarInline(components: Float32Array, stride: number): React.ReactElement {
  const parts: string[] = [];
  for (let i = 0; i < stride; i++) {
    parts.push(formatFloat(components[i]));
  }
  const hasInvalid = Array.from(components.subarray(0, stride)).some(isInvalidFloat);
  const style = hasInvalid ? { ...styles.container, ...styles.invalidBadge } : styles.container;
  return React.createElement('span', { style }, parts.join(', '));
}

function renderAggregateInline(stats: AggregateStats): React.ReactElement {
  const meanStr = formatFloat(stats.mean[0]);
  return React.createElement('span', { style: styles.container }, `${meanStr} (n=${stats.count})`);
}

export const genericNumericRenderer: ValueRenderer = {
  renderFull(sample: RendererSample): React.ReactElement {
    if (sample.type === 'aggregate') {
      return renderAggregateFull(sample.stats);
    }
    return renderScalarFull(sample.components, sample.stride);
  },

  renderInline(sample: RendererSample): React.ReactElement {
    if (sample.type === 'aggregate') {
      return renderAggregateInline(sample.stats);
    }
    return renderScalarInline(sample.components, sample.stride);
  },
};
