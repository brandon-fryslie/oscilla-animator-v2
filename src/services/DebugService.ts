/**
 * DebugService - Runtime Value Observation
 *
 * Singleton service that bridges runtime slot values to UI queries.
 * Supports both signal (scalar) and field (buffer) debug inspection.
 *
 * Field tracking is demand-driven: fields are only materialized when
 * actively tracked (hovered or inspected). This avoids unnecessary
 * materialization overhead.
 *
 * Data flow: Compiler → (edge-to-slot map) → Runtime → (tap) → DebugService → (query) → UI
 */

import type { ValueSlot } from '../types';
import type { SignalType } from '../core/canonical-types';
import type { UnmappedEdgeInfo, EdgeMetadata } from './mapDebugEdges';
import { HistoryService, type KeyResolver, type ResolvedKeyMetadata } from '../ui/debug-viz/HistoryService';
import type { DebugTargetKey } from '../ui/debug-viz/types';

/**
 * Signal value result - scalar value from evalSig step.
 */
export interface SignalValueResult {
  kind: 'signal';
  value: number;
  slotId: ValueSlot;
  type: SignalType;
}

/**
 * Field value result - summary stats from materialized buffer.
 */
export interface FieldValueResult {
  kind: 'field';
  count: number;
  min: number;
  max: number;
  mean: number;
  first: number;
  slotId: ValueSlot;
  type: SignalType;
}

/**
 * Field untracked result - field exists but is not currently being tracked.
 * UI should show "hover to inspect" rather than crashing.
 */
export interface FieldUntrackedResult {
  kind: 'field-untracked';
  slotId: ValueSlot;
  type: SignalType;
}

/**
 * Discriminated union of all possible debug value results.
 */
export type EdgeValueResult = SignalValueResult | FieldValueResult | FieldUntrackedResult;

/**
 * Debug service health status.
 */
export interface DebugServiceStatus {
  /** Total edges successfully mapped to slots */
  totalEdgesMapped: number;
  /** Total ports successfully mapped to slots */
  totalPortsMapped: number;
  /** List of edges that couldn't be mapped */
  unmappedEdges: UnmappedEdgeInfo[];
  /** Whether debug system is fully operational (no unmapped edges) */
  isHealthy: boolean;
}

/**
 * DebugService - Observation service with demand-driven field tracking
 *
 * Responsibilities:
 * - Store edge-to-slot mapping (set by compiler)
 * - Store slot values (updated by runtime tap)
 * - Track which field slots need materialization (demand-driven)
 * - Provide query API for UI (getEdgeValue)
 *
 * Field tracking contract:
 * - A field is "tracked" when UI actively inspects it (hover/inspector)
 * - Tracked fields MUST have values after runtime starts (throws if not — scheduling bug)
 * - Untracked fields return { kind: 'field-untracked' } (no throw)
 */
class DebugService {
  /** Edge-to-slot-and-type mapping (set by compiler after compilation) */
  private edgeToSlotMap = new Map<string, EdgeMetadata>();

  /** Port-to-slot-and-type mapping (for unconnected output queries) */
  private portToSlotMap = new Map<string, EdgeMetadata>();

  /** Signal slot values (updated by runtime via tap) */
  private signalValues = new Map<ValueSlot, number>();

  /** Field buffer data (updated by runtime via tap) */
  private fieldBuffers = new Map<ValueSlot, Float32Array>();

  /** Field slots currently being tracked for debug inspection */
  private trackedFieldSlots = new Set<ValueSlot>();

  /** Whether runtime has started (at least one value written) */
  private runtimeStarted = false;

  /** Edges that couldn't be mapped (for error reporting) */
  private unmappedEdges: UnmappedEdgeInfo[] = [];

  /** Temporal history tracking service */
  readonly historyService: HistoryService;

