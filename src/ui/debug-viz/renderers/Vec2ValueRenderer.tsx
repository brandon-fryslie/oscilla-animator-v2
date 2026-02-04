/**
 * Vec2ValueRenderer - 2D vector visualization.
 *
 * Shows vec2 values with:
 * - Full mode: Component display + magnitude + optional arrow diagram
 * - Inline mode: Compact "(x, y)" format
 * - Field aggregate: Per-component stats + magnitude distribution
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
  arrow: {
    width: '80px',
    height: '80px',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '4px',
    background: 'rgba(0,0,0,0.3)',
    position: 'relative' as const,
    marginTop: '8px',
  } as const,
  statRow: { display: 'flex', gap: '8px', fontSize: '11px' } as const,
  statLabel: { color: '#666', width: '48px' } as const,
  countBadge: { color: '#666', fontSize: '10px', marginTop: '4px' } as const,
  invalidBadge: { color: '#ff4444', fontWeight: 'bold', fontSize: '12px' } as const,
};

/**
 * Calculate magnitude of a 2D vector.
 */
function magnitude(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/**
 * Render a simple arrow diagram for vec2.
 * Arrow points from center to (x, y), scaled to fit the 80x80 box.
 */
function ArrowDiagram({ x, y }: { x: number; y: number }): React.ReactElement {
  const centerX = 40;
  const centerY = 40;
  const scale = 30; // Scale factor to fit in box
  const endX = centerX + x * scale;
  const endY = centerY - y * scale; // Flip Y for SVG coordinates

  // Calculate arrow head
  const angle = Math.atan2(-y, x); // Negative y for SVG coords
  const arrowSize = 4;
  const arrow1X = endX - arrowSize * Math.cos(angle - Math.PI / 6);
  const arrow1Y = endY + arrowSize * Math.sin(angle - Math.PI / 6);
  const arrow2X = endX - arrowSize * Math.cos(angle + Math.PI / 6);
  const arrow2Y = endY + arrowSize * Math.sin(angle + Math.PI / 6);

  return (
    <div style={styles.arrow}>
      <svg width="80" height="80" style={{ position: 'absolute', inset: 0 }}>
        {/* Axes */}
        <line x1="40" y1="0" x2="40" y2="80" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        <line x1="0" y1="40" x2="80" y2="40" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        
        {/* Vector arrow */}
        <line 
          x1={centerX} 
          y1={centerY} 
          x2={endX} 
          y2={endY} 
          stroke="#4ecdc4" 
          strokeWidth="2" 
        />
        
        {/* Arrow head */}
        <path 
          d={`M ${endX} ${endY} L ${arrow1X} ${arrow1Y} L ${arrow2X} ${arrow2Y} Z`}
          fill="#4ecdc4"
        />
        
        {/* Center dot */}
        <circle cx={centerX} cy={centerY} r="2" fill="rgba(255,255,255,0.3)" />
      </svg>
    </div>
  );
}

/**
 * Render full scalar vec2 sample.
 */
function renderScalarFull(components: Float32Array): React.ReactElement {
  const x = components[0];
  const y = components[1];
  
  // Check for invalid values
  if (isInvalidFloat(x) || isInvalidFloat(y)) {
    return <div style={styles.invalidBadge}>INVALID ({formatFloat(x)}, {formatFloat(y)})</div>;
  }

  const mag = magnitude(x, y);

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
      </div>
      <div style={styles.magnitude}>
        magnitude: {formatFloat(mag)}
      </div>
      {/* Only show arrow if magnitude is reasonable (not too close to zero, not too large) */}
      {mag > 0.001 && mag < 100 && <ArrowDiagram x={x} y={y} />}
    </div>
  );
}

/**
 * Render aggregate vec2 field stats.
 */
function renderAggregateFull(stats: AggregateStats): React.ReactElement {
  const xMean = stats.mean[0];
  const yMean = stats.mean[1];
  const xMin = stats.min[0];
  const yMin = stats.min[1];
  const xMax = stats.max[0];
  const yMax = stats.max[1];

  const avgMag = magnitude(xMean, yMean);

  return (
    <div style={styles.container}>
      <div style={styles.countBadge}>N={stats.count}</div>
      
      {/* X component stats */}
      <div style={styles.statRow}>
        <span style={styles.statLabel}>X min</span>
        <span>{formatFloat(xMin)}</span>
      </div>
      <div style={styles.statRow}>
        <span style={styles.statLabel}>X mean</span>
        <span>{formatFloat(xMean)}</span>
      </div>
      <div style={styles.statRow}>
        <span style={styles.statLabel}>X max</span>
        <span>{formatFloat(xMax)}</span>
      </div>

      {/* Y component stats */}
      <div style={styles.statRow}>
        <span style={styles.statLabel}>Y min</span>
        <span>{formatFloat(yMin)}</span>
      </div>
      <div style={styles.statRow}>
        <span style={styles.statLabel}>Y mean</span>
        <span>{formatFloat(yMean)}</span>
      </div>
      <div style={styles.statRow}>
        <span style={styles.statLabel}>Y max</span>
        <span>{formatFloat(yMax)}</span>
      </div>

      <div style={styles.magnitude}>
        avg magnitude: {formatFloat(avgMag)}
      </div>

      {/* Arrow for mean vector */}
      {avgMag > 0.001 && avgMag < 100 && <ArrowDiagram x={xMean} y={yMean} />}
    </div>
  );
}

/**
 * Render inline vec2 (compact format).
 */
function renderInline(components: Float32Array): React.ReactElement {
  const x = formatFloat(components[0]);
  const y = formatFloat(components[1]);
  return <span style={{ fontFamily: 'monospace', color: '#e0e0e0' }}>({x}, {y})</span>;
}

/**
 * Vec2 value renderer.
 */
export const vec2ValueRenderer: ValueRenderer = {
  renderFull(sample: RendererSample): React.ReactElement {
    if (sample.type === 'scalar') {
      return renderScalarFull(sample.components);
    } else {
      return renderAggregateFull(sample.stats);
    }
  },

  renderInline(sample: RendererSample): React.ReactElement {
    if (sample.type === 'scalar') {
      return renderInline(sample.components);
    } else {
      // For aggregate, show mean
      return renderInline(sample.stats.mean);
    }
  },
};
