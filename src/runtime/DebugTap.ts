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
   * Called by ScheduleExecutor after each signal slot write.
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
   * Called by ScheduleExecutor after each field is materialized.
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
   * Called by ScheduleExecutor to determine which fields need demand-driven materialization.
   *
   * Returns undefined or empty set if no fields are being tracked.
   */
  getTrackedFieldSlots?(): ReadonlySet<ValueSlot> | undefined;
}