  constructor() {
    // Create resolver that closes over this instance's maps.
    // This avoids circular dependency: HistoryService doesn't import DebugService.
    const resolver: KeyResolver = (key: DebugTargetKey): ResolvedKeyMetadata | undefined => {
      let meta: EdgeMetadata | undefined;
      if (key.kind === 'edge') {
        meta = this.edgeToSlotMap.get(key.edgeId);
      } else {
        const portKey = `${key.blockId}:${key.portName}`;
        meta = this.portToSlotMap.get(portKey);
      }
      if (!meta) return undefined;
      return {
        slotId: meta.slotId,
        cardinality: meta.cardinality,
        payloadType: meta.type.payload,
      };
    };
    this.historyService = new HistoryService(resolver);
  }

  /**
   * Set the edge-to-slot mapping.
   * Called by compiler after successful compilation.
   */
  setEdgeToSlotMap(map: Map<string, EdgeMetadata>): void {
    this.edgeToSlotMap = map;
    this.historyService.onMappingChanged();
  }

  /**
   * Set the port-to-slot mapping.
   * Called by compiler after successful compilation.
   */
  setPortToSlotMap(map: Map<string, EdgeMetadata>): void {
    this.portToSlotMap = map;
    this.historyService.onMappingChanged();
  }

  /**
   * Set unmapped edges for error reporting.
   */
  setUnmappedEdges(edges: UnmappedEdgeInfo[]): void {
    this.unmappedEdges = edges;
  }

  /**
   * Get debug service health status.
   */
  getStatus(): DebugServiceStatus {
    return {
      totalEdgesMapped: this.edgeToSlotMap.size,
      totalPortsMapped: this.portToSlotMap.size,
      unmappedEdges: this.unmappedEdges,
      isHealthy: this.unmappedEdges.length === 0,
    };
  }

  // ===========================================================================
  // Field Tracking API
  // ===========================================================================

  /**
   * Track a field slot for demand-driven materialization.
   * Called by UI when user hovers a field edge or opens a field inspector.
   */
  trackField(slotId: ValueSlot): void {
    this.trackedFieldSlots.add(slotId);
  }

  /**
   * Stop tracking a field slot.
   * Called when user stops hovering or closes inspector.
   */
  untrackField(slotId: ValueSlot): void {
    this.trackedFieldSlots.delete(slotId);
    this.fieldBuffers.delete(slotId);
  }

  /**
   * Check if a field slot is currently tracked.
   */
  isFieldTracked(slotId: ValueSlot): boolean {
    return this.trackedFieldSlots.has(slotId);
  }

  /**
   * Get all currently tracked field slots.
   * Used by runtime tap to determine which fields to materialize.
   */
  getTrackedFieldSlots(): ReadonlySet<ValueSlot> {
    return this.trackedFieldSlots;
  }

  // ===========================================================================
  // Value Update API (called by runtime tap)
  // ===========================================================================

  /**
   * Update a scalar slot value.
   * Called by runtime tap after each signal slot write.
   */
  updateSlotValue(slotId: ValueSlot, value: number): void {
    this.runtimeStarted = true;
    this.signalValues.set(slotId, value);
    this.historyService.onSlotWrite(slotId, value);
  }

  /**
   * Update a field (buffer) slot value.
   * Called by runtime tap after each field materialization.
   * Stores a copy of the buffer for stats computation.
   */
  updateFieldValue(slotId: ValueSlot, buffer: ArrayBufferView): void {
    this.runtimeStarted = true;
    // Store a copy so we're not holding references to pooled buffers
    const src = buffer as Float32Array;
    const copy = new Float32Array(src.length);
    copy.set(src);
    this.fieldBuffers.set(slotId, copy);
  }

  // ===========================================================================
  // Query API (called by UI)
  // ===========================================================================

