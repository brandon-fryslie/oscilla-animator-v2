/**
 * Time Resolution - Convert Player Time to Effective Time
 *
 * Resolves absolute player time into effective time signals based on the time model.
 */

import type { TimeModel } from '../compiler/ir/types';

/**
 * EffectiveTime - Resolved time signals for a frame
 *
 * Contains all time-derived signals computed from the time model.
 */
export interface EffectiveTime {
  /** Absolute time in milliseconds (input) */
  tAbsMs: number;

  /** Model time in milliseconds (monotonic, never resets) */
  tMs: number;

  /** Delta time since last frame (milliseconds) */
  dt: number;

  /** Phase A: primary phase [0,1) from periodAMs */
  phaseA: number;

  /** Phase B: secondary phase [0,1) from periodBMs */
  phaseB: number;

  /** Pulse signal: 1.0 when either phase wrapped, 0.0 otherwise */
  pulse: number;

  /** Progress 0..1 (finite models only) */
  progress?: number;
}

/**
 * TimeState - Persistent state for dual-phase tracking and hot-swap continuity
 */
export interface TimeState {
  /** Previous absolute time */
  prevTAbsMs: number | null;

  /** Previous model time (for wrap detection) */
  prevTModelMs: number | null;

  /** Previous phase A value (for wrap detection) */
  prevPhaseA: number | null;

  /** Previous phase B value (for wrap detection) */
  prevPhaseB: number | null;

  /** Total wrap count for phase A */
  wrapCountA: number;

  /** Total wrap count for phase B */
  wrapCountB: number;

  /** Phase A offset for hot-swap continuity */
  offsetA: number;

  /** Phase B offset for hot-swap continuity */
  offsetB: number;
}

/**
 * Create initial TimeState
 */
export function createTimeState(): TimeState {
  return {
    prevTAbsMs: null,
    prevTModelMs: null,
    prevPhaseA: null,
    prevPhaseB: null,
    wrapCountA: 0,
    wrapCountB: 0,
    offsetA: 0,
    offsetB: 0,
  };
}

/**
 * Resolve effective time from absolute time and time model.
 *
 * Semantics:
 * - Finite: tMs clamped to [0, durationMs], progress = tMs / durationMs
 * - Cyclic: tMs = tAbsMs (monotonic), phases computed from periods with offsets
 * - Infinite: tMs = tAbsMs (monotonic)
 *
 * Wrap Detection:
 * - Detects wrap when phase < prevPhase - 0.5
 * - Sets pulse = 1.0 on wrap of EITHER phase, 0.0 otherwise
 * - Increments wrap counter on each phase wrap
 *
 * Phase Continuity (Hot-Swap):
 * - offsetA and offsetB preserve phase values across period changes
 * - Phases computed as: ((tAbsMs / period) + offset) % 1.0
 */
