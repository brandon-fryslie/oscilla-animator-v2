/**
 * OscillaEdge - Custom Edge Component
 *
 * Renders edges with visual indicators for:
 * - Lenses and adapters (amber badge)
 * - Errors and warnings (red/orange stroke)
 * - Debug hover state
 */

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from 'reactflow';
import React, { useEffect, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import type { OscillaEdgeData } from './nodes';
import { BasePopover, POPUP_SURFACE_STYLE, usePinPopoverState } from './BasePopover';
import type { Diagnostic } from '../../diagnostics/types';
import { useStores } from '../../stores';
import { useGraphEditor } from '../graphEditor/GraphEditorContext';
import { DecorationParamControls } from '../graphEditor/DecorationParamControls';
import type { EdgeRef } from '../graphEditor/edge-decorations';
import { graphColors } from '../graphEditor/graph-tokens';
import { useDebugMiniView, useDebugPortMiniView, type MiniViewData } from '../debug-viz/useDebugMiniView';
import type { HistoryView } from '../debug-viz/types';

/**
 * Extended edge data including diagnostics.
 */
export interface OscillaEdgeDataWithDiagnostics extends OscillaEdgeData {
  /** Diagnostics affecting this edge */
  diagnostics?: Diagnostic[];
}

interface LensImpactPreviewProps {
  beforeEdgeId: string | null;
  beforeBlockId: string | null;
  beforePortId: string | null;
  afterBlockId: string | null;
  afterPortId: string | null;
  beforeLabel: string;
  afterLabel: string;
}

interface DecorationPopoverContext {
  decorationId: string;
  decorationIndex: number;
  targetPortId: string;
}

interface ExtractedSeries {
  readonly samples: readonly number[];
  readonly latest: number | null;
}

function readHistorySamples(history: HistoryView): number[] {
  const count = history.filled ? history.capacity : Math.min(history.writeIndex, history.capacity);
  if (count <= 0) return [];

  const startIndex = history.filled ? history.writeIndex % history.capacity : 0;
  const series: number[] = new Array(count);

  // [LAW:dataflow-not-control-flow] Sample read path is identical for before/after series.
  for (let i = 0; i < count; i += 1) {
    const idx = (startIndex + i) % history.capacity;
    series[i] = history.buffer[idx];
  }
  return series;
}

function latestFiniteValue(values: readonly number[]): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const value = values[i];
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function extractComparableSeries(data: MiniViewData | null): ExtractedSeries {
  if (!data) {
    return { samples: [], latest: null };
  }

  const history = data.history ?? data.fieldInstanceHistory ?? null;
  if (history) {
    const samples = readHistorySamples(history);
    return {
      samples,
      latest: latestFiniteValue(samples),
    };
  }

  if (data.value?.kind === 'scalar') {
    return { samples: [], latest: data.value.value };
  }
  if (data.value?.kind === 'field') {
    return { samples: [], latest: data.value.stats.mean[0] ?? null };
  }
  return { samples: [], latest: null };
}

function formatNumber(value: number | null, digits = 4): string {
  if (value == null || !Number.isFinite(value)) return 'n/a';
  return value.toFixed(digits);
}

function buildPolylinePoints(
  samples: readonly number[],
  min: number,
  max: number,
  width: number,
  height: number,
): string {
  const finite = samples.filter((sample) => Number.isFinite(sample));
  if (finite.length < 2) return '';

  const range = Math.max(max - min, 1e-9);
  const lastIndex = samples.length - 1;

  return samples
    .map((value, index) => {
      if (!Number.isFinite(value)) return null;
      const x = lastIndex <= 0 ? width * 0.5 : (index / lastIndex) * width;
      const normalizedY = (value - min) / range;
      const y = height - normalizedY * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .filter((point): point is string => point != null)
    .join(' ');
}

function LensImpactPreview(props: LensImpactPreviewProps): React.ReactElement {
  const beforeEdgeData = useDebugMiniView(
    props.beforeEdgeId,
    props.beforeLabel,
  );
  const beforePortData = useDebugPortMiniView(
    props.beforeBlockId,
    props.beforePortId,
    props.beforeLabel,
  );
  const beforeData = beforeEdgeData ?? beforePortData;
  const afterData = useDebugPortMiniView(
    props.afterBlockId,
    props.afterPortId,
    props.afterLabel,
  );
  const beforeSeries = extractComparableSeries(beforeData);
  const afterSeries = extractComparableSeries(afterData);

  const combinedSamples = [...beforeSeries.samples, ...afterSeries.samples]
    .filter((sample) => Number.isFinite(sample));
  const hasChartData = combinedSamples.length >= 2;
  const minY = hasChartData ? Math.min(...combinedSamples) : 0;
  const maxY = hasChartData ? Math.max(...combinedSamples) : 1;

  const chartWidth = 380;
  const chartHeight = 120;
  const beforeLine = buildPolylinePoints(beforeSeries.samples, minY, maxY, chartWidth, chartHeight);
  const afterLine = buildPolylinePoints(afterSeries.samples, minY, maxY, chartWidth, chartHeight);

  const beforeValue = beforeSeries.latest;
  const afterValue = afterSeries.latest;
  const deltaValue = beforeValue != null && afterValue != null
    ? afterValue - beforeValue
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
          <span style={{ color: '#93a4b7' }}>Before</span>
          <span style={{ color: '#4ecdc4' }}>After</span>
        </div>
        <div style={{ color: '#9ca3af', fontSize: 10 }}>
          y-range: {formatNumber(minY, 3)} to {formatNumber(maxY, 3)}
        </div>
      </div>

      {hasChartData ? (
        <div
          style={{
            position: 'relative',
            width: chartWidth,
            height: chartHeight,
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 6,
            background: 'rgba(0,0,0,0.25)',
          }}
        >
          <svg width={chartWidth} height={chartHeight} style={{ display: 'block' }}>
            {beforeLine && (
              <polyline
                fill="none"
                stroke="rgba(148, 163, 184, 0.65)"
                strokeWidth={1.5}
                points={beforeLine}
              />
            )}
            {afterLine && (
              <polyline
                fill="none"
                stroke="#4ecdc4"
                strokeWidth={2}
                points={afterLine}
              />
            )}
          </svg>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: '#888' }}>
          History unavailable yet. Hover/select this edge briefly to warm up debug buffers.
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr auto',
          gap: 10,
          alignItems: 'baseline',
          fontFamily: 'monospace',
        }}
      >
        <div style={{ fontSize: 10, color: '#93a4b7' }}>
          before {formatNumber(beforeValue, 4)}
        </div>
        <div style={{ fontSize: 10, color: '#4ecdc4' }}>
          after {formatNumber(afterValue, 4)}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#f59e0b' }}>
          Δ {deltaValue == null ? 'n/a' : formatNumber(deltaValue, 4)}
        </div>
      </div>
    </div>
  );
}

