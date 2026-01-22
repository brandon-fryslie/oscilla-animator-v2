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

  /** Port-to-slot-and-type mapping (for unconnected output queries) */
  private portToSlotMap = new Map<string, EdgeMetadata>();

  /** Slot values (updated by runtime via tap) */
  private slotValues = new Map<ValueSlot, number>();

  /** Whether runtime has started (at least one value written) */
  private runtimeStarted = false;

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
   * Set the port-to-slot mapping.
   * Called by compiler after successful compilation.
   * Enables querying unconnected output port values.
   *
   * @param map - Map from "blockId:portName" to slot metadata
   */
  setPortToSlotMap(map: Map<string, EdgeMetadata>): void {
    this.portToSlotMap = map;
  }

  /**
   * Update a scalar slot value.
   * Called by runtime tap after each signal slot write.
   *
   * @param slotId - Slot ID
   * @param value - Numeric value
   */
  updateSlotValue(slotId: ValueSlot, value: number): void {
    this.runtimeStarted = true;
    this.slotValues.set(slotId, value);
  }

  /**
   * Update a field (buffer) slot value.
   * Called by runtime tap after each field materialization.
   *
   * For debug display, we store the first element as a representative value.
   * In the future, we could store stats (min, max, mean) or the full buffer.
   *
   * @param slotId - Slot ID
   * @param buffer - Materialized buffer
   */
  updateFieldValue(slotId: ValueSlot, buffer: ArrayBufferView): void {
    this.runtimeStarted = true;
    // Store first element as representative value for display
    // This works for Float32Array, Int32Array, etc.
    const typedArray = buffer as Float32Array;
    const firstValue = typedArray.length > 0 ? typedArray[0] : 0;
    this.slotValues.set(slotId, firstValue);
  }

  /**
   * Query edge value by edge ID.
   * Called by UI (useDebugProbe hook).
   *
   * @param edgeId - ReactFlow edge ID
   * @returns Value and type
   * @throws If edge not in mapping (compiler bug) or runtime hasn't produced value yet
   */
  getEdgeValue(edgeId: string): EdgeValueResult | undefined {
    const meta = this.edgeToSlotMap.get(edgeId);
    if (!meta) {
      // Edge should be in mapping if it exists in the patch and was compiled
      // This is a compiler/mapping bug, not a normal "no data" case
      throw new Error(
        `[DebugService.getEdgeValue] Edge '${edgeId}' not found in edge-to-slot mapping. ` +
        `This indicates the compiler did not register this edge's source output in debugIndex.`
      );
    }

    const value = this.slotValues.get(meta.slotId);
    if (value === undefined) {
      // Before runtime starts, no values exist - this is expected
      if (!this.runtimeStarted) {
        return undefined;
      }
      // After runtime starts, every mapped slot should be written every frame
      // If not, it's a scheduling bug
      throw new Error(
        `[DebugService.getEdgeValue] Slot ${meta.slotId} for edge '${edgeId}' has no value. ` +
        `Runtime has started but this slot was never written to - this is a scheduling bug.`
      );
    }

    return {
      value,
      slotId: meta.slotId,
      type: meta.type,
    };
  }

  /**
   * Query port value by block ID and port name.
   * Useful for querying unconnected output ports that have no edge.
   *
   * @param blockId - Block ID
   * @param portName - Port name (output port)
   * @returns Value and type, or undefined if port not in mapping (input ports, uncompiled blocks)
   * @throws If runtime started but slot has no value (bug)
   */
  getPortValue(blockId: string, portName: string): EdgeValueResult | undefined {
    const key = `${blockId}:${portName}`;
    const meta = this.portToSlotMap.get(key);
    if (!meta) {
      // Port not in mapping is expected for input ports or blocks that weren't compiled
      // This is different from edges - we don't know if this port SHOULD be mapped
      return undefined;
    }

    const value = this.slotValues.get(meta.slotId);
    if (value === undefined) {
      // Before runtime starts, no values exist - this is expected
      if (!this.runtimeStarted) {
        return undefined;
      }
      // After runtime starts, every mapped slot should be written every frame
      throw new Error(
        `[DebugService.getPortValue] Slot ${meta.slotId} for port '${key}' has no value. ` +
        `Runtime has started but this slot was never written to - this is a scheduling bug.`
      );
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
    this.portToSlotMap.clear();
    this.slotValues.clear();
    this.runtimeStarted = false;
  }
}

/**
 * Singleton instance.
 * Exported for use by compiler, runtime, and UI.
 */
export const debugService = new DebugService();
