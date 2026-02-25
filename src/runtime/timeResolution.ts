/**
 * Time Resolution - Convert Player Time to Effective Time
 *
 * Resolves absolute player time into effective time channels based on the time model.
 */

import type { TimeModel } from '../compiler/ir/types';
import { wrapToPhase01 } from '../utilities/phase';
import { hsvToRgba01 } from '../utilities/color';

/**
 * EffectiveTime - Resolved time channels for a frame
 */
export interface EffectiveTime {
  /** Absolute time in milliseconds (input) */
  tAbsMs: number;

  /** Model time in milliseconds (monotonic, never resets) */
  tMs: number;

  /** Delta time since last frame (milliseconds) */
  dt: number;

  /** Phase A: primary phase [0,1) */
  phaseA: number;

  /** Phase B: secondary phase [0,1) */
  phaseB: number;

  /** Pulse channel: 1.0 every frame (frame-tick trigger) */
  pulse: number;

  /** Optional normalized progress channel (reserved for future runtime use) */
  progress?: number;

  /** Palette: phase-derived RGBA color as Float32Array(4) [r, g, b, a] */
  palette: Float32Array;

  /** Energy: phase-derived energy [0-1] */
  energy: number;
}

/**
 * TimeState - Persistent state for phase tracking
 */
export interface TimeState {
  /** Previous absolute time */
  prevTAbsMs: number | null;

  /** Previous monotonic time (for I1 monotonicity enforcement) */
  prevTMs: number | null;

  /** Previous phase A value (for wrap detection) */
  prevPhaseA: number | null;

  /** Previous phase B value (for wrap detection) */
  prevPhaseB: number | null;

  /** Phase A offset for continuity */
  offsetA: number;

  /** Phase B offset for continuity */
  offsetB: number;
}

/**
 * Create initial TimeState
 */
export function createTimeState(): TimeState {
  return {
    prevTAbsMs: null,
    prevTMs: null,
    prevPhaseA: null,
    prevPhaseB: null,
    offsetA: 0,
    offsetB: 0,
  };
}

/**
 * Reconcile phase offsets when time model periods change.
 * Adjusts offsetA/offsetB so effective phases remain continuous.
 * Called during hot-swap when the compiled schedule changes.
 *
 * Formula (from spec §11-continuity-system.md §1.3):
 *   old_effective = wrap(old_raw_phase + old_offset)
 *   new_raw = (monotonicTMs / new_period) % 1.0
 *   We want: wrap(new_raw + new_offset) = old_effective
 *
 * Since offsets can be any value (not constrained to [0,1)), we find the
 * new offset that:
 * 1. Produces the correct effective phase when wrapped
 * 2. Minimizes the change from the old offset (continuity)
 *
 * @param oldTimeModel - Previous compiled time model
 * @param newTimeModel - New compiled time model
 * @param monotonicTMs - Current monotonic time in ms
 * @param timeState - Mutable time state (offsets are updated in place)
 */