/**
 * Determine edge stroke color based on diagnostics.
 */
function getEdgeStrokeColor(diagnostics?: Diagnostic[]): string {
  if (!diagnostics || diagnostics.length === 0) {
    return graphColors.edgeDefault;
  }

  const hasError = diagnostics.some(d => d.severity === 'error' || d.severity === 'fatal');
  const hasWarning = diagnostics.some(d => d.severity === 'warn');

  if (hasError) {
    return graphColors.edgeError;
  }

  if (hasWarning) {
    return graphColors.edgeWarning;
  }

  return graphColors.edgeDefault;
}

/**
 * Custom edge component for Oscilla connections.
 *
 * Features:
 * - Standard bezier edge path
 * - Error/warning indication (red/orange stroke)
 * - Amber lens indicator near target port when lenses are present
 * - Hover tooltip showing lens details or errors
 * - Preserves all existing edge styling (adapters, non-contributing)
 */
export const OscillaEdge = observer(function OscillaEdge(
  props: EdgeProps<OscillaEdgeDataWithDiagnostics>,
) {
  const {
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    data,
  } = props;
  const sourceHandle = (props as { sourceHandle?: string; sourceHandleId?: string }).sourceHandle
    ?? (props as { sourceHandleId?: string }).sourceHandleId
    ?? '';
  const targetHandle = (props as { targetHandle?: string; targetHandleId?: string }).targetHandle
    ?? (props as { targetHandleId?: string }).targetHandleId
    ?? '';
  const { selection, frontend, debug } = useStores();
  const { decorator } = useGraphEditor();
  const decoPopover = usePinPopoverState<DecorationPopoverContext>({
    isSame: (a, b) => a.decorationId === b.decorationId && a.targetPortId === b.targetPortId,
  });

  // Compute bezier path
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Determine stroke color based on diagnostics
  const strokeColor = getEdgeStrokeColor(data?.diagnostics);
  const hasDiagnostics = data?.diagnostics && data.diagnostics.length > 0;

  // Apply diagnostic styling
  const edgeStyle = {
    ...style,
    stroke: strokeColor,
    strokeWidth: hasDiagnostics ? 2.5 : (style.strokeWidth ?? 2),
  };

  // [LAW:one-way-deps] The former direct read of `patch.blocks…inputPorts…lenses`
  // is inverted: an edge's transform chain now comes from the neutral per-mount
  // `EdgeDecorator`, so this renderer holds no lens/era opinion and lights up for
  // both boots (V1 lenses, pillar transform chains) through one code path.
  const edgeRef: EdgeRef = {
    sourceBlockId: source,
    sourcePortId: sourceHandle,
    targetBlockId: target,
    targetPortId: targetHandle,
  };
  const decorations = decorator.decorations(edgeRef);
  const hasDecorations = decorations.length > 0;

  const adapterCount = useMemo(() => {
    if (!targetHandle) return 0;
    const provenance = frontend.getPortProvenanceByIds(target, targetHandle, 'in');
    if (!provenance || provenance.kind === 'unresolved') return 0;
    return provenance.chain.filter((step) => step.kind === 'adapter').length;
  }, [frontend, target, targetHandle]);

  const hasTransforms = hasDecorations || adapterCount > 0;

  // Compute position for lens indicator (near target port)
  // Place it at 90% along the edge path, biased toward the target
  const indicatorX = targetX * 0.9 + sourceX * 0.1;
  const indicatorY = targetY * 0.9 + sourceY * 0.1;

  // Build tooltip text
  let tooltipText = '';
  if (hasDiagnostics) {
    tooltipText = data!.diagnostics!
      .map(d => `${d.severity.toUpperCase()}: ${d.message}`)
      .join('\n');
  } else if (hasTransforms) {
    const labels = [
      ...decorations.map((deco) => deco.label),
      ...(adapterCount > 0 ? [`Adapters x${adapterCount}`] : []),
    ];
    tooltipText = labels.join(', ');
  }

  const decoContext = decoPopover.active?.data ?? null;
  const activeDecoration = decorations.find((deco) => deco.id === decoContext?.decorationId) ?? null;
  const activeTargetPortId = decoContext?.targetPortId ?? '';

  useEffect(() => {
    if (decoPopover.active) {
      debug.setHoveredLensEdge(id);
      return () => {
        if (debug.hoveredLensEdgeId === id) {
          debug.setHoveredLensEdge(null);
        }
      };
    }
    if (debug.hoveredLensEdgeId === id) {
      debug.setHoveredLensEdge(null);
    }
    return undefined;
  }, [decoPopover.active, debug, id]);

  return (
    <>
      {/* Main edge path */}
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={edgeStyle} />

      {/* Diagnostic indicator - REMOVED: Diagnostics now shown in port popovers */}
      {/* Edge color already indicates errors (red) and warnings (orange) */}

      {/* Transform indicator chips (lenses + adapters) */}
      {hasTransforms && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${indicatorX}px, ${indicatorY}px)`,
              pointerEvents: 'all',
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              zIndex: 20,
            }}
            onMouseEnter={() => {
              // [LAW:single-enforcer] Edge-popover suppression is controlled by one hover signal for the full transform chip cluster.
              debug.setHoveredLensEdge(id);
            }}
            onMouseLeave={() => {
              debug.setHoveredLensEdge(null);
            }}
            title={tooltipText}
          >
            {decorations.map((deco, decoIndex) => (
              <button
                key={deco.id}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  debug.markSuppressNextEdgePopoverPin();
                }}
                onMouseEnter={(event) => {
                  if (!targetHandle) return;
                  decoPopover.setHover({
                    data: {
                      decorationId: deco.id,
                      decorationIndex: decoIndex,
                      targetPortId: targetHandle,
                    },
                    anchorPosition: { top: event.clientY + 12, left: event.clientX + 12 },
                  });
                }}
                onMouseLeave={() => {
                  decoPopover.clearHover();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  selection.selectEdge(id);
                  if (!targetHandle) return;
                  const nextPosition = { top: event.clientY + 12, left: event.clientX + 12 };
                  // [LAW:single-enforcer] Click-pin capability is centralized in BasePopover; state remains local here.
                  decoPopover.togglePinned({
                    data: {
                      decorationId: deco.id,
                      decorationIndex: decoIndex,
                      targetPortId: targetHandle,
                    },
                    anchorPosition: nextPosition,
                  });
                }}
                style={{
                  minHeight: 26,
                  minWidth: 74,
                  borderRadius: 13,
                  background: deco.color,
                  border: '1px solid rgba(0,0,0,0.35)',
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#111',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '3px 9px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
                  cursor: 'pointer',
                  maxWidth: 160,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={`${deco.tooltip} (click: preview + edit)`}
              >
                {deco.label}
              </button>
            ))}

            {adapterCount > 0 && (
              <div
                onMouseDown={(event) => {
                  event.stopPropagation();
                  debug.markSuppressNextEdgePopoverPin();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  selection.selectEdge(id);
                }}
                style={{
                  height: 18,
                  borderRadius: 9,
                  background: 'rgba(255,165,0,0.16)',
                  border: '1px solid rgba(255,165,0,0.5)',
                  fontSize: 9,
                  fontWeight: 700,
                  color: '#fbbf24',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 6px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
                  cursor: 'pointer',
                }}
                title={`Adapters x${adapterCount}`}
              >
                A{adapterCount}
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}

      <BasePopover
        open={Boolean(decoPopover.active && activeDecoration && activeTargetPortId)}
        anchorPosition={decoPopover.active?.anchorPosition ?? null}
        interactive={decoPopover.interactive}
        onClose={() => {
          decoPopover.closeAll();
          debug.setHoveredLensEdge(null);
        }}
        paperStyle={{
          ...POPUP_SURFACE_STYLE,
          minWidth: 420,
          maxWidth: 620,
          padding: 14,
        }}
      >
        {activeDecoration && activeTargetPortId && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
              Transform: {activeDecoration.label}
            </div>

            <div
              style={{
                padding: 10,
                borderRadius: 8,
                border: '1px solid rgba(217, 119, 6, 0.35)',
                background: 'linear-gradient(135deg, rgba(22, 24, 30, 0.98) 0%, rgba(14, 16, 22, 0.98) 100%)',
              }}
            >
              <LensImpactPreview
                beforeEdgeId={decoContext?.decorationIndex === 0 ? id : null}
                beforeBlockId={decoContext?.decorationIndex === 0 ? null : target}
                beforePortId={decoContext?.decorationIndex === 0 ? null : activeTargetPortId}
                afterBlockId={target}
                afterPortId={activeTargetPortId}
                beforeLabel={decoContext?.decorationIndex === 0
                  ? `before · ${source}.${sourceHandle}`
                  : `before · ${target}.${activeTargetPortId}`}
                afterLabel={`after · ${target}.${activeTargetPortId}`}
              />
            </div>

            {decoPopover.mode === 'pinned' && (
              <DecorationParamControls
                params={activeDecoration.params}
                onChange={(paramId, value) =>
                  decorator.setParam(edgeRef, activeDecoration.id, paramId, value)
                }
                compact
              />
            )}
          </div>
        )}
      </BasePopover>
    </>
  );
});
