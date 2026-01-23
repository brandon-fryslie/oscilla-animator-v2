/**
 * DistributionBar - Horizontal min/max range bar with mean tick.
 *
 * Shows the spread of values across lanes for field-cardinality data.
 * Reads stats.min[0], stats.max[0], stats.mean[0] (stride-aware: component 0).
 */

import React from 'react';
import type { AggregateStats } from '../types';
import { formatFloat } from '../renderers/formatFloat';

export interface DistributionBarProps {
  stats: AggregateStats;
  width: number;
  height?: number;
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontFamily: 'monospace',
    fontSize: '9px',
    color: '#888',
  } as const,
  track: {
    position: 'relative' as const,
    height: '100%',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '2px',
    overflow: 'hidden' as const,
  } as const,
  fill: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    background: 'rgba(78, 205, 196, 0.3)',
    borderRadius: '2px',
  } as const,
  meanTick: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    width: '1px',
    background: '#4ecdc4',
  } as const,
  label: {
    whiteSpace: 'nowrap' as const,
    minWidth: '28px',
  } as const,
  noData: {
    color: '#666',
    fontStyle: 'italic' as const,
    fontSize: '10px',
    fontFamily: 'monospace',
  } as const,
};

export const DistributionBar: React.FC<DistributionBarProps> = ({ stats, width, height = 12 }) => {
  if (stats.count === 0) {
    return React.createElement('span', { style: styles.noData }, 'no data');
  }

  const min = stats.min[0];
  const max = stats.max[0];
  const mean = stats.mean[0];

  // Degenerate case: min === max
  if (min === max) {
    return React.createElement('div', { style: { ...styles.container, height: `${height}px` } },
      React.createElement('span', { style: styles.label }, formatFloat(min)),
      React.createElement('div', { style: { ...styles.track, flex: 1, width: `${width - 60}px` } },
        React.createElement('div', { style: { ...styles.meanTick, left: '50%' } })
      ),
      React.createElement('span', { style: { ...styles.label, textAlign: 'right' } }, formatFloat(max))
    );
  }

  // Normal case: position fill and mean tick proportionally
  const range = max - min;
  const meanPct = ((mean - min) / range) * 100;

  return React.createElement('div', { style: { ...styles.container, height: `${height}px` } },
    React.createElement('span', { style: styles.label }, formatFloat(min)),
    React.createElement('div', { style: { ...styles.track, flex: 1 } },
      React.createElement('div', { style: { ...styles.fill, left: '0%', width: '100%' } }),
      React.createElement('div', { style: { ...styles.meanTick, left: `${meanPct}%` } })
    ),
    React.createElement('span', { style: { ...styles.label, textAlign: 'right' } }, formatFloat(max))
  );
};
