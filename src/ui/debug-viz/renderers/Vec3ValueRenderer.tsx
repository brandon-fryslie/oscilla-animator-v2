/**
 * Vec3ValueRenderer - 3D vector visualization with smart 2D-world detection.
 *
 * Shows vec3 values with:
 * - Scalar mode: X, Y, Z component display + 3D magnitude
 * - Aggregate mode (z-uniform): XY scatter extent diagram + "z (uniform)" label
 * - Aggregate mode (z-varying): Full XYZ per-component stats + magnitude
 * - Inline mode: compact "(x, y, z)" format
 *
 * // [LAW: dataflow-not-control-flow] The renderer always runs both paths —
 * isZUniform determines which layout is displayed, not whether code executes.
 */

import React from 'react';
import type { ValueRenderer } from '../ValueRenderer';
import type { RendererSample, AggregateStats } from '../types';
import { formatFloat, isInvalidFloat } from './formatFloat';

const styles = {
  container: { fontFamily: 'monospace', fontSize: '12px', color: '#e0e0e0' } as const,
  componentRow: { display: 'flex', gap: '12px', alignItems: 'baseline' } as const,
  component: { display: 'flex', flexDirection: 'column' as const, gap: '2px' } as const,
  componentLabel: { color: '#888', fontSize: '9px', textTransform: 'uppercase' as const } as const,
  componentValue: { fontSize: '14px', fontWeight: 'bold' } as const,
  magnitude: { color: '#aaa', fontSize: '11px', marginTop: '4px' } as const,
  statRow: { display: 'flex', gap: '8px', fontSize: '11px' } as const,
  statLabel: { color: '#666', width: '48px' } as const,
  countBadge: { color: '#666', fontSize: '10px', marginTop: '4px' } as const,
  invalidBadge: { color: '#ff4444', fontWeight: 'bold', fontSize: '12px' } as const,
  scatterBox: {
    width: '80px',
    height: '80px',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '4px',
    background: 'rgba(0,0,0,0.3)',
    position: 'relative' as const,
    marginTop: '4px',
  } as const,
  uniformZ: { color: '#4ecdc4', fontSize: '11px', marginTop: '4px' } as const,
};

/**
 * Calculate 3D magnitude.
 */
