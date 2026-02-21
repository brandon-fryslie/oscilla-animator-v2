/**
 * DebugMiniView - Hover-scoped debug value inspector.
 *
 * Shows the currently hovered edge/port value with type info,
 * micro-history sparkline, and aggregate stats for fields.
 *
 * Non-interactive: no clicking, no selection changes, no navigation.
 * Performance: O(1) render for signals (reads pre-computed HistoryView).
 */

import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../stores';
import { useDebugMiniView, type MiniViewData } from './useDebugMiniView';
import { getValueRenderer } from './ValueRenderer';
import { Sparkline } from './charts/Sparkline';
import { DistributionBar } from './charts/DistributionBar';
import { WarmupIndicator } from './charts/WarmupIndicator';
import { ColorPalette } from './charts/ColorPalette';
import { FieldBandChart } from './charts/FieldBandChart';
import { RasterHeatmap } from './charts/RasterHeatmap';
import { selectFieldCharts, type FieldChartId } from './vizSelector';
import { ChartHelpButton } from './charts/ChartHelpButton';
import type { HelpTopicId } from '../../help/types';
import type { RendererSample, AggregateStats, HistoryView, BufferHistoryView, Stride, FieldHistoryView } from './types';
import type { EdgeValueResult } from '../../services/DebugService';
import type { EdgeMetadata } from '../../services/mapDebugEdges';
import type { CanonicalType } from '../../core/canonical-types';
import { payloadStride, requireInst } from '../../core/canonical-types';

// Side-effect import: registers all renderers
import './renderers/register';

// =============================================================================
// Styles (exported for reuse by EdgeInspector)
// =============================================================================

