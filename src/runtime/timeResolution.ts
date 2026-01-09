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

  /** Model time in milliseconds (transformed based on time model) */
  tModelMs: number;

  /** Delta time since last frame (milliseconds) */
  dt: number;

  /** Phase 0..1 (cyclic models only) */
  phase?: number;

  /** Pulse signal: 1.0 when wrapping occurred, 0.0 otherwise (cyclic models only) */
  pulse?: number;

  /** Progress 0..1 (finite models only) */
  progress?: number;

  /** Energy: cumulative sum of phase wraps (cyclic models only) */
  energy?: number;
}

/**
 * TimeState - Persistent state for wrap detection
 */
export interface TimeState {
  /** Previous absolute time */
  prevTAbsMs: number | null;

  /** Previous model time (for wrap detection) */
  prevTModelMs: number | null;

  /** Total wrap count since animation start */
  wrapCount: number;
}

/**
 * Create initial TimeState
 */
export function createTimeState(): TimeState {
  return {
    prevTAbsMs: null,
    prevTModelMs: null,
    wrapCount: 0,
  };
}

/**
 * Resolve effective time from absolute time and time model.
 *
 * Semantics:
 * - Finite: tModelMs clamped to [0, durationMs], progress = tModelMs / durationMs
 * - Cyclic: tModelMs wrapped to [0, periodMs], phase = tModelMs / periodMs
 * - Infinite: tModelMs = tAbsMs
 *
 * Wrap Detection (cyclic only):
 * - Detects wrap when tModelMs < prevTModelMs
 * - Sets pulse = 1.0 on wrap, 0.0 otherwise
 * - Increments energy counter on each wrap
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
      // Clamp to duration
      const tModelMs = Math.max(0, Math.min(tAbsMs, timeModel.durationMs));
      const progress =
        timeModel.durationMs > 0 ? tModelMs / timeModel.durationMs : 0;

      return {
        tAbsMs,
        tModelMs,
        dt,
        progress,
      };
    }

    case 'cyclic': {
      // Wrap to period
      const periodMs = timeModel.periodMs;
      const tModelMs = ((tAbsMs % periodMs) + periodMs) % periodMs;
      const phase = periodMs > 0 ? tModelMs / periodMs : 0;

      // Detect wrap
      let pulse = 0.0;
      if (
        timeState.prevTModelMs !== null &&
        tModelMs < timeState.prevTModelMs
      ) {
        pulse = 1.0;
        timeState.wrapCount++;
      }
      timeState.prevTModelMs = tModelMs;

      const energy = timeState.wrapCount;

      return {
        tAbsMs,
        tModelMs,
        dt,
        phase,
        pulse,
        energy,
      };
    }

    case 'infinite': {
      // No transformation
      return {
        tAbsMs,
        tModelMs: tAbsMs,
        dt,
      };
    }

    default: {
      const _exhaustive: never = timeModel;
      throw new Error(`Unknown time model: ${String(_exhaustive)}`);
    }
  }
}
