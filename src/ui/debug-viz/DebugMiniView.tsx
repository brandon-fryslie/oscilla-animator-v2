/**
 * DebugMiniView - Hover-scoped debug value inspector.
 *
 * Shows the currently hovered edge/port value with type info,
 * micro-history sparkline, and aggregate stats for fields.
 *
 * Non-interactive: no clicking, no selection changes, no navigation.
 * Performance: O(1) render for signals (reads pre-computed HistoryView).
 */

import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../stores';
import { useDebugMiniView } from './useDebugMiniView';
import { getValueRenderer } from './ValueRenderer';
import { Sparkline } from './charts/Sparkline';
import { DistributionBar } from './charts/DistributionBar';
import { WarmupIndicator } from './charts/WarmupIndicator';
import type { RendererSample, AggregateStats, Stride } from './types';
import type { EdgeValueResult } from '../../services/DebugService';
import type { EdgeMetadata } from '../../services/mapDebugEdges';
import type { SignalType } from '../../core/canonical-types';

// Side-effect import: registers all renderers
import './renderers/register';

// =============================================================================
// Styles
// =============================================================================

const styles = {
  container: {
    maxWidth: '360px',
    maxHeight: '220px',
    overflow: 'hidden',
    padding: '8px 10px',
    fontFamily: 'monospace',
    fontSize: '11px',
    color: '#e0e0e0',
    background: '#1a1a2e',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  placeholder: {
    color: '#555',
    fontStyle: 'italic' as const,
    padding: '20px 0',
    textAlign: 'center' as const,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    overflow: 'hidden',
  },
  label: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    flex: 1,
    fontSize: '12px',
    color: '#ccc',
  },
  badge: {
    fontSize: '9px',
    padding: '1px 4px',
    borderRadius: '3px',
    background: 'rgba(78, 205, 196, 0.2)',
    color: '#4ecdc4',
    whiteSpace: 'nowrap' as const,
  },
  typeLine: {
    color: '#888',
    fontSize: '10px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  valueSection: {
    flex: 1,
    overflow: 'hidden',
  },
  storageLine: {
    color: '#555',
    fontSize: '9px',
    borderTop: '1px solid rgba(255,255,255,0.05)',
    paddingTop: '3px',
    marginTop: '2px',
  },
  sparklineContainer: {
    marginTop: '4px',
  },
  fieldStats: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  statRow: {
    display: 'flex',
    gap: '8px',
    fontSize: '11px',
  },
  statLabel: {
    color: '#666',
    width: '36px',
  },
};

// =============================================================================
// Helper Components
// =============================================================================

function formatTypeLine(type: SignalType, cardinality: 'signal' | 'field'): string {
  const unitKind = type.unit.kind;
  // PayloadType is an object with a 'kind' property (e.g., { kind: 'float', stride: 1 })
  const payloadKind = type.payload.kind;
  const payloadUnit = unitKind === 'none' || unitKind === 'scalar'
    ? payloadKind
    : `${payloadKind}:${unitKind}`;
  const card = cardinality === 'signal' ? 'one' : 'many';
  return `${payloadUnit} · ${card} · cont`;
}

function SignalValueSection({ value, meta, history }: {
  value: EdgeValueResult | null;
  meta: EdgeMetadata;
  history: { buffer: Float32Array; writeIndex: number; capacity: number; stride: 0 | 1 | 2 | 3 | 4; filled: boolean } | null;
}): React.ReactElement {
  const children: React.ReactElement[] = [];

  // Current value via renderer
  if (value && value.kind === 'signal') {
    const sample: RendererSample = {
      type: 'scalar',
      components: new Float32Array([value.value]),
      stride: 1,
    };
    const renderer = getValueRenderer(meta.type);
    children.push(
      React.createElement('div', { key: 'value' }, renderer.renderFull(sample))
    );
  } else {
    children.push(
      React.createElement('div', { key: 'value', style: { color: '#555' } }, 'awaiting value...')
    );
  }

  // Sparkline from history
  if (history) {
    const sampleCount = history.filled ? history.capacity : Math.min(history.writeIndex, history.capacity);
    children.push(
      React.createElement('div', { key: 'sparkline', style: styles.sparklineContainer },
        React.createElement(Sparkline, {
          history,
          width: 280,
          height: 30,
          unit: meta.type.unit.kind,
        })
      )
    );

    // Warmup indicator
    children.push(
      React.createElement('div', { key: 'warmup' },
        React.createElement(WarmupIndicator, {
          filled: sampleCount,
          capacity: history.capacity,
        })
      )
    );
  }

  return React.createElement('div', { style: styles.valueSection }, ...children);
}