export const debugMiniViewStyles = {
  container: {
    maxWidth: '360px',
    maxHeight: '340px',
    overflow: 'auto',
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

export function formatTypeLine(type: CanonicalType): string {
  const unitKind = type.unit.kind;
  // PayloadType is an object with a 'kind' property (e.g., { kind: 'float', stride: 1 })
  const payloadKind = type.payload.kind;
  const payloadUnit = unitKind === 'none'
    ? payloadKind
    : `${payloadKind}:${unitKind}`;
  const card = requireInst(type.extent.cardinality, 'cardinality').kind;
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
  if (value && value.kind === 'scalar') {
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
      React.createElement('div', { key: 'sparkline-label', style: chartLabelRowStyle },
        React.createElement('span', { style: chartLabelTextStyle }, 'sparkline'),
        React.createElement(ChartHelpButton, { topicId: 'viz-sparkline' }),
      )
    );
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

export function FieldValueSection({ value, meta, fieldHistory, fieldInstanceHistory, fieldBufferHistory }: {
  value: EdgeValueResult | null;
  meta: EdgeMetadata;
  fieldHistory: FieldHistoryView | null;
  fieldInstanceHistory: HistoryView | null;
  fieldBufferHistory: BufferHistoryView | null;
}): React.ReactElement {
  if (!value || value.kind !== 'field') {
    if (value?.kind === 'field-untracked') {
      return React.createElement('div', { style: { color: '#555' } }, 'field: hover to inspect');
    }
    return React.createElement('div', { style: { color: '#555' } }, 'awaiting value...');
  }

  const { stats, buffer } = value;
  const stride = payloadStride(meta.type.payload) as Stride;
  const laneCount = stride > 0 ? buffer.length / stride : 0;
  const children: React.ReactElement[] = [];

  // Value display (always shown before charts)
  const isColor = meta.type.payload.kind === 'color';
  if (isColor) {
    // Mean swatch + hex reference
    const meanR = stats.mean[0], meanG = stats.mean[1], meanB = stats.mean[2], meanA = stats.mean[3];
    const hex = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
    const hexStr = `#${hex(meanR)}${hex(meanG)}${hex(meanB)}`;
    const rgba = `rgba(${Math.round(meanR * 255)}, ${Math.round(meanG * 255)}, ${Math.round(meanB * 255)}, ${meanA})`;

    children.push(
      React.createElement('div', { key: 'mean-ref', style: { display: 'flex', alignItems: 'center', gap: '6px' } },
        React.createElement('div', {
          style: {
            width: '14px', height: '14px', borderRadius: '2px',
            border: '1px solid rgba(255,255,255,0.2)',
            background: rgba, position: 'relative' as const,
          },
        }),
        React.createElement('span', { style: { color: '#aaa', fontSize: '11px', fontFamily: 'monospace' } }, `mean: ${hexStr}`),
      )
    );
  } else {
    // Numeric: renderer with aggregate sample
    const aggStats: AggregateStats = {
      count: stats.count,
      stride: stats.stride,
      min: stats.min,
      max: stats.max,
      mean: stats.mean,
    };
    const renderer = getValueRenderer(meta.type);
    const sample: RendererSample = { type: 'aggregate', stats: aggStats };
    children.push(
      React.createElement('div', { key: 'renderer' }, renderer.renderFull(sample))
    );
  }

  // Charts (from viz selector)
  const charts = selectFieldCharts({
    payloadKind: meta.type.payload.kind,
    stride,
    instanceCount: laneCount,
  });

  for (const chartId of charts) {
    const el = renderFieldChart(chartId, {
      buffer, laneCount, meta, fieldHistory, fieldInstanceHistory, fieldBufferHistory,
    });
    if (el) children.push(el);
  }

  // Count badge (always)
  children.push(
    React.createElement('div', { key: 'count', style: { color: '#666', fontSize: '10px', fontFamily: 'monospace' } },
      `N=${stats.count}`)
  );

  return React.createElement('div', { style: debugMiniViewStyles.fieldStats }, ...children);
}

// =============================================================================
// Chart-to-Help-Topic Mapping (compile-time exhaustive via satisfies)
// =============================================================================

const CHART_HELP_TOPIC: Record<FieldChartId, HelpTopicId> = {
  'color-palette': 'viz-color-palette',
  'instance-sparkline': 'viz-sparkline',
  'raster-heatmap': 'viz-raster-heatmap',
  'band-chart': 'viz-band-chart',
} satisfies Record<FieldChartId, HelpTopicId>;

const CHART_LABELS: Record<FieldChartId, string> = {
  'color-palette': 'palette',
  'instance-sparkline': 'sparkline',
  'raster-heatmap': 'heatmap',
  'band-chart': 'band',
};

const chartLabelRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: '4px',
};

const chartLabelTextStyle: React.CSSProperties = {
  fontSize: '9px',
  color: '#555',
  fontFamily: 'monospace',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

// =============================================================================
// Chart Rendering Dispatch
// =============================================================================

interface ChartRenderContext {
  buffer: Float32Array;
  laneCount: number;
  meta: EdgeMetadata;
  fieldHistory: FieldHistoryView | null;
  fieldInstanceHistory: HistoryView | null;
  fieldBufferHistory: BufferHistoryView | null;
}

function chartLabelRow(chartId: FieldChartId): React.ReactElement {
  return React.createElement('div', { style: chartLabelRowStyle },
    React.createElement('span', { style: chartLabelTextStyle }, CHART_LABELS[chartId]),
    React.createElement(ChartHelpButton, { topicId: CHART_HELP_TOPIC[chartId] }),
  );
}

function renderFieldChart(
  chartId: FieldChartId,
  ctx: ChartRenderContext,
): React.ReactElement | null {
  switch (chartId) {
    case 'color-palette':
      return React.createElement('div', { key: 'color-palette' },
        chartLabelRow(chartId),
        React.createElement(ColorPalette, {
          buffer: ctx.buffer,
          count: ctx.laneCount,
          width: 280,
          height: 24,
        })
      );

    case 'instance-sparkline':
      return ctx.fieldInstanceHistory
        ? React.createElement('div', { key: 'instance-sparkline', style: debugMiniViewStyles.sparklineContainer },
            chartLabelRow(chartId),
            React.createElement(Sparkline, {
              history: ctx.fieldInstanceHistory,
              width: 280,
              height: 30,
              unit: ctx.meta.type.unit,
            })
          )
        : null;

    case 'raster-heatmap':
      return ctx.fieldBufferHistory
        ? React.createElement('div', { key: 'raster-heatmap', style: { marginTop: '4px' } },
            chartLabelRow(chartId),
            React.createElement(RasterHeatmap, {
              history: ctx.fieldBufferHistory,
              width: 280,
              height: 40,
            })
          )
        : null;

    case 'band-chart':
      return ctx.fieldHistory
        ? React.createElement('div', { key: 'band-chart', style: { marginTop: '4px' } },
            chartLabelRow(chartId),
            React.createElement(FieldBandChart, {
              history: ctx.fieldHistory,
              width: 280,
              height: 40,
            })
          )
        : null;
  }
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
      formatTypeLine(data.meta.type)),

    // Value section
    requireInst(data.meta.type.extent.cardinality, 'cardinality').kind === 'one'
      ? React.createElement(SignalValueSection, {
          value: data.value,
          meta: data.meta,
          history: data.history,
        })
      : React.createElement(FieldValueSection, {
          value: data.value,
          meta: data.meta,
          fieldHistory: data.fieldHistory,
          fieldInstanceHistory: data.fieldInstanceHistory,
          fieldBufferHistory: data.fieldBufferHistory,
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
  const { debug, selection, patch: patchStore } = useStores();

  // Sync SelectionStore.selectedEdgeId → DebugStore.selectedDebugEdgeId
  const selectedEdgeId = selection.selectedEdgeId;
  useEffect(() => {
    debug.setSelectedDebugEdge(selectedEdgeId);
  }, [selectedEdgeId, debug]);

  // Active edge: hover takes priority over selection
  const activeEdgeId = debug.activeEdgeId;

  // Resolve edge label from patch
  let edgeLabel: string | null = null;
  if (activeEdgeId && patchStore.patch) {
    const edge = patchStore.patch.edges.find(e => e.id === activeEdgeId);
    if (edge) {
      edgeLabel = `${edge.from.blockId}.${edge.from.slotId} → ${edge.to.blockId}.${edge.to.slotId}`;
    }
  }

  const data = useDebugMiniView(activeEdgeId, edgeLabel);

  if (!debug.enabled) {
    return React.createElement('div', { style: { ...debugMiniViewStyles.container, ...debugMiniViewStyles.placeholder } },
      'Debug disabled');
  }

  if (!data) {
    // Check if this edge is unmapped
    const status = debug.status;

    if (activeEdgeId && status) {
      const unmapped = status.unmappedEdges.find((e: any) => e.edgeId === activeEdgeId);
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
      'Hover or select an edge to inspect');
  }

  return React.createElement(DebugEdgeValueDisplay, { data });
});
