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
import { useDebugMiniView, type MiniViewData } from './useDebugMiniView';
import { getValueRenderer } from './ValueRenderer';
import { Sparkline } from './charts/Sparkline';
import { DistributionBar } from './charts/DistributionBar';
import { WarmupIndicator } from './charts/WarmupIndicator';
import type { RendererSample, AggregateStats, Stride } from './types';
import type { EdgeValueResult } from '../../services/DebugService';
import type { EdgeMetadata } from '../../services/mapDebugEdges';
import type { CanonicalType } from '../../core/canonical-types';

// Side-effect import: registers all renderers
import './renderers/register';

// =============================================================================
// Styles (exported for reuse by EdgeInspector)
// =============================================================================

export const debugMiniViewStyles = {
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
// Helper Functions
// =============================================================================

/**
 * Convert reason code to human-readable label.
 */
function getReasonLabel(reason: string): string {
  switch (reason) {
    case 'block-eliminated':
      return '⚠️ Block Eliminated During Optimization';
    case 'port-not-found':
      return '⚠️ Port Not Found in Debug Index';
    case 'slot-not-allocated':
      return '⚠️ No Runtime Slot Allocated';
    case 'debug-index-missing':
      return '❌ Debug Index Missing';
    default:
      return '❓ Unknown Reason';
  }
}

// =============================================================================
// Helper Components
// =============================================================================

export function formatTypeLine(type: CanonicalType, cardinality: 'signal' | 'field'): string {
  const unitKind = type.unit.kind;
  // PayloadType is an object with a 'kind' property (e.g., { kind: 'float', stride: 1 })
  const payloadKind = type.payload.kind;
  const payloadUnit = unitKind === 'none'
    ? payloadKind
    : `${payloadKind}:${unitKind}`;
  const card = cardinality === 'signal' ? 'one' : 'many';
  return `${payloadUnit} · ${card} · cont`;
}

export function SignalValueSection({ value, meta, history }: {
  value: EdgeValueResult | null;
  meta: EdgeMetadata;
  history: { buffer: Float32Array; writeIndex: number; capacity: number; stride: 0 | 1 | 2 | 3 | 4; filled: boolean } | null;
}): React.ReactElement {
  const children: React.ReactElement[] = [];

  // Handle constant values (compile-time constants)
  if (value && value.kind === 'constant') {
    const renderer = getValueRenderer(value.type);
    children.push(
      React.createElement('div', { key: 'constant-badge', style: { ...debugMiniViewStyles.badge, background: 'rgba(255, 165, 0, 0.3)', color: '#ffa500', marginBottom: '6px' } },
        '📌 Compile-Time Constant'
      )
    );
    
    if (renderer) {
      const sample: RendererSample = {
        type: 'scalar',
        components: new Float32Array([value.value as number]),
        stride: 1,
      };
      children.push(
        React.createElement('div', { key: 'value' }, renderer.renderFull(sample))
      );
    } else {
      children.push(
        React.createElement('div', { key: 'value', style: { fontSize: '16px', color: '#ffa500' } }, String(value.value))
      );
    }
    
    children.push(
      React.createElement('div', { key: 'description', style: { ...debugMiniViewStyles.typeLine, marginTop: '6px', color: '#999' } },
        value.description
      )
    );
    
    return React.createElement('div', { style: debugMiniViewStyles.valueSection }, ...children);
  }

  // Current value via renderer (runtime signal)
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
      React.createElement('div', { key: 'sparkline', style: debugMiniViewStyles.sparklineContainer },
        React.createElement(Sparkline, {
          history,
          width: 280,
          height: 30,
          unit: meta.type.unit,
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

  return React.createElement('div', { style: debugMiniViewStyles.valueSection }, ...children);
}

export function FieldValueSection({ value }: {
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

  return React.createElement('div', { style: debugMiniViewStyles.fieldStats },
    React.createElement('div', { style: debugMiniViewStyles.statRow },
      React.createElement('span', null, `N=${value.count}`)
    ),
    React.createElement('div', { style: debugMiniViewStyles.statRow },
      React.createElement('span', { style: debugMiniViewStyles.statLabel }, 'min'),
      React.createElement('span', null, value.min.toFixed(4)),
    ),
    React.createElement('div', { style: debugMiniViewStyles.statRow },
      React.createElement('span', { style: debugMiniViewStyles.statLabel }, 'mean'),
      React.createElement('span', null, value.mean.toFixed(4)),
    ),
    React.createElement('div', { style: debugMiniViewStyles.statRow },
      React.createElement('span', { style: debugMiniViewStyles.statLabel }, 'max'),
      React.createElement('span', null, value.max.toFixed(4)),
    ),
    React.createElement('div', { style: { marginTop: '4px' } },
      React.createElement(DistributionBar, { stats, width: 280 })
    )
  );
}

// =============================================================================
// Reusable Debug Value Display
// =============================================================================

/**
 * DebugEdgeValueDisplay - Renders debug value data without any store dependencies.
 * Accepts MiniViewData as props, making it reusable in both hover and inspector contexts.
 */
export function DebugEdgeValueDisplay({ data }: { data: MiniViewData }): React.ReactElement {
  return React.createElement('div', { style: debugMiniViewStyles.container },
    // Header
    React.createElement('div', { style: debugMiniViewStyles.header },
      React.createElement('span', { style: debugMiniViewStyles.label }, data.label),
      React.createElement('span', { style: debugMiniViewStyles.badge },
        data.key.kind === 'edge' ? 'Edge' : 'Port')
    ),

    // Type line
    React.createElement('div', { style: debugMiniViewStyles.typeLine },
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
    React.createElement('div', { style: debugMiniViewStyles.storageLine },
      `Slot: ${data.meta.slotId}`)
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
    return React.createElement('div', { style: { ...debugMiniViewStyles.container, ...debugMiniViewStyles.placeholder } },
      'Debug disabled');
  }

  if (!data) {
    // Check if this edge is unmapped
    const { debug: debugStore } = useStores();
    const status = debugStore.status;
    
    if (hoveredEdgeId && status) {
      const unmapped = status.unmappedEdges.find((e: any) => e.edgeId === hoveredEdgeId);
      if (unmapped) {
        return React.createElement('div', { style: { ...debugMiniViewStyles.container, maxHeight: '300px' } },
          React.createElement('div', { style: { ...debugMiniViewStyles.header, color: '#ff6b6b' } },
            React.createElement('span', { style: debugMiniViewStyles.label }, `Edge not mapped`),
            React.createElement('span', { style: { ...debugMiniViewStyles.badge, background: 'rgba(255, 107, 107, 0.3)', color: '#ff6b6b' } }, 'Unmapped')
          ),
          React.createElement('div', { style: { ...debugMiniViewStyles.typeLine, marginTop: '8px' } },
            `${unmapped.fromBlockId}.${unmapped.fromPort} → ${unmapped.toBlockId}.${unmapped.toPort}`
          ),
          React.createElement('div', { style: { marginTop: '12px', fontSize: '12px' } },
            React.createElement('div', { style: { color: '#ffaa00', marginBottom: '6px', fontWeight: 'bold' } }, 
              getReasonLabel(unmapped.reason)
            ),
            unmapped.details && React.createElement('div', { style: { color: '#aaa', fontSize: '11px', lineHeight: '1.4' } },
              unmapped.details
            )
          ),
          React.createElement('div', { style: { ...debugMiniViewStyles.storageLine, marginTop: '12px', color: '#666' } },
            'This edge was not mapped to a runtime slot during compilation. The value cannot be inspected.'
          )
        );
      }
    }
    
    return React.createElement('div', { style: { ...debugMiniViewStyles.container, ...debugMiniViewStyles.placeholder } },
      'Hover an edge to inspect');
  }

  return React.createElement(DebugEdgeValueDisplay, { data });
});
