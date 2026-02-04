/**
 * BoolEventValueRenderer - Boolean and event visualization.
 *
 * Shows bool/event values with:
 * - Full mode: Large badge "TRUE"/"FALSE" or "FIRED"/"IDLE"
 * - Inline mode: "✓"/"✗" or "●"/"○"
 * - Field aggregate: Percentage true/fired + count breakdown
 * 
 * Note: Events use boolean representation (1 = fired, 0 = idle this frame)
 */

import React from 'react';
import type { ValueRenderer } from '../ValueRenderer';
import type { RendererSample, AggregateStats } from '../types';

const styles = {
  container: { fontFamily: 'monospace', fontSize: '12px', color: '#e0e0e0' } as const,
  badgeLarge: {
    display: 'inline-block',
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '18px',
    fontWeight: 'bold',
    textAlign: 'center' as const,
    minWidth: '100px',
  } as const,
  badgeTrue: {
    background: 'rgba(78, 205, 196, 0.3)',
    color: '#4ecdc4',
    border: '2px solid #4ecdc4',
  } as const,
  badgeFalse: {
    background: 'rgba(128, 128, 128, 0.2)',
    color: '#888',
    border: '2px solid #555',
  } as const,
  badgeFired: {
    background: 'rgba(255, 107, 107, 0.3)',
    color: '#ff6b6b',
    border: '2px solid #ff6b6b',
    animation: 'pulse 0.2s ease-in-out',
  } as const,
  statRow: { display: 'flex', gap: '8px', fontSize: '11px', marginTop: '8px' } as const,
  statLabel: { color: '#666', width: '80px' } as const,
  percentage: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginTop: '12px',
  } as const,
  percentageHigh: { color: '#4ecdc4' } as const,
  percentageLow: { color: '#888' } as const,
  bar: {
    width: '100%',
    height: '8px',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '4px',
    overflow: 'hidden' as const,
    marginTop: '8px',
  } as const,
  barFill: {
    height: '100%',
    background: '#4ecdc4',
    transition: 'width 0.2s ease',
  } as const,
};

/**
 * Render full scalar bool/event sample.
 */
function renderScalarFull(value: number, isEvent: boolean = false): React.ReactElement {
  const isTrueFired = value > 0.5;
  
  const badgeStyle = {
    ...styles.badgeLarge,
    ...(isTrueFired 
      ? (isEvent ? styles.badgeFired : styles.badgeTrue)
      : styles.badgeFalse
    ),
  };

  const label = isEvent
    ? (isTrueFired ? 'FIRED' : 'IDLE')
    : (isTrueFired ? 'TRUE' : 'FALSE');

  return (
    <div style={styles.container}>
      <div style={badgeStyle}>{label}</div>
      <div style={{ ...styles.statRow, color: '#666', marginTop: '8px' }}>
        raw value: {value.toFixed(3)}
      </div>
    </div>
  );
}

/**
 * Render aggregate bool/event field stats.
 */
function renderAggregateFull(stats: AggregateStats, isEvent: boolean = false): React.ReactElement {
  const meanValue = stats.mean[0];
  const percentageTrue = (meanValue * 100);
  const countTrue = Math.round(stats.count * meanValue);
  const countFalse = stats.count - countTrue;

  const percentageStyle = {
    ...styles.percentage,
    ...(percentageTrue > 50 ? styles.percentageHigh : styles.percentageLow),
  };

  const label = isEvent ? 'fired' : 'true';

  return (
    <div style={styles.container}>
      <div style={percentageStyle}>
        {percentageTrue.toFixed(1)}% {label}
      </div>

      <div style={styles.bar}>
        <div style={{ ...styles.barFill, width: `${percentageTrue}%` }} />
      </div>

      <div style={styles.statRow}>
        <span style={styles.statLabel}>Total count</span>
        <span>{stats.count}</span>
      </div>

      <div style={styles.statRow}>
        <span style={styles.statLabel}>{isEvent ? 'Fired' : 'True'}</span>
        <span style={{ color: '#4ecdc4' }}>{countTrue}</span>
      </div>

      <div style={styles.statRow}>
        <span style={styles.statLabel}>{isEvent ? 'Idle' : 'False'}</span>
        <span style={{ color: '#888' }}>{countFalse}</span>
      </div>

      <div style={styles.statRow}>
        <span style={styles.statLabel}>Min</span>
        <span>{stats.min[0].toFixed(3)}</span>
      </div>

      <div style={styles.statRow}>
        <span style={styles.statLabel}>Max</span>
        <span>{stats.max[0].toFixed(3)}</span>
      </div>
    </div>
  );
}

/**
 * Render inline bool/event (compact format).
 */
function renderInline(value: number, isEvent: boolean = false): React.ReactElement {
  const isTrueFired = value > 0.5;
  
  // Different symbols for bool vs event
  const symbol = isEvent
    ? (isTrueFired ? '●' : '○')  // Filled/empty circle for events
    : (isTrueFired ? '✓' : '✗'); // Check/X for bools

  const color = isTrueFired ? '#4ecdc4' : '#888';

  return (
    <span style={{ fontFamily: 'sans-serif', color, fontSize: '14px', fontWeight: 'bold' }}>
      {symbol}
    </span>
  );
}

/**
 * Bool value renderer (for discrete bool signals/fields).
 */
export const boolValueRenderer: ValueRenderer = {
  renderFull(sample: RendererSample): React.ReactElement {
    if (sample.type === 'scalar') {
      return renderScalarFull(sample.components[0], false);
    } else {
      return renderAggregateFull(sample.stats, false);
    }
  },

  renderInline(sample: RendererSample): React.ReactElement {
    const value = sample.type === 'scalar' ? sample.components[0] : sample.stats.mean[0];
    return renderInline(value, false);
  },
};

/**
 * Event value renderer (for event signals/fields).
 * Similar to bool but with different labels and styling.
 */
export const eventValueRenderer: ValueRenderer = {
  renderFull(sample: RendererSample): React.ReactElement {
    if (sample.type === 'scalar') {
      return renderScalarFull(sample.components[0], true);
    } else {
      return renderAggregateFull(sample.stats, true);
    }
  },

  renderInline(sample: RendererSample): React.ReactElement {
    const value = sample.type === 'scalar' ? sample.components[0] : sample.stats.mean[0];
    return renderInline(value, true);
  },
};