export function reconcilePhaseOffsets(
  oldTimeModel: TimeModel,
  newTimeModel: TimeModel,
  monotonicTMs: number,
  timeState: TimeState
): void {
  const oldPeriodA = oldTimeModel.periodAMs;
  const newPeriodA = newTimeModel.periodAMs;
  const oldPeriodB = oldTimeModel.periodBMs;
  const newPeriodB = newTimeModel.periodBMs;

  // Reconcile A if period changed
  if (oldPeriodA !== newPeriodA && oldPeriodA > 0 && newPeriodA > 0) {
    const oldRaw = (monotonicTMs / oldPeriodA) % 1.0;
    const oldEffective = wrapToPhase01(oldRaw + timeState.offsetA);
    const newRaw = (monotonicTMs / newPeriodA) % 1.0;

    // We need: wrap(newRaw + newOffset) = oldEffective
    // One solution is: newOffset = oldEffective - newRaw
    // But there are infinite solutions: newOffset = oldEffective - newRaw + k (for integer k)
    // Choose k to minimize |newOffset - oldOffset|

    // Start with the base solution
    let candidateOffset = oldEffective - newRaw;

    // Find the k that minimizes distance to oldOffset
    // Try k = -1, 0, +1 and pick the closest
    const candidates = [
      candidateOffset - 1.0,
      candidateOffset,
      candidateOffset + 1.0,
    ];

    let bestOffset = candidates[0];
    let bestDistance = Math.abs(bestOffset - timeState.offsetA);

    for (const candidate of candidates) {
      const distance = Math.abs(candidate - timeState.offsetA);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestOffset = candidate;
      }
    }

    timeState.offsetA = bestOffset;
  }

  // Reconcile B if period changed
  if (oldPeriodB !== newPeriodB && oldPeriodB > 0 && newPeriodB > 0) {
    const oldRaw = (monotonicTMs / oldPeriodB) % 1.0;
    const oldEffective = wrapToPhase01(oldRaw + timeState.offsetB);
    const newRaw = (monotonicTMs / newPeriodB) % 1.0;

    let candidateOffset = oldEffective - newRaw;

    const candidates = [
      candidateOffset - 1.0,
      candidateOffset,
      candidateOffset + 1.0,
    ];

    let bestOffset = candidates[0];
    let bestDistance = Math.abs(bestOffset - timeState.offsetB);

    for (const candidate of candidates) {
      const distance = Math.abs(candidate - timeState.offsetB);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestOffset = candidate;
      }
    }

    timeState.offsetB = bestOffset;
  }
}

/**
 * Resolve effective time from absolute time and time model.
 */
export function resolveTime(
  tAbsMs: number,
  timeModel: TimeModel,
  timeState: TimeState
): EffectiveTime {
  // Calculate delta time
  const rawDt = timeState.prevTAbsMs !== null ? tAbsMs - timeState.prevTAbsMs : 0;
  // [LAW:dataflow-not-control-flow] Resolve time channels every frame; when
  // absolute timestamps move backward, clamp dt to 0 as data instead of branching
  // the execution pipeline.
  const dt = Math.max(0, rawDt);
  timeState.prevTAbsMs = tAbsMs;

  // Enforce monotonicity (I1): tMs never decreases
  const monotonicTMs = Math.max(tAbsMs, timeState.prevTMs ?? 0);
  timeState.prevTMs = monotonicTMs;

  const periodAMs = timeModel.periodAMs;
  const periodBMs = timeModel.periodBMs;

  // Compute phases
  const rawPhaseA = periodAMs > 0 ? (monotonicTMs / periodAMs) % 1.0 : 0;
  const phaseA = wrapToPhase01(rawPhaseA + timeState.offsetA);

  const rawPhaseB = periodBMs > 0 ? (monotonicTMs / periodBMs) % 1.0 : 0;
  const phaseB = wrapToPhase01(rawPhaseB + timeState.offsetB);

  // Wrap detection (kept for future use, but pulse now fires every frame)
  const wrapA = timeState.prevPhaseA !== null && phaseA < timeState.prevPhaseA - 0.5;
  const wrapB = timeState.prevPhaseB !== null && phaseB < timeState.prevPhaseB - 0.5;

  // C-20 FIX: Pulse is a frame-tick trigger that fires every frame
  const pulse = 1.0;

  // Update state
  timeState.prevPhaseA = phaseA;
  timeState.prevPhaseB = phaseB;

  // Compute palette: HSV(phaseA, 1.0, 0.5) -> RGB
  const palette = Float32Array.from(hsvToRgba01(phaseA, 1.0, 0.5));

  // Compute energy: 0.5 + 0.5 * sin(phaseA * 2π)
  const energy = 0.5 + 0.5 * Math.sin(phaseA * 2 * Math.PI);

  // Infinite model
  return { tAbsMs, tMs: monotonicTMs, dt, phaseA, phaseB, pulse, palette, energy };
}
