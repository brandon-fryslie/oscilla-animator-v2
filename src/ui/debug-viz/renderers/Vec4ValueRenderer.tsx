/**
 * Vec4ValueRenderer - 4D vector visualization.
 *
 * Shows vec4 values with:
 * - Scalar mode: X, Y, Z, W component display + 4D magnitude
 * - Aggregate mode: Per-component min/mean/max stats + count
 * - Inline mode: compact "(x, y, z, w)" format
 *
 * No spatial visualization — vec4 semantics are domain-specific
 * (could be RGBA, quaternion, homogeneous coords, etc.).
 */

import React from 'react';
import type { ValueRenderer } from '../ValueRenderer';
import type { RendererSample, AggregateStats } from '../types';
import { formatFloat, isInvalidFloat } from './formatFloat';

const styles = {
  container: { fontFamily: 'monospace', fontSize: '12px', color: '#e0e0e0' } as const,
  componentRow: { display: 'flex', gap: '10px', alignItems: 'baseline' } as const,
  component: { display: 'flex', flexDirection: 'column' as const, gap: '2px' } as const,
  componentLabel: { color: '#888', fontSize: '9px', textTransform: 'uppercase' as const } as const,
  componentValue: { fontSize: '14px', fontWeight: 'bold' } as const,
  magnitude: { color: '#aaa', fontSize: '11px', marginTop: '4px' } as const,
  statRow: { display: 'flex', gap: '8px', fontSize: '11px' } as const,
  statLabel: { color: '#666', width: '48px' } as const,
  countBadge: { color: '#666', fontSize: '10px', marginTop: '4px' } as const,
  invalidBadge: { color: '#ff4444', fontWeight: 'bold', fontSize: '12px' } as const,
};

const COMPONENT_LABELS = ['X', 'Y', 'Z', 'W'] as const;

/**
 * Calculate 4D magnitude.
 */
function magnitude4(x: number, y: number, z: number, w: number): number {
  return Math.sqrt(x * x + y * y + z * z + w * w);
}

/**
 * Render full scalar vec4 sample.
 */
function renderScalarFull(components: Float32Array): React.ReactElement {
  const x = components.length > 0 ? components[0] : 0;
  const y = components.length > 1 ? components[1] : 0;
  const z = components.length > 2 ? components[2] : 0;
  const w = components.length > 3 ? components[3] : 0;

  if (isInvalidFloat(x) || isInvalidFloat(y) || isInvalidFloat(z) || isInvalidFloat(w)) {
    return <div style={styles.invalidBadge}>INVALID ({formatFloat(x)}, {formatFloat(y)}, {formatFloat(z)}, {formatFloat(w)})</div>;
  }

  const mag = magnitude4(x, y, z, w);

  return (
    <div style={styles.container}>
      <div style={styles.componentRow}>
        {[x, y, z, w].map((val, idx) => (
          <div key={COMPONENT_LABELS[idx]} style={styles.component}>
            <span style={styles.componentLabel}>{COMPONENT_LABELS[idx].toLowerCase()}</span>
            <span style={styles.componentValue}>{formatFloat(val)}</span>
          </div>
        ))}
      </div>
      <div style={styles.magnitude}>
        magnitude: {formatFloat(mag)}
      </div>
    </div>
  );
}

/**
 * Render aggregate vec4 field stats.
 */
function renderAggregateFull(stats: AggregateStats): React.ReactElement {
  return (
    <div style={styles.container}>
      <div style={styles.countBadge}>N={stats.count}</div>
      {COMPONENT_LABELS.map((label, idx) => (
        <React.Fragment key={label}>
          <div style={styles.statRow}>
            <span style={styles.statLabel}>{label} min</span>
            <span>{formatFloat(stats.min[idx])}</span>
          </div>
          <div style={styles.statRow}>
            <span style={styles.statLabel}>{label} mean</span>
            <span>{formatFloat(stats.mean[idx])}</span>
          </div>
          <div style={styles.statRow}>
            <span style={styles.statLabel}>{label} max</span>
            <span>{formatFloat(stats.max[idx])}</span>
          </div>
        </React.Fragment>
      ))}
      <div style={styles.magnitude}>
        avg magnitude: {formatFloat(magnitude4(stats.mean[0], stats.mean[1], stats.mean[2], stats.mean[3]))}
      </div>
    </div>
  );
}

/**
 * Render inline vec4 (compact format).
 */
function renderInline(components: Float32Array): React.ReactElement {
  const x = formatFloat(components.length > 0 ? components[0] : 0);
  const y = formatFloat(components.length > 1 ? components[1] : 0);
  const z = formatFloat(components.length > 2 ? components[2] : 0);
  const w = formatFloat(components.length > 3 ? components[3] : 0);
  return <span style={{ fontFamily: 'monospace', color: '#e0e0e0' }}>({x}, {y}, {z}, {w})</span>;
}

/**
 * Vec4 value renderer.
 */
export const vec4ValueRenderer: ValueRenderer = {
  renderFull(sample: RendererSample): React.ReactElement {
    if (sample.type === 'scalar') {
      return renderScalarFull(sample.components);
    }
    return renderAggregateFull(sample.stats);
  },

  renderInline(sample: RendererSample): React.ReactElement {
    if (sample.type === 'scalar') {
      return renderInline(sample.components);
    }
    return renderInline(sample.stats.mean);
  },
};