function magnitude3(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

/**
 * XY scatter extent diagram for aggregate z-uniform (2D world) data.
 * Shows extent rectangle, mean dot, and crosshair axes.
 */
function XYScatterDiagram({ stats }: { stats: AggregateStats }): React.ReactElement {
  const xMin = stats.min[0], xMax = stats.max[0];
  const yMin = stats.min[1], yMax = stats.max[1];
  const xMean = stats.mean[0], yMean = stats.mean[1];

  // Auto-scale: center on midpoint, symmetric range with 20% padding
  const xMid = (xMin + xMax) / 2;
  const yMid = (yMin + yMax) / 2;
  const xSpan = Math.max(xMax - xMin, 1e-6);
  const ySpan = Math.max(yMax - yMin, 1e-6);
  const halfRange = Math.max(xSpan, ySpan) / 2 * 1.2;

  // Map data coords to SVG [0, 80]
  const toSvgX = (v: number) => ((v - xMid) / (halfRange * 2) + 0.5) * 80;
  const toSvgY = (v: number) => (0.5 - (v - yMid) / (halfRange * 2)) * 80; // flip Y

  const rectX1 = toSvgX(xMin);
  const rectX2 = toSvgX(xMax);
  const rectY1 = toSvgY(yMax); // yMax maps to lower SVG Y (top of rect)
  const rectY2 = toSvgY(yMin);
  const meanSvgX = toSvgX(xMean);
  const meanSvgY = toSvgY(yMean);
  const centerSvgX = toSvgX(xMid);
  const centerSvgY = toSvgY(yMid);

  return (
    <div style={styles.scatterBox}>
      <svg width="80" height="80" style={{ position: 'absolute', inset: 0 }}>
        {/* Crosshair axes at data center */}
        <line x1={centerSvgX} y1="0" x2={centerSvgX} y2="80" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <line x1="0" y1={centerSvgY} x2="80" y2={centerSvgY} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

        {/* Extent rectangle */}
        <rect
          x={Math.min(rectX1, rectX2)}
          y={Math.min(rectY1, rectY2)}
          width={Math.abs(rectX2 - rectX1)}
          height={Math.abs(rectY2 - rectY1)}
          fill="rgba(78, 205, 196, 0.15)"
          stroke="rgba(78, 205, 196, 0.4)"
          strokeWidth="1"
        />

        {/* Mean position dot */}
        <circle cx={meanSvgX} cy={meanSvgY} r="3" fill="#4ecdc4" />
      </svg>
    </div>
  );
}

/**
 * Render full scalar vec3 sample.
 */
function renderScalarFull(components: Float32Array): React.ReactElement {
  const x = components.length > 0 ? components[0] : 0;
  const y = components.length > 1 ? components[1] : 0;
  const z = components.length > 2 ? components[2] : 0;

  if (isInvalidFloat(x) || isInvalidFloat(y) || isInvalidFloat(z)) {
    return <div style={styles.invalidBadge}>INVALID ({formatFloat(x)}, {formatFloat(y)}, {formatFloat(z)})</div>;
  }

  const mag = magnitude3(x, y, z);

  return (
    <div style={styles.container}>
      <div style={styles.componentRow}>
        <div style={styles.component}>
          <span style={styles.componentLabel}>x</span>
          <span style={styles.componentValue}>{formatFloat(x)}</span>
        </div>
        <div style={styles.component}>
          <span style={styles.componentLabel}>y</span>
          <span style={styles.componentValue}>{formatFloat(y)}</span>
        </div>
        <div style={styles.component}>
          <span style={styles.componentLabel}>z</span>
          <span style={styles.componentValue}>{formatFloat(z)}</span>
        </div>
      </div>
      <div style={styles.magnitude}>
        magnitude: {formatFloat(mag)}
      </div>
    </div>
  );
}

/**
 * Render aggregate vec3 field stats.
 *
 * // [LAW: dataflow-not-control-flow] isZUniform is a data value that selects
 * the layout — both branches compute, the uniform flag picks which renders.
 */
function renderAggregateFull(stats: AggregateStats): React.ReactElement {
  const isZUniform = stats.min[2] === stats.max[2];

  // Z-uniform layout: XY scatter + uniform z label + XY stats
  const zUniformLayout = (
    <div style={styles.container}>
      <div style={styles.countBadge}>N={stats.count}</div>
      <XYScatterDiagram stats={stats} />
      <div style={styles.uniformZ}>z (uniform): {formatFloat(stats.min[2])}</div>
      {/* XY per-component stats */}
      {(['X', 'Y'] as const).map((label, idx) => (
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
    </div>
  );

  // Z-varying layout: full XYZ stats + magnitude
  const avgMag = magnitude3(stats.mean[0], stats.mean[1], stats.mean[2]);
  const zVaryingLayout = (
    <div style={styles.container}>
      <div style={styles.countBadge}>N={stats.count}</div>
      {(['X', 'Y', 'Z'] as const).map((label, idx) => (
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
      <div style={styles.magnitude}>avg magnitude: {formatFloat(avgMag)}</div>
    </div>
  );

  return isZUniform ? zUniformLayout : zVaryingLayout;
}

/**
 * Render inline vec3 (compact format).
 */
function renderInline(components: Float32Array): React.ReactElement {
  const x = formatFloat(components.length > 0 ? components[0] : 0);
  const y = formatFloat(components.length > 1 ? components[1] : 0);
  const z = formatFloat(components.length > 2 ? components[2] : 0);
  return <span style={{ fontFamily: 'monospace', color: '#e0e0e0' }}>({x}, {y}, {z})</span>;
}

/**
 * Vec3 value renderer.
 */
export const vec3ValueRenderer: ValueRenderer = {
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
    // For aggregate, show mean values
    return renderInline(sample.stats.mean);
  },
};