function FieldValueSection({ value }: {
  value: EdgeValueResult | null;
}): React.ReactElement {
  if (!value || value.kind !== 'field') {
    if (value?.kind === 'field-untracked') {
      return React.createElement('div', { style: { color: '#555' } }, 'field: hover to inspect');
    }
    return React.createElement('div', { style: { color: '#555' } }, 'awaiting value...');
  }

  const stats: AggregateStats = {
    count: value.count,
    stride: 1 as Stride,
    min: new Float32Array([value.min, 0, 0, 0]),
    max: new Float32Array([value.max, 0, 0, 0]),
    mean: new Float32Array([value.mean, 0, 0, 0]),
  };

  return React.createElement('div', { style: styles.fieldStats },
    React.createElement('div', { style: styles.statRow },
      React.createElement('span', null, `N=${value.count}`)
    ),
    React.createElement('div', { style: styles.statRow },
      React.createElement('span', { style: styles.statLabel }, 'min'),
      React.createElement('span', null, value.min.toFixed(4)),
    ),
    React.createElement('div', { style: styles.statRow },
      React.createElement('span', { style: styles.statLabel }, 'mean'),
      React.createElement('span', null, value.mean.toFixed(4)),
    ),
    React.createElement('div', { style: styles.statRow },
      React.createElement('span', { style: styles.statLabel }, 'max'),
      React.createElement('span', null, value.max.toFixed(4)),
    ),
    React.createElement('div', { style: { marginTop: '4px' } },
      React.createElement(DistributionBar, { stats, width: 280 })
    )
  );
}

// =============================================================================
// Main Component
// =============================================================================

export const DebugMiniView: React.FC = observer(() => {
  const { debug, patch: patchStore } = useStores();
  const hoveredEdgeId = debug.hoveredEdgeId;

  // Resolve edge label from patch
  let edgeLabel: string | null = null;
  if (hoveredEdgeId && patchStore.patch) {
    const edge = patchStore.patch.edges.find(e => e.id === hoveredEdgeId);
    if (edge) {
      edgeLabel = `${edge.from.blockId}.${edge.from.slotId} → ${edge.to.blockId}.${edge.to.slotId}`;
    }
  }

  const data = useDebugMiniView(hoveredEdgeId, edgeLabel);

  if (!debug.enabled) {
    return React.createElement('div', { style: { ...styles.container, ...styles.placeholder } },
      'Debug disabled');
  }

  if (!data) {
    return React.createElement('div', { style: { ...styles.container, ...styles.placeholder } },
      'Hover an edge to inspect');
  }

  return React.createElement('div', { style: styles.container },
    // Header
    React.createElement('div', { style: styles.header },
      React.createElement('span', { style: styles.label }, data.label),
      React.createElement('span', { style: styles.badge },
        data.key.kind === 'edge' ? 'Edge' : 'Port')
    ),

    // Type line
    React.createElement('div', { style: styles.typeLine },
      formatTypeLine(data.meta.type, data.meta.cardinality)),

    // Value section
    data.meta.cardinality === 'signal'
      ? React.createElement(SignalValueSection, {
          value: data.value,
          meta: data.meta,
          history: data.history,
        })
      : React.createElement(FieldValueSection, {
          value: data.value,
        }),

    // Storage line
    React.createElement('div', { style: styles.storageLine },
      `Slot: ${data.meta.slotId}`)
  );
});