export function resolveTime(
  tAbsMs: number,
  timeModel: TimeModel,
  timeState: TimeState
): EffectiveTime {
  // Calculate delta time
  const dt =
    timeState.prevTAbsMs !== null ? tAbsMs - timeState.prevTAbsMs : 0;
  timeState.prevTAbsMs = tAbsMs;

  switch (timeModel.kind) {
    case 'finite': {
      // Clamp to duration for progress, but tMs remains monotonic
      const tMs = tAbsMs;
      const clampedMs = Math.max(0, Math.min(tAbsMs, timeModel.durationMs));
      const progress =
        timeModel.durationMs > 0 ? clampedMs / timeModel.durationMs : 0;

      // Dual phase computation with defaults
      const periodAMs = timeModel.periodAMs ?? 4000;
      const periodBMs = timeModel.periodBMs ?? 8000;

      const rawPhaseA = periodAMs > 0 ? (tAbsMs / periodAMs) % 1.0 : 0;
      const phaseA = ((rawPhaseA + timeState.offsetA) % 1.0 + 1.0) % 1.0;

      const rawPhaseB = periodBMs > 0 ? (tAbsMs / periodBMs) % 1.0 : 0;
      const phaseB = ((rawPhaseB + timeState.offsetB) % 1.0 + 1.0) % 1.0;

      // Wrap detection for pulse
      const wrapA = timeState.prevPhaseA !== null && phaseA < timeState.prevPhaseA - 0.5;
      const wrapB = timeState.prevPhaseB !== null && phaseB < timeState.prevPhaseB - 0.5;
      const pulse = (wrapA || wrapB) ? 1.0 : 0.0;

      // Update state
      timeState.prevPhaseA = phaseA;
      timeState.prevPhaseB = phaseB;
      if (wrapA) timeState.wrapCountA++;
      if (wrapB) timeState.wrapCountB++;

      return {
        tAbsMs,
        tMs,
        dt,
        phaseA,
        phaseB,
        pulse,
        progress,
      };
    }

    case 'cyclic': {
      // tMs is monotonic (never wraps)
      const tMs = tAbsMs;

      // Dual phase computation
      const { periodAMs, periodBMs } = timeModel;

      const rawPhaseA = periodAMs > 0 ? (tAbsMs / periodAMs) % 1.0 : 0;
      const phaseA = ((rawPhaseA + timeState.offsetA) % 1.0 + 1.0) % 1.0;

      const rawPhaseB = periodBMs > 0 ? (tAbsMs / periodBMs) % 1.0 : 0;
      const phaseB = ((rawPhaseB + timeState.offsetB) % 1.0 + 1.0) % 1.0;

      // Wrap detection for pulse
      const wrapA = timeState.prevPhaseA !== null && phaseA < timeState.prevPhaseA - 0.5;
      const wrapB = timeState.prevPhaseB !== null && phaseB < timeState.prevPhaseB - 0.5;
      const pulse = (wrapA || wrapB) ? 1.0 : 0.0;

      // Update state
      timeState.prevPhaseA = phaseA;
      timeState.prevPhaseB = phaseB;
      if (wrapA) timeState.wrapCountA++;
      if (wrapB) timeState.wrapCountB++;

      return {
        tAbsMs,
        tMs,
        dt,
        phaseA,
        phaseB,
        pulse,
      };
    }

    case 'infinite': {
      // No transformation, tMs is monotonic
      const tMs = tAbsMs;

      // Dual phase computation with defaults
      const periodAMs = timeModel.periodAMs ?? 4000;
      const periodBMs = timeModel.periodBMs ?? 8000;

      const rawPhaseA = periodAMs > 0 ? (tAbsMs / periodAMs) % 1.0 : 0;
      const phaseA = ((rawPhaseA + timeState.offsetA) % 1.0 + 1.0) % 1.0;

      const rawPhaseB = periodBMs > 0 ? (tAbsMs / periodBMs) % 1.0 : 0;
      const phaseB = ((rawPhaseB + timeState.offsetB) % 1.0 + 1.0) % 1.0;

      // Wrap detection for pulse
      const wrapA = timeState.prevPhaseA !== null && phaseA < timeState.prevPhaseA - 0.5;
      const wrapB = timeState.prevPhaseB !== null && phaseB < timeState.prevPhaseB - 0.5;
      const pulse = (wrapA || wrapB) ? 1.0 : 0.0;

      // Update state
      timeState.prevPhaseA = phaseA;
      timeState.prevPhaseB = phaseB;
      if (wrapA) timeState.wrapCountA++;
      if (wrapB) timeState.wrapCountB++;

      return {
        tAbsMs,
        tMs,
        dt,
        phaseA,
        phaseB,
        pulse,
      };
    }

    default: {
      const _exhaustive: never = timeModel;
      throw new Error(`Unknown time model: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Calculate phase offset to preserve continuity when period changes (hot-swap).
 *
 * When the period changes at time T with current phase P:
 * - We want the phase to continue from P, not jump to a new value
 * - The raw phase (without offset) would be (T / newPeriod) % 1.0
 * - We need offset such that ((T / newPeriod) + offset) % 1.0 = P
 * - Therefore: offset = (P - (T / newPeriod)) % 1.0
 *
 * @param currentPhase - Current phase value [0,1)
 * @param tAbsMs - Current absolute time
 * @param newPeriodMs - New period after hot-swap
 * @returns New offset to apply
 */
export function calculateContinuityOffset(
  currentPhase: number,
  tAbsMs: number,
  newPeriodMs: number
): number {
  // What would the phase be without offset?
  const rawPhase = newPeriodMs > 0 ? (tAbsMs / newPeriodMs) % 1.0 : 0;

  // Offset = current - raw (wrapped to [0,1))
  const offset = ((currentPhase - rawPhase) % 1.0 + 1.0) % 1.0;

  return offset;
}
