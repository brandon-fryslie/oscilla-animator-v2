/**
 * FloatValueRenderer - Unit-aware float display.
 *
 * Handles all float variants (scalar, phase, normalized, ms, etc.)
 * with unit-specific decorations:
 * - norm01: range indicator, warn badge if out of [0,1]
 * - phase01: "phase" label
 * - scalar: no decoration
 * - Other units: unit label
 */

import React from 'react';
import type { ValueRenderer } from '../ValueRenderer';
import type { RendererSample, AggregateStats } from '../types';
import type { Unit } from '../../../core/canonical-types';
import { formatFloat, isInvalidFloat } from './formatFloat';

const styles = {
  container: { fontFamily: 'monospace', fontSize: '12px', color: '#e0e0e0' } as const,
  value: { fontSize: '16px', fontWeight: 'bold' } as const,
  invalidBadge: { color: '#ff4444', fontWeight: 'bold', fontSize: '14px' } as const,
  warnBadge: { color: '#ffaa00', fontSize: '10px', marginLeft: '4px' } as const,
  unitLabel: { color: '#888', fontSize: '10px', marginLeft: '4px' } as const,
  rangeIndicator: { color: '#666', fontSize: '10px', marginLeft: '4px' } as const,
  row: { display: 'flex', gap: '8px', alignItems: 'baseline' } as const,
  statRow: { display: 'flex', gap: '6px', alignItems: 'center', fontSize: '11px' } as const,
  statLabel: { color: '#666', width: '32px' } as const,
  countBadge: { color: '#666', fontSize: '10px', marginTop: '2px' } as const,
};

/** Unit kind to display label. */
function unitLabel(unit: Unit): string | null {
  switch (unit.kind) {
    case 'scalar': return null;
    case 'norm01': return null; // has range indicator instead
    case 'phase01': return 'phase';
    case 'radians': return 'rad';
    case 'degrees': return 'deg';
    case 'ms': return 'ms';
    case 'seconds': return 's';
    case 'count': return null;
    default: return unit.kind;
  }
}

interface FloatRendererProps {
  unit: Unit;
}

function renderScalarFull(value: number, props: FloatRendererProps): React.ReactElement {
  const children: React.ReactElement[] = [];

  if (isInvalidFloat(value)) {
    children.push(
      React.createElement('span', { key: 'val', style: styles.invalidBadge }, formatFloat(value))
    );
  } else {
    children.push(
      React.createElement('span', { key: 'val', style: { ...styles.container, ...styles.value } }, formatFloat(value))
    );
  }

  // Unit-specific decorations
  if (props.unit.kind === 'norm01') {
    children.push(
      React.createElement('span', { key: 'range', style: styles.rangeIndicator }, '[0, 1]')
    );
    if (!isInvalidFloat(value) && (value < 0 || value > 1)) {
      children.push(
        React.createElement('span', { key: 'warn', style: styles.warnBadge }, 'out of range')
      );
    }
  } else {
    const label = unitLabel(props.unit);
    if (label) {
      children.push(
        React.createElement('span', { key: 'unit', style: styles.unitLabel }, label)
      );
    }
  }

  return React.createElement('div', { style: { ...styles.container, ...styles.row } }, ...children);
}

function renderAggregateFull(stats: AggregateStats, props: FloatRendererProps): React.ReactElement {
  const rows: React.ReactElement[] = [];
  const labels = ['min', 'mean', 'max'] as const;
  const arrays = [stats.min, stats.mean, stats.max] as const;

  for (let i = 0; i < 3; i++) {
    const val = arrays[i][0];
    rows.push(
      React.createElement('div', { key: labels[i], style: styles.statRow },
        React.createElement('span', { style: styles.statLabel }, labels[i]),
        isInvalidFloat(val)
          ? React.createElement('span', { style: styles.invalidBadge }, formatFloat(val))
          : React.createElement('span', null, formatFloat(val))
      )
    );
  }

  const label = unitLabel(props.unit);
  rows.push(
    React.createElement('div', { key: 'meta', style: styles.countBadge },
      `n=${stats.count}${label ? ` ${label}` : ''}`)
  );

  return React.createElement('div', { style: styles.container }, ...rows);
}

function renderScalarInline(value: number, props: FloatRendererProps): React.ReactElement {
  const text = formatFloat(value);
  const label = unitLabel(props.unit);
  const display = label ? `${text} ${label}` : text;
  const style = isInvalidFloat(value)
    ? { ...styles.container, ...styles.invalidBadge }
    : styles.container;
  return React.createElement('span', { style }, display);
}

function renderAggregateInline(stats: AggregateStats, _props: FloatRendererProps): React.ReactElement {
  return React.createElement('span', { style: styles.container },
    `${formatFloat(stats.mean[0])} (n=${stats.count})`);
}

/**
 * Create a FloatValueRenderer bound to a specific unit.
 * Called during registration for each unit variant.
 */
export function createFloatValueRenderer(unit: Unit): ValueRenderer {
  const props: FloatRendererProps = { unit };

  return {
    renderFull(sample: RendererSample): React.ReactElement {
      if (sample.type === 'aggregate') {
        return renderAggregateFull(sample.stats, props);
      }
      return renderScalarFull(sample.components[0], props);
    },

    renderInline(sample: RendererSample): React.ReactElement {
      if (sample.type === 'aggregate') {
        return renderAggregateInline(sample.stats, props);
      }
      return renderScalarInline(sample.components[0], props);
    },
  };
}

/**
 * Default float renderer (unit:scalar).
 */
export const floatValueRenderer = createFloatValueRenderer({ kind: 'scalar' });
