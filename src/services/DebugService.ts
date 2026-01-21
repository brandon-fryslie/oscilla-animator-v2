/**
 * DebugService - Runtime Value Observation
 *
 * Singleton service that bridges runtime slot values to UI queries.
 * Sprint 1: Simple Map-based storage (replaced by DebugGraph in Sprint 2).
 *
 * Data flow: Compiler → (edge-to-slot map) → Runtime → (tap) → DebugService → (query) → UI
 */

import type { ValueSlot } from '../types';
import type { SignalType } from '../core/canonical-types';

/**
 * Edge metadata stored alongside slot mapping.
 * Includes type information for proper value formatting.
 */
interface EdgeMetadata {
  /** Target slot ID that stores this edge's value */
  slotId: ValueSlot;

  /** Signal type for formatting (e.g., "Float", "Phase", "Color") */
  type: SignalType;
}

/**
 * Query result returned to UI.
 */
export interface EdgeValueResult {
  /** Current numeric value */
  value: number;

  /** Slot ID (for debugging) */
  slotId: ValueSlot;

  /** Signal type for formatting */
  type: SignalType;
}

/**
 * DebugService - Minimal observation service for Sprint 1
 *
 * Responsibilities:
 * - Store edge-to-slot mapping (set by compiler)
 * - Store slot values (updated by runtime tap)
 * - Provide query API for UI (getEdgeValue)
 *
 * Limitations (Sprint 1):
 * - No ring buffers (stores only latest value)
 * - No bus resolution (direct edge→slot map)
 * - No DebugGraph (Sprint 2 feature)
 * - No history or timeseries (Sprint 3 feature)
 */
class DebugService {
  /** Edge-to-slot-and-type mapping (set by compiler after compilation) */
  private edgeToSlotMap = new Map<string, EdgeMetadata>();

  /** Slot values (updated by runtime via tap) */
  private slotValues = new Map<ValueSlot, number>();

  /**
   * Set the edge-to-slot mapping.
   * Called by compiler after successful compilation.
   *
   * @param map - Map from edge ID to slot metadata
   */
  setEdgeToSlotMap(map: Map<string, EdgeMetadata>): void {
    this.edgeToSlotMap = map;
  }

  /**
   * Update a slot value.
   * Called by runtime tap after each slot write.
   *
   * @param slotId - Slot ID
   * @param value - Numeric value
   */
  updateSlotValue(slotId: ValueSlot, value: number): void {
    this.slotValues.set(slotId, value);
  }

  /**
   * Query edge value by edge ID.
   * Called by UI (useDebugProbe hook).
   *
   * @param edgeId - ReactFlow edge ID
   * @returns Value and type, or undefined if edge not mapped
   */
  getEdgeValue(edgeId: string): EdgeValueResult | undefined {
    const meta = this.edgeToSlotMap.get(edgeId);
    if (!meta) {
      return undefined;
    }

    const value = this.slotValues.get(meta.slotId);
    if (value === undefined) {
      return undefined;
    }

    return {
      value,
      slotId: meta.slotId,
      type: meta.type,
    };
  }

  /**
   * Clear all stored data.
   * Called when patch is unloaded or recompiled.
   */
  clear(): void {
    this.edgeToSlotMap.clear();
    this.slotValues.clear();
  }
}

/**
 * Singleton instance.
 * Exported for use by compiler, runtime, and UI.
 */
export const debugService = new DebugService();
