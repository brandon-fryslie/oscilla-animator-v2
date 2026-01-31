/**
 * ══════════════════════════════════════════════════════════════════════
 * SIGNAL EVALUATOR - SINGLE SOURCE OF TRUTH
 * ══════════════════════════════════════════════════════════════════════
 *
 * Unified signal evaluation for ScheduleExecutor and Materializer.
 * Adheres to architectural law: ONE SOURCE OF TRUTH
 *
 * ──────────────────────────────────────────────────────────────────────
 * LAYER CONTRACT: SIGNAL KERNELS
 * ──────────────────────────────────────────────────────────────────────
 *
 * Signal kernels are DOMAIN-SPECIFIC scalar→scalar functions.
 * They have specific input domains and output ranges.
 *
 * WHAT BELONGS HERE:
 * - Oscillators (phase [0,1) → value [-1,1])
 * - Easing functions (t [0,1] → u [0,1])
 * - Shaping functions (smoothstep, step)
 * - Noise (deterministic, seeded)
 *
 * WHAT DOES NOT BELONG HERE:
 * - Generic math (abs, floor, sqrt, pow) → use OpcodeInterpreter
 * - Vec2/geometry operations → use Materializer field kernels
 * - Field-level operations → use Materializer
 *
 * ──────────────────────────────────────────────────────────────────────
 * SIGNAL KERNEL REFERENCE
 * ──────────────────────────────────────────────────────────────────────
 *
 * OSCILLATORS (phase [0,1) → [-1,1], auto-wrapped):
 *   oscSin     - Sine oscillator: sin(phase * 2π)
 *   oscCos     - Cosine oscillator: cos(phase * 2π)
 *   oscTan     - Tangent oscillator: tan(phase * 2π)
 *   triangle   - Triangle wave: 4|phase - 0.5| - 1
 *   square     - Square wave: phase < 0.5 ? 1 : -1
 *   sawtooth   - Sawtooth wave: 2 * phase - 1
 *
 * EASING (t [0,1] → u [0,1], clamped):
 *   easeInQuad, easeOutQuad, easeInOutQuad
 *   easeInCubic, easeOutCubic, easeInOutCubic
 *   easeInElastic, easeOutElastic, easeOutBounce
 *
 * SHAPING:
 *   smoothstep(edge0, edge1, x) - Hermite interpolation
 *   step(edge, x) - Step function: x < edge ? 0 : 1
 *
 * NOISE:
 *   noise(x) - Deterministic 1D noise, output [0,1)
 *
 * ──────────────────────────────────────────────────────────────────────
 * IMPORTANT: PHASE vs RADIANS
 * ──────────────────────────────────────────────────────────────────────
 *
 * Signal kernels oscSin/oscCos/oscTan expect PHASE [0,1).
 * They convert to radians internally: sin(phase * 2π).
 *
 * Opcode sin/cos/tan expect RADIANS directly.
 * Use opcodes for field-level math; use kernels for oscillator blocks.
 *
 * ══════════════════════════════════════════════════════════════════════
 */

import type { SigExpr } from '../compiler/ir/types';
import type { SigExprId } from '../types';
import type { RuntimeState } from './RuntimeState';
import { recordNaN, recordInfinity } from './HealthMonitor';
import { constValueAsNumber } from '../core/canonical-types';
import { applyPureFn } from './SignalKernelLibrary';

/**
 * Evaluate a signal expression with caching
 *
 * @param sigId - Signal expression ID to evaluate
 * @param signals - Dense array of signal expressions
 * @param state - Runtime state with cache
 * @returns Evaluated signal value
 */
