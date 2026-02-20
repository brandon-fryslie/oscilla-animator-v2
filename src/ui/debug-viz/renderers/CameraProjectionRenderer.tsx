/**
 * CameraProjectionRenderer - Enum badge for camera projection type.
 *
 * CameraProjection is a stride-1 float encoding an enum:
 * - 0 = orthographic
 * - 1 = perspective
 *
 * Shows:
 * - Scalar: Colored badge "ORTHOGRAPHIC" / "PERSPECTIVE"
 * - Aggregate: Percentage bar (% perspective) + count breakdown
 * - Inline: "ortho" / "persp"
 */

import React from 'react';
import type { ValueRenderer } from '../ValueRenderer';
import type { RendererSample, AggregateStats } from '../types';

const styles = {
  container: { fontFamily: 'monospace', fontSize: '12px', color: '#e0e0e0' } as const,
  badgeLarge: {
    display: 'inline-block',
    padding: '6px 14px',
    borderRadius: '6px',
    fontSize: '16px',
    fontWeight: 'bold',
    textAlign: 'center' as const,
  } as const,
  badgeOrtho: {
    background: 'rgba(66, 133, 244, 0.3)',
    color: '#4285f4',
    border: '2px solid #4285f4',
  } as const,
  badgePersp: {
    background: 'rgba(255, 179, 0, 0.3)',
    color: '#ffb300',
    border: '2px solid #ffb300',
  } as const,
  rawValue: { color: '#666', fontSize: '10px', marginTop: '6px' } as const,
  percentage: {
    fontSize: '20px',
    fontWeight: 'bold',
    marginTop: '8px',
  } as const,
  bar: {
    width: '100%',
    height: '8px',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '4px',
    overflow: 'hidden' as const,
    marginTop: '6px',
  } as const,
  barFill: {
    height: '100%',
    background: '#ffb300',
    transition: 'width 0.2s ease',
  } as const,
  statRow: { display: 'flex', gap: '8px', fontSize: '11px', marginTop: '4px' } as const,
  statLabel: { color: '#666', width: '80px' } as const,
  countBadge: { color: '#666', fontSize: '10px', marginTop: '4px' } as const,
};

/**
 * Determine projection type from float value.
 * 0 = orthographic, 1 = perspective. Threshold at 0.5.
 */
function isPerspective(value: number): boolean {
  return value > 0.5;
}

/**
 * Render full scalar camera projection sample.
 */
function renderScalarFull(value: number): React.ReactElement {
  const persp = isPerspective(value);
  const badgeStyle = {
    ...styles.badgeLarge,
    ...(persp ? styles.badgePersp : styles.badgeOrtho),
  };
  const label = persp ? 'PERSPECTIVE' : 'ORTHOGRAPHIC';

  return (
    <div style={styles.container}>
      <div style={badgeStyle}>{label}</div>
      <div style={styles.rawValue}>raw: {value.toFixed(3)}</div>
    </div>
  );
}

/**
 * Render aggregate camera projection field stats.
 * Shows percentage of perspective projections in the field.
 */
function renderAggregateFull(stats: AggregateStats): React.ReactElement {
  const meanValue = stats.mean[0];
  const percentPersp = meanValue * 100;
  const countPersp = Math.round(stats.count * meanValue);
  const countOrtho = stats.count - countPersp;

  const percColor = percentPersp > 50 ? '#ffb300' : '#4285f4';

  return (
    <div style={styles.container}>
      <div style={{ ...styles.percentage, color: percColor }}>
        {percentPersp.toFixed(1)}% perspective
      </div>

      <div style={styles.bar}>
        <div style={{ ...styles.barFill, width: `${percentPersp}%` }} />
      </div>

      <div style={styles.statRow}>
        <span style={styles.statLabel}>Total</span>
        <span>{stats.count}</span>
      </div>
      <div style={styles.statRow}>
        <span style={styles.statLabel}>Perspective</span>
        <span style={{ color: '#ffb300' }}>{countPersp}</span>
      </div>
      <div style={styles.statRow}>
        <span style={styles.statLabel}>Orthographic</span>
        <span style={{ color: '#4285f4' }}>{countOrtho}</span>
      </div>
    </div>
  );
}

/**
 * Camera projection value renderer.
 */
export const cameraProjectionRenderer: ValueRenderer = {
  renderFull(sample: RendererSample): React.ReactElement {
    if (sample.type === 'scalar') {
      return renderScalarFull(sample.components[0]);
    }
    return renderAggregateFull(sample.stats);
  },

  renderInline(sample: RendererSample): React.ReactElement {
    const value = sample.type === 'scalar' ? sample.components[0] : sample.stats.mean[0];
    const label = isPerspective(value) ? 'persp' : 'ortho';
    const color = isPerspective(value) ? '#ffb300' : '#4285f4';
    return <span style={{ fontFamily: 'monospace', color, fontWeight: 'bold' }}>{label}</span>;
  },
};