  /**
   * Query edge value by edge ID.
   *
   * Behavior by cardinality:
   * - Signal: returns SignalValueResult (throws if no value after runtime started)
   * - Field + tracked: returns FieldValueResult (throws if no value after runtime started)
   * - Field + untracked: returns FieldUntrackedResult (no throw)
   *
   * @throws If edge not in mapping (compiler bug)
   * @throws If signal/tracked-field slot has no value after runtime started (scheduling bug)
   */
  getEdgeValue(edgeId: string): EdgeValueResult | undefined {
    const meta = this.edgeToSlotMap.get(edgeId);
    if (!meta) {
      throw new Error(
        `[DebugService.getEdgeValue] Edge '${edgeId}' not found in edge-to-slot mapping. ` +
        `This indicates the compiler did not register this edge's source output in debugIndex.`
      );
    }

    if (meta.cardinality === 'field') {
      return this.queryFieldValue(meta);
    }
    return this.querySignalValue(meta);
  }

  /**
   * Query port value by block ID and port name.
   */
  getPortValue(blockId: string, portName: string): EdgeValueResult | undefined {
    const key = `${blockId}:${portName}`;
    const meta = this.portToSlotMap.get(key);
    if (!meta) {
      return undefined;
    }

    if (meta.cardinality === 'field') {
      return this.queryFieldValue(meta);
    }
    return this.querySignalValue(meta);
  }

  /**
   * Get edge metadata (cardinality, slot, type) without querying value.
   * Used by UI to determine whether to track a field before polling.
   */
  getEdgeMetadata(edgeId: string): EdgeMetadata | undefined {
    return this.edgeToSlotMap.get(edgeId);
  }

  /**
   * Clear all stored data.
   * Called when patch is unloaded or recompiled.
   */
  clear(): void {
    this.edgeToSlotMap.clear();
    this.portToSlotMap.clear();
    this.signalValues.clear();
    this.fieldBuffers.clear();
    this.trackedFieldSlots.clear();
    this.unmappedEdges = [];
    this.runtimeStarted = false;
    this.historyService.clear();
  }

  // ===========================================================================
  // Private Query Helpers
  // ===========================================================================

  private querySignalValue(meta: EdgeMetadata): SignalValueResult | undefined {
    const value = this.signalValues.get(meta.slotId);
    if (value === undefined) {
      if (!this.runtimeStarted) {
        return undefined;
      }
      throw new Error(
        `[DebugService.getEdgeValue] Slot ${meta.slotId} has no value. ` +
        `Runtime has started but this slot was never written to - this is a scheduling bug.`
      );
    }
    return { kind: 'signal', value, slotId: meta.slotId, type: meta.type };
  }

  private queryFieldValue(meta: EdgeMetadata): FieldValueResult | FieldUntrackedResult | undefined {
    // If not tracked, return untracked result (no throw)
    if (!this.trackedFieldSlots.has(meta.slotId)) {
      return { kind: 'field-untracked', slotId: meta.slotId, type: meta.type };
    }

    // Field is tracked — it MUST have a value after runtime starts
    const buffer = this.fieldBuffers.get(meta.slotId);
    if (!buffer) {
      if (!this.runtimeStarted) {
        return undefined;
      }
      throw new Error(
        `[DebugService.getEdgeValue] Slot ${meta.slotId} is a tracked field but has no value. ` +
        `Runtime has started but this slot was never written to - this is a scheduling bug.`
      );
    }

    // Compute stats from buffer
    const count = buffer.length;
    if (count === 0) {
      return {
        kind: 'field',
        count: 0,
        min: 0,
        max: 0,
        mean: 0,
        first: 0,
        slotId: meta.slotId,
        type: meta.type,
      };
    }

    let min = buffer[0];
    let max = buffer[0];
    let sum = 0;
    for (let i = 0; i < count; i++) {
      const v = buffer[i];
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }

    return {
      kind: 'field',
      count,
      min,
      max,
      mean: sum / count,
      first: buffer[0],
      slotId: meta.slotId,
      type: meta.type,
    };
  }
}

/**
 * Singleton instance.
 * Exported for use by compiler, runtime, and UI.
 */
export const debugService = new DebugService();
