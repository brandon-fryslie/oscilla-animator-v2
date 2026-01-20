/**
 * Time Resolution - Convert Player Time to Effective Time
 *
 * Resolves absolute player time into effective time signals based on the time model.
 */

import type { TimeModel } from '../compiler/ir/types';

/**
 * EffectiveTime - Resolved time signals for a frame
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

  /** Pulse signal: 1.0 when either phase wrapped, 0.0 otherwise */
  pulse: number;

}

/**
 * TimeState - Persistent state for phase tracking
 */
export interface TimeState {
  /** Previous absolute time */
  prevTAbsMs: number | null;

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
    prevPhaseA: null,
    prevPhaseB: null,
    offsetA: 0,
    offsetB: 0,
  };
}

/**
 * Wrap phase to [0, 1)
 */
export function wrapPhase(value: number): number {
  const wrapped = value % 1.0;
  return wrapped < 0 ? wrapped + 1.0 : wrapped;
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
  const dt = timeState.prevTAbsMs !== null ? tAbsMs - timeState.prevTAbsMs : 0;
  timeState.prevTAbsMs = tAbsMs;

  // Default periods
  const periodAMs = timeModel.periodAMs ?? 4000;
  const periodBMs = timeModel.periodBMs ?? 8000;

  // Compute phases
  const rawPhaseA = periodAMs > 0 ? (tAbsMs / periodAMs) % 1.0 : 0;
  const phaseA = wrapPhase(rawPhaseA + timeState.offsetA);

  const rawPhaseB = periodBMs > 0 ? (tAbsMs / periodBMs) % 1.0 : 0;
  const phaseB = wrapPhase(rawPhaseB + timeState.offsetB);

  // Wrap detection for pulse
  const wrapA = timeState.prevPhaseA !== null && phaseA < timeState.prevPhaseA - 0.5;
  const wrapB = timeState.prevPhaseB !== null && phaseB < timeState.prevPhaseB - 0.5;
  const pulse = (wrapA || wrapB) ? 1.0 : 0.0;

  // Update state
  timeState.prevPhaseA = phaseA;
  timeState.prevPhaseB = phaseB;

  // Infinite model
  return { tAbsMs, tMs: tAbsMs, dt, phaseA, phaseB, pulse };
}