export function evaluateSignal(
  sigId: SigExprId,
  signals: readonly SigExpr[],
  state: RuntimeState
): number {
  // Check cache first
  const cached = state.cache.sigValues[sigId as number];
  const cachedStamp = state.cache.sigStamps[sigId as number];
  if (cachedStamp === state.cache.frameId) {
    return cached;
  }

  // Get expression from dense array
  const expr = signals[sigId as number];
  if (!expr) {
    throw new Error(`Signal expression ${sigId} not found`);
  }

  // Evaluate based on kind
  const value = evaluateSigExpr(expr, signals, state);

  // NaN/Inf detection (batched)
  // Note: sourceBlockId not yet tracked in IR - will pass null for now
  // Once IR includes block provenance, update this to pass actual block ID
  if (Number.isNaN(value)) {
    recordNaN(state, null);
  } else if (!Number.isFinite(value)) {
    // Infinity (positive or negative)
    recordInfinity(state, null);
  }

  // Cache result
  state.cache.sigValues[sigId as number] = value;
  state.cache.sigStamps[sigId as number] = state.cache.frameId;

  return value;
}

/**
 * Evaluate a SigExpr recursively
 *
 * @param expr - Signal expression to evaluate
 * @param signals - Dense array of all signal expressions (for recursive evaluation)
 * @param state - Runtime state
 * @returns Evaluated value
 */
function evaluateSigExpr(
  expr: SigExpr,
  signals: readonly SigExpr[],
  state: RuntimeState
): number {
  if (!state.time) {
    throw new Error('Effective time not set');
  }

  switch (expr.kind) {
    case 'const': {
      return constValueAsNumber(expr.value);
    }

    case 'slot': {
      // DoD: Use slotMeta.offset for slot access
      // In the current simplified implementation, we assume f64 storage
      // and slots are already using the offset directly (slot ID = offset for f64)
      // When we have mixed storage classes, this will need to look up slotMeta
      //
      // For now: slot number IS the offset for f64 storage
      // This works because IRBuilder assigns offset = slot number for f64
      return state.values.f64[expr.slot as number];
    }

        case 'time': {
      const timeExpr = expr as { which: 'tMs' | 'phaseA' | 'phaseB' | 'dt' | 'progress' | 'palette' | 'energy' };
      switch (timeExpr.which) {
        case 'tMs':
          return state.time.tMs;
        case 'dt':
          return state.time.dt;
        case 'phaseA':
          return state.time.phaseA;
        case 'phaseB':
          return state.time.phaseB;
        case 'progress':
          return state.time.progress ?? 0;
        case 'palette':
          // Palette is stored in objects map at reserved slot 0
          return 0; // Slot number for palette
        case 'energy':
          return state.time.energy;
        default: {
          const _exhaustive: never = timeExpr.which;
          throw new Error(`Unknown time signal: ${String(_exhaustive)}`);
        }
      }
    }


    case 'external': {
      return state.externalChannels.snapshot.getFloat(expr.which);
    }

    case 'map': {
      const input = evaluateSignal(expr.input, signals, state);
      return applyPureFn(expr.fn, [input]);
    }

    case 'zip': {
      const inputs = expr.inputs.map((id) => evaluateSignal(id, signals, state));
      return applyPureFn(expr.fn, inputs);
    }

    case 'stateRead': {
      // Read from persistent state array
      return state.state[expr.stateSlot as number];
    }

    case 'shapeRef': {
      // ShapeRef signals are not evaluated as numeric values.
      // The ScheduleExecutor handles shape2d record writes directly.
      // Return 0 as a safe numeric fallback if this is ever called.
      return 0;
    }

    case 'reduceField': {
      // Field reduction is handled during step execution (materialization needed)
      // This case should not be reached during signal evaluation
      // Return 0 as placeholder (actual work done in executor)
      return 0;
    }

    case 'eventRead': {
      // Read event scalar as float: 0 → 0.0, 1 → 1.0 (spec §9.2)
      return state.eventScalars[expr.eventSlot as number] ?? 0;
    }

    default: {
      const _exhaustive: never = expr;
      throw new Error(`Unknown signal expr kind: ${(_exhaustive as SigExpr).kind}`);
    }
  }
}
