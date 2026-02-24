/**
 * Time Resolution - Convert Player Time to Effective Time
 *
 * Resolves absolute player time into effective time channels based on the time model.
 */

import type { TimeModel } from '../compiler/ir/types';

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

  /** Progress within finite time (0-1), only set for finite time roots */
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
 * Wrap phase to [0, 1)
 */
export function wrapPhase(value: number): number {
  const wrapped = value % 1.0;
  return wrapped < 0 ? wrapped + 1.0 : wrapped;
}

/**
 * Normalize phase offset to a bounded representative in [-0.5, 0.5).
 *
 * Adding any integer to offset preserves wrapped phase semantics, so runtime
 * keeps a bounded representative to prevent unbounded offset drift.
 */
function normalizePhaseOffset(offset: number): number {
  if (!Number.isFinite(offset)) {
    return 0;
  }
  return wrapPhase(offset + 0.5) - 0.5;
}

/**
 * Validate effective time channel invariants.
 */
export function assertBoundedEffectiveTime(effective: EffectiveTime): void {
  if (!Number.isFinite(effective.tAbsMs) || !Number.isFinite(effective.tMs) || !Number.isFinite(effective.dt)) {
    throw new Error('resolveTime: tAbsMs/tMs/dt must be finite numbers');
  }
  if (!Number.isFinite(effective.phaseA) || !Number.isFinite(effective.phaseB)) {
    throw new Error('resolveTime: phase channels must be finite numbers');
  }
  if (effective.phaseA < 0 || effective.phaseA >= 1 || effective.phaseB < 0 || effective.phaseB >= 1) {
    throw new Error('resolveTime: phase channels must be bounded to [0, 1)');
  }
  if (!(effective.palette instanceof Float32Array) || effective.palette.length !== 4) {
    throw new Error('resolveTime: palette must be Float32Array(4)');
  }
  if (!Number.isFinite(effective.energy)) {
    throw new Error('resolveTime: energy must be a finite number');
  }
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
  // [LAW:dataflow-not-control-flow] Offset bounds are represented in data, not
  // optional caller-side branches; normalize at the single time boundary.
  timeState.offsetA = normalizePhaseOffset(timeState.offsetA);
  timeState.offsetB = normalizePhaseOffset(timeState.offsetB);

  // Extract periods (default fallbacks for finite models which don't have these fields)
  const oldPeriodA = oldTimeModel.kind === 'infinite' ? oldTimeModel.periodAMs : 4000;
  const newPeriodA = newTimeModel.kind === 'infinite' ? newTimeModel.periodAMs : 4000;
  const oldPeriodB = oldTimeModel.kind === 'infinite' ? oldTimeModel.periodBMs : 8000;
  const newPeriodB = newTimeModel.kind === 'infinite' ? newTimeModel.periodBMs : 8000;

  // Reconcile A if period changed
  if (oldPeriodA !== newPeriodA && oldPeriodA > 0 && newPeriodA > 0) {
    const oldRaw = (monotonicTMs / oldPeriodA) % 1.0;
    const oldEffective = wrapPhase(oldRaw + timeState.offsetA);
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

    timeState.offsetA = normalizePhaseOffset(bestOffset);
  }

  // Reconcile B if period changed
  if (oldPeriodB !== newPeriodB && oldPeriodB > 0 && newPeriodB > 0) {
    const oldRaw = (monotonicTMs / oldPeriodB) % 1.0;
    const oldEffective = wrapPhase(oldRaw + timeState.offsetB);
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

    timeState.offsetB = normalizePhaseOffset(bestOffset);
  }
}

/**
 * Convert HSV color to RGB.
 * All values are in [0, 1] range.
 * Returns Float32Array(4) in RGBA order [r, g, b, a].
 */
function hsvToRgb(h: number, s: number, v: number): Float32Array {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  let r: number, g: number, b: number;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
    default: r = 0; g = 0; b = 0;
  }

  return new Float32Array([r, g, b, 1.0]);
}

/**
 * Resolve effective time from absolute time and time model.
 */
export function resolveTime(
  tAbsMs: number,
  timeModel: TimeModel,
  timeState: TimeState
): EffectiveTime {
  timeState.offsetA = normalizePhaseOffset(timeState.offsetA);
  timeState.offsetB = normalizePhaseOffset(timeState.offsetB);

  // Calculate delta time
  const dt = timeState.prevTAbsMs !== null ? tAbsMs - timeState.prevTAbsMs : 0;
  timeState.prevTAbsMs = tAbsMs;

  // Enforce monotonicity (I1): tMs never decreases
  const monotonicTMs = Math.max(tAbsMs, timeState.prevTMs ?? 0);
  timeState.prevTMs = monotonicTMs;

  // Extract periods (default fallbacks for finite models which don't have these fields)
  const periodAMs = timeModel.kind === 'infinite' ? timeModel.periodAMs : 4000;
  const periodBMs = timeModel.kind === 'infinite' ? timeModel.periodBMs : 8000;

  // Compute phases
  const rawPhaseA = periodAMs > 0 ? (monotonicTMs / periodAMs) % 1.0 : 0;
  const phaseA = wrapPhase(rawPhaseA + timeState.offsetA);

  const rawPhaseB = periodBMs > 0 ? (monotonicTMs / periodBMs) % 1.0 : 0;
  const phaseB = wrapPhase(rawPhaseB + timeState.offsetB);

  // Wrap detection (kept for future use, but pulse now fires every frame)
  const wrapA = timeState.prevPhaseA !== null && phaseA < timeState.prevPhaseA - 0.5;
  const wrapB = timeState.prevPhaseB !== null && phaseB < timeState.prevPhaseB - 0.5;

  // C-20 FIX: Pulse is a frame-tick trigger that fires every frame
  const pulse = 1.0;

  // Update state
  timeState.prevPhaseA = phaseA;
  timeState.prevPhaseB = phaseB;

  // Compute palette: HSV(phaseA, 1.0, 0.5) -> RGB
  const palette = hsvToRgb(phaseA, 1.0, 0.5);

  // Compute energy: 0.5 + 0.5 * sin(phaseA * 2π)
  const energy = 0.5 + 0.5 * Math.sin(phaseA * 2 * Math.PI);

  // Infinite model
  const effective = { tAbsMs, tMs: monotonicTMs, dt, phaseA, phaseB, pulse, palette, energy };
  assertBoundedEffectiveTime(effective);
  return effective;
}
