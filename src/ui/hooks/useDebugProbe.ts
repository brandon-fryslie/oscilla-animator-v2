/**
 * useDebugProbe - React Hook for Querying Runtime Values
 *
 * Throttled hook that queries DebugService for edge values.
 * Updates at 1Hz max to avoid excessive re-renders.
 *
 * Sprint 1: Simple polling at 1Hz
 * Sprint 2: Will add reactive updates with ring buffer sampling
 */

import { useState, useEffect } from 'react';
import { debugService, type EdgeValueResult } from '../../services/DebugService';

/**
 * Hook to query debug value for an edge.
 * Throttles updates to 1Hz when edgeId is provided.
 *
 * @param edgeId - ReactFlow edge ID to probe, or null to disable
 * @returns EdgeValueResult or null if edge not mapped or no value available
 */
export function useDebugProbe(edgeId: string | null): EdgeValueResult | null {
  const [value, setValue] = useState<EdgeValueResult | null>(null);

  useEffect(() => {
    // Clear value if edgeId is null
    if (edgeId === null) {
      setValue(null);
      return;
    }

    // Query immediately
    const queryValue = () => {
      const result = debugService.getEdgeValue(edgeId);
      setValue(result || null);
    };

    queryValue();

    // Set up 1Hz polling
    const interval = setInterval(queryValue, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [edgeId]);

  return value;
}
