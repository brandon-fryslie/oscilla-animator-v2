/**
 * useDebugMiniView - Reactive hook for DebugMiniView data.
 *
 * Reads DebugStore.hoveredEdgeId, resolves edge metadata, value, and
 * history from DebugService/HistoryService. Polls at 4Hz for responsiveness.
 *
 * Returns null when nothing is hovered.
 */

import { useState, useEffect, useCallback } from 'react';
import { debugService, type EdgeValueResult } from '../../services/DebugService';
import type { EdgeMetadata } from '../../services/mapDebugEdges';
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
  const [value, setValue] = useState<EdgeValueResult | null>(null);
  const [tick, setTick] = useState(0);

  // Poll for value updates at 4Hz
  useEffect(() => {
    if (!hoveredEdgeId) {
      setValue(null);
      return;
    }

    const poll = () => {
      try {
        const result = debugService.getEdgeValue(hoveredEdgeId);
        setValue(result ?? null);
      } catch {
        setValue(null);
      }
      setTick(t => t + 1); // Force Sparkline re-render
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hoveredEdgeId]);

  if (!hoveredEdgeId) return null;

  // Resolve metadata
  const meta = debugService.getEdgeMetadata(hoveredEdgeId);
  if (!meta) return null;

  // Resolve history (only for signal edges)
  const key: DebugTargetKey = { kind: 'edge', edgeId: hoveredEdgeId };
  const history = meta.cardinality === 'signal'
    ? debugService.historyService.getHistory(key) ?? null
    : null;

  // Resolve field history (only for field edges)
  const fieldHistory = meta.cardinality === 'field'
    ? debugService.getFieldHistory(meta.slotId) ?? null
    : null;

  // Resolve instance-0 sparkline history (only for field edges)
  const fieldInstanceHistory = meta.cardinality === 'field'
    ? debugService.getFieldInstanceHistory(meta.slotId) ?? null
    : null;

  // Resolve buffer history for raster heatmap (only for field edges)
  const fieldBufferHistory = meta.cardinality === 'field'
    ? debugService.getFieldBufferHistory(meta.slotId) ?? null
    : null;

  return {
    key,
    label: edgeLabel || hoveredEdgeId,
    meta,
    value,
    history,
    fieldHistory,
    fieldInstanceHistory,
    fieldBufferHistory,
  };
}
