/**
 * useDebugProbe - React Hook for Querying Runtime Values
 *
 * Throttled hook that queries DebugService for edge values.
 * Handles both signal and field edges via the discriminated EdgeValueResult union.
 * For field edges, automatically tracks/untracks for demand-driven materialization.
 *
 * Updates at 1Hz max to avoid excessive re-renders.
 */

import { useState, useEffect } from 'react';
import { debugService, type EdgeValueResult } from '../../services/DebugService';

/**
 * Hook to query debug value for an edge.
 * Throttles updates to 1Hz when edgeId is provided.
 * Automatically tracks field edges for demand-driven materialization.
 *
 * @param edgeId - ReactFlow edge ID to probe, or null to disable
 * @returns EdgeValueResult or null if edge not mapped or no value available
 */
export function useDebugProbe(edgeId: string | null): EdgeValueResult | null {
  const [value, setValue] = useState<EdgeValueResult | null>(null);

  useEffect(() => {
    if (edgeId === null) {
      setValue(null);
      return;
    }

    // Check if this is a field edge and track it
    const meta = debugService.getEdgeMetadata(edgeId);
    if (meta?.cardinality === 'field') {
      debugService.trackField(meta.slotId);
    }

    const queryValue = () => {
      try {
        const result = debugService.getEdgeValue(edgeId);
        setValue(result || null);
      } catch {
        setValue(null);
      }
    };

    queryValue();
    const interval = setInterval(queryValue, 1000);

    return () => {
      clearInterval(interval);
      // Untrack field when hook unmounts or edgeId changes
      if (meta?.cardinality === 'field') {
        debugService.untrackField(meta.slotId);
      }
    };
  }, [edgeId]);

  return value;
}
