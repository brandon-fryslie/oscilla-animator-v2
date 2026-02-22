/**
 * useDebugMiniView - Reactive hook for DebugMiniView data.
 *
 * Reads DebugStore.hoveredEdgeId, resolves edge metadata, value, and
 * history from DebugService/HistoryService. Polls at 4Hz for responsiveness.
 *
 * Returns null when nothing is hovered.
 */

import { useState, useEffect } from 'react';
import { debugService, type EdgeValueResult } from '../../services/DebugService';
import type { EdgeMetadata } from '../../services/mapDebugEdges';
import { requireInst } from '../../core/canonical-types';
import type { DebugTargetKey, HistoryView, BufferHistoryView, FieldHistoryView } from './types';
import type { TrackedEntry } from './HistoryService';

/** Poll interval for value updates (ms). */
const POLL_INTERVAL_MS = 250;

/**
 * Resolved data for the DebugMiniView to render.
 */
export interface MiniViewData {
  /** The debug target key being observed */
  key: DebugTargetKey;
  /** Display label for the edge (e.g., "LFO.out → Gain.mod") */
  label: string;
  /** Edge metadata (type, cardinality, slotId) */
  meta: EdgeMetadata;
  /** Current value result (may be null before runtime starts) */
  value: EdgeValueResult | null;
  /** History ring buffer (null if not tracked or not a signal) */
  history: TrackedEntry | null;
  /** Field temporal history (null if not a field or not tracked) */
  fieldHistory: FieldHistoryView | null;
  /** Instance-0 sparkline history (null if not a field or not tracked) */
  fieldInstanceHistory: HistoryView | null;
  /** Buffer history for raster heatmap (null if not a field or not tracked) */
  fieldBufferHistory: BufferHistoryView | null;
}

type MiniViewTarget =
  | { readonly kind: 'edge'; readonly edgeId: string }
  | { readonly kind: 'port'; readonly blockId: string; readonly portName: string };

function getTargetKey(target: MiniViewTarget): DebugTargetKey {
  if (target.kind === 'edge') {
    return { kind: 'edge', edgeId: target.edgeId };
  }
  return { kind: 'port', blockId: target.blockId, portName: target.portName };
}

function getTargetLabel(target: MiniViewTarget): string {
  if (target.kind === 'edge') return target.edgeId;
  return `${target.blockId}.${target.portName}`;
}

function getTargetMetadata(target: MiniViewTarget): EdgeMetadata | undefined {
  if (target.kind === 'edge') {
    return debugService.getEdgeMetadata(target.edgeId);
  }
  return debugService.getPortMetadata(target.blockId, target.portName);
}

function getTargetValue(target: MiniViewTarget): EdgeValueResult | undefined {
  if (target.kind === 'edge') {
    return debugService.getEdgeValue(target.edgeId);
  }
  return debugService.getPortValue(target.blockId, target.portName);
}

function useDebugTargetMiniView(
  target: MiniViewTarget | null,
  label: string | null,
): MiniViewData | null {
  const [value, setValue] = useState<EdgeValueResult | null>(null);
  const [tick, setTick] = useState(0);

  const edgeId = target?.kind === 'edge' ? target.edgeId : null;
  const blockId = target?.kind === 'port' ? target.blockId : null;
  const portName = target?.kind === 'port' ? target.portName : null;

  const meta = target ? getTargetMetadata(target) : undefined;
  const cardinality = meta
    ? requireInst(meta.type.extent.cardinality, 'cardinality').kind
    : null;
  const key = edgeId
    ? ({ kind: 'edge', edgeId } as const)
    : (blockId && portName
      ? ({ kind: 'port', blockId, portName } as const)
      : null);

  // [LAW:single-enforcer] Target hook owns history/field tracking lifecycle.
  useEffect(() => {
    if (!target || !meta || !key || !cardinality) return;

    if (cardinality === 'many') {
      debugService.trackField(meta.slotId, meta.type);
      return () => {
        debugService.untrackField(meta.slotId);
      };
    }

    debugService.trackHistoryKey(key);
    return () => {
      debugService.untrackHistoryKey(key);
    };
  }, [edgeId, blockId, portName, meta?.slotId, meta?.type, cardinality, key]);

  // [LAW:dataflow-not-control-flow] Polling pipeline is identical for edge/port targets.
  useEffect(() => {
    if (!edgeId && !(blockId && portName)) {
      setValue(null);
      return;
    }

    const poll = () => {
      try {
        const result = edgeId
          ? debugService.getEdgeValue(edgeId)
          : debugService.getPortValue(blockId!, portName!);
        setValue(result ?? null);
      } catch {
        setValue(null);
      }
      setTick(t => t + 1); // Force Sparkline re-render
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [edgeId, blockId, portName]);

  if (!target || !meta || !key || !cardinality) return null;

  const history = cardinality === 'one'
    ? debugService.historyService.getHistory(key) ?? null
    : null;
  const fieldHistory = cardinality === 'many'
    ? debugService.getFieldHistory(meta.slotId) ?? null
    : null;
  const fieldInstanceHistory = cardinality === 'many'
    ? debugService.getFieldInstanceHistory(meta.slotId) ?? null
    : null;
  const fieldBufferHistory = cardinality === 'many'
    ? debugService.getFieldBufferHistory(meta.slotId) ?? null
    : null;

  return {
    key,
    label: label || getTargetLabel(target),
    meta,
    value,
    history,
    fieldHistory,
    fieldInstanceHistory,
    fieldBufferHistory,
  };
}

/**
 * Hook that resolves all data needed by DebugMiniView.
 *
 * @param hoveredEdgeId - Currently hovered edge ID (from DebugStore)
 * @param edgeLabel - Pre-computed label for the edge (from patch)
 */
export function useDebugMiniView(
  hoveredEdgeId: string | null,
  edgeLabel: string | null,
): MiniViewData | null {
  const target = hoveredEdgeId ? ({ kind: 'edge', edgeId: hoveredEdgeId } as const) : null;
  return useDebugTargetMiniView(target, edgeLabel);
}

/**
 * Port variant of mini-view data hook.
 * Used for source/derived probe views (e.g. lens impact previews).
 */
export function useDebugPortMiniView(
  blockId: string | null,
  portName: string | null,
  portLabel: string | null,
): MiniViewData | null {
  const target = blockId && portName
    ? ({ kind: 'port', blockId, portName } as const)
    : null;
  return useDebugTargetMiniView(target, portLabel);
}
