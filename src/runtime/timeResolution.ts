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

  /** Progress within finite time (0-1), only set for finite time roots */
  progress?: number;

  /** Palette: phase-derived RGBA color */
  palette: { r: number; g: number; b: number; a: number };

  /** Energy: phase-derived energy [0,1] */
  energy: number;
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
 * Convert HSV color to RGB.
 * All values are in [0, 1] range.
 */
function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number; a: number } {
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

  return { r, g, b, a: 1.0 };
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

  // Default periods (used for infinite models)
  const periodAMs = (timeModel.kind === 'infinite' ? timeModel.periodAMs : undefined) ?? 4000;
  const periodBMs = (timeModel.kind === 'infinite' ? timeModel.periodBMs : undefined) ?? 8000;

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

  // Compute palette: HSV(phaseA, 1.0, 0.5) -> RGB
  const palette = hsvToRgb(phaseA, 1.0, 0.5);

  // Compute energy: 0.5 + 0.5 * sin(phaseA * 2π)
  const energy = 0.5 + 0.5 * Math.sin(phaseA * 2 * Math.PI);

  // Infinite model
  return { tAbsMs, tMs: tAbsMs, dt, phaseA, phaseB, pulse, palette, energy };
}
