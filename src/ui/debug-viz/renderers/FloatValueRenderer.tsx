/**
 * FloatValueRenderer - Unit-aware float display.
 *
 * Handles all float variants (scalar, phase, normalized, ms, etc.)
 * with unit-specific decorations:
 * - norm01: range indicator, warn badge if out of [0,1]
 * - phase01: "phase" label
 * - scalar: no decoration
 * - Other units: unit label
 *
 * Updated for structured UnitType (#18).
 */

import React from 'react';
import type { ValueRenderer } from '../ValueRenderer';
import type { RendererSample, AggregateStats } from '../types';
import type { UnitType } from '../../../core/canonical-types';
import { formatFloat, isInvalidFloat } from './formatFloat';

const styles = {
  container: { fontFamily: 'monospace', fontSize: '13px', color: '#e0e0e0', display: 'flex', flexDirection: 'column' as const, gap: '4px' } as const,
  valueRow: { display: 'flex', alignItems: 'baseline', gap: '6px' } as const,
  value: { fontSize: '20px', fontWeight: 'bold', color: '#4ecdc4' } as const,
  invalidBadge: { color: '#ef4444', fontWeight: 'bold', fontSize: '16px' } as const,
  warnBadge: { color: '#f59e0b', fontSize: '10px', padding: '2px 4px', borderRadius: '3px', background: 'rgba(245, 158, 11, 0.15)' } as const,
  unitLabel: { color: '#94a3b8', fontSize: '11px' } as const,
  rangeIndicator: { color: '#64748b', fontSize: '10px' } as const,
  statRow: { display: 'flex', gap: '12px', alignItems: 'center', fontSize: '11px' } as const,
  statLabel: { color: '#64748b', minWidth: '32px' } as const,
  statValue: { color: '#cbd5e1', fontFamily: 'monospace', fontSize: '12px' } as const,
  countBadge: { color: '#64748b', fontSize: '10px' } as const,
};

/**
 * Unit kind to display label.
 * Updated for structured units (#18).
 */
function unitLabel(unit: UnitType): string | null {
  switch (unit.kind) {
    case 'scalar':
    case 'none':
      return null;
    case 'count':
      return null;

    // Structured: angle
    case 'angle': {
      const angleUnit = (unit as Extract<UnitType, { kind: 'angle' }>).unit;
      switch (angleUnit) {
        case 'turns': return 'phase';
        case 'radians': return 'rad';
        case 'degrees': return 'deg';
      }
      return null;
    }

    // Structured: time
    case 'time': {
      const timeUnit = (unit as Extract<UnitType, { kind: 'time' }>).unit;
      switch (timeUnit) {
        case 'ms': return 'ms';
        case 'seconds': return 's';
      }
      return null;
    }

    // Structured: space
    case 'space': {
      const spaceUnit = unit as Extract<UnitType, { kind: 'space' }>;
      return `${spaceUnit.unit}${spaceUnit.dims}`;
    }

    // Structured: color
    case 'color': {
      return 'rgba';
    }

    default: {
      const _exhaustive: never = unit;
      return null;
    }
  }
}

interface FloatRendererProps {
  unit: UnitType;
}

function renderScalarFull(value: number, props: FloatRendererProps): React.ReactElement {
  const children: React.ReactElement[] = [];

  // Value with unit label
  const valueStyle = isInvalidFloat(value) ? styles.invalidBadge : styles.value;
  const formattedValue = formatFloat(value);
  const label = unitLabel(props.unit);

  children.push(
    React.createElement('div', { key: 'row', style: styles.valueRow },
      React.createElement('span', { style: valueStyle }, formattedValue),
      label && React.createElement('span', { style: styles.unitLabel }, label)
    )
  );

  // Return early if invalid
  if (isInvalidFloat(value)) {
    return React.createElement('div', { style: styles.container }, ...children);
  }

  // Unit-specific decorations
  if (false) {
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

  // Check for out-of-range warnings (phase should be 0-1)
  if (props.unit.kind === 'angle' && (props.unit as any).unit === 'turns') {
    if (value < 0 || value > 1) {
      children.push(
        React.createElement('div', { key: 'warn', style: styles.warnBadge }, '⚠ Out of range [0, 1]')
      );
    }
  }

  return React.createElement('div', { style: styles.container }, ...children);
}

function renderAggregateFull(stats: AggregateStats, props: FloatRendererProps): React.ReactElement {
  const min = stats.min[0];
  const max = stats.max[0];
  const mean = stats.mean[0];
  const { count } = stats;
  const label = unitLabel(props.unit);

  const rows: React.ReactElement[] = [];

  // Mean value (prominent display)
  rows.push(
    React.createElement('div', { key: 'mean', style: styles.valueRow },
      React.createElement('span', { style: { color: '#94a3b8', fontSize: '11px', minWidth: '40px' } }, 'Mean:'),
      React.createElement('span', { style: { ...styles.value, fontSize: '18px' } }, formatFloat(mean)),
      label && React.createElement('span', { style: styles.unitLabel }, label)
    )
  );

  // Range display
  rows.push(
    React.createElement('div', { key: 'range', style: { ...styles.statRow, marginTop: '4px' } },
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column' as const, gap: '2px', flex: 1 } },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between' } },
          React.createElement('span', { style: { color: '#64748b', fontSize: '10px' } }, 'Min'),
          React.createElement('span', { style: { color: '#64748b', fontSize: '10px' } }, 'Max')
        ),
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between' } },
          React.createElement('span', { style: { color: '#60a5fa', fontFamily: 'monospace', fontSize: '11px' } }, formatFloat(min)),
          React.createElement('span', { style: { color: '#f472b6', fontFamily: 'monospace', fontSize: '11px' } }, formatFloat(max))
        )
      )
    )
  );

  // Count
  rows.push(
    React.createElement('div', { key: 'count', style: { ...styles.countBadge, marginTop: '4px' } }, `${count} instances`)
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
export function createFloatValueRenderer(unit: UnitType): ValueRenderer {
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
