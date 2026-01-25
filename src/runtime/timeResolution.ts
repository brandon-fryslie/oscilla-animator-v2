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

  /** Pulse signal: 1.0 every frame (frame-tick trigger) */
  pulse: number;

  /** Progress within finite time (0-1), only set for finite time roots */
  progress?: number;

  /** Palette: phase-derived RGBA color as Float32Array(4) [r, g, b, a] */
  palette: Float32Array;

  /** Energy: phase-derived energy [0,1] */
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
  // Calculate delta time
  const dt = timeState.prevTAbsMs !== null ? tAbsMs - timeState.prevTAbsMs : 0;
  timeState.prevTAbsMs = tAbsMs;

  // Enforce monotonicity (I1): tMs never decreases
  const monotonicTMs = Math.max(tAbsMs, timeState.prevTMs ?? 0);
  timeState.prevTMs = monotonicTMs;

  // Default periods (used for infinite models)
  const periodAMs = (timeModel.kind === 'infinite' ? timeModel.periodAMs : undefined) ?? 4000;
  const periodBMs = (timeModel.kind === 'infinite' ? timeModel.periodBMs : undefined) ?? 8000;

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
  return { tAbsMs, tMs: monotonicTMs, dt, phaseA, phaseB, pulse, palette, energy };
}
