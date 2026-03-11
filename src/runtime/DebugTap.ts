/**
 * DebugTap Interface - Runtime Observation Hook
 *
 * Injectable interface for observing runtime values without coupling runtime to services.
 * Follows HealthMonitor pattern for optional instrumentation.
 *
 * Spec Reference: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/08-observation-system.md
 *
 * Sprint 1: Only recordSlotValue implemented.
 * Sprint 2: Will add onDebugGraph, recordBusNow, etc.
 */

import type { ValueSlot } from '../types';

/**
 * Spy probe slice request for asynchronous observability reads.
 *
 * [LAW:dataflow-not-control-flow] Probe selection is data (slice descriptors),
 * not runtime-mode branching in frame execution.
 */
export interface SpyProbeSlice {
  /** Canonical slot to sample */
  readonly slotId: ValueSlot;
  /** Source component offset inside the sampled slot payload */
  readonly componentOffset: number;
  /** Number of scalar components to read */
  readonly componentCount: number;
}

/**
 * Spy readback sample emitted at low cadence for UI observability.
 */
export interface SpyReadbackSample {
  /** Runtime frame ID at capture time */
  readonly frameId: number;
  /** Absolute capture timestamp in milliseconds */
  readonly capturedAtMs: number;
  /** Canonical source slot */
  readonly slotId: ValueSlot;
  /** Sampled scalar values */
  readonly values: Float32Array;
}

/**
 * DebugTap - Optional runtime instrumentation interface
 *
 * Injected into RuntimeState to record values during execution.
 * All methods are optional - runtime guards all calls.
 *
 * Design:
 * - ONE-WAY DEPENDENCY: Runtime doesn't depend on DebugService (only on this interface)
 * - OPTIONAL: Runtime works correctly with tap = undefined
 * - NO ALLOCATION: Tap methods should not allocate (constant-time operations only)
 * - NO ERRORS: Tap methods must never throw (runtime doesn't catch)
 */
export interface DebugTap {
  /**
   * Record a scalar slot value after it's written.
   * Called by the runtime executor after each scalar slot write.
   *
   * Sprint 1: Records every slot, every frame.
   * Sprint 2: Will add DebugLevel filtering.
   *
   * @param slotId - Slot ID that was written
   * @param value - Numeric value written to slot
   */
  recordSlotValue?(slotId: ValueSlot, value: number): void;

  /**
   * Record a field (buffer) slot value after materialization.
   * Called by the runtime executor after each field is materialized.
   *
   * Fields produce arrays of data (one value per element in the instance).
   * For debug purposes, we might want first element, stats, or full buffer.
   *
   * @param slotId - Slot ID for the field
   * @param buffer - Materialized buffer (Float32Array or similar)
   */
  recordFieldValue?(slotId: ValueSlot, buffer: ArrayBufferView): void;

  /**
   * Get the set of field slots currently being tracked for debug inspection.
   * Called by the runtime executor to determine which fields need demand-driven materialization.
   *
   * Returns undefined or empty set if no fields are being tracked.
   */
  getTrackedFieldSlots?(): ReadonlySet<ValueSlot> | undefined;

  /**
   * Provide active spy probes for low-rate async readback.
   * Implementations may return empty/undefined when no probes are active.
   */
  getSpyProbeSlices?(): readonly SpyProbeSlice[] | undefined;

  /**
   * Record an asynchronously captured spy sample.
   * Called by runtime-side spy cadence loop (not the hot execution path).
   */
  recordSpyReadbackSample?(sample: SpyReadbackSample): void;
}
