/**
 * Signal Evaluator - SINGLE SOURCE OF TRUTH
 *
 * Unified signal evaluation for both ScheduleExecutor and Materializer.
 * Eliminates ~90 lines of code duplication.
 *
 * Adheres to architectural law: ONE SOURCE OF TRUTH
 */

import type { SigExpr } from '../compiler/ir/types';
import type { SigExprId } from '../types';
import type { RuntimeState } from './RuntimeState';
import { applyOpcode } from './OpcodeInterpreter';

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
      return typeof expr.value === 'number' ? expr.value : 0;
    }

    case 'slot': {
      return state.values.f64[expr.slot as number];
    }

    case 'time': {
      const timeExpr = expr as { which: 't' | 'dt' | 'phase' | 'pulse' | 'energy' };
      switch (timeExpr.which) {
        case 't':
          return state.time.tModelMs;
        case 'dt':
          return state.time.dt;
        case 'phase':
          return state.time.phase ?? 0;
        case 'pulse':
          return state.time.pulse ?? 0;
        case 'energy':
          return state.time.energy ?? 0;
        default: {
          const _exhaustive: never = timeExpr.which;
          throw new Error(`Unknown time signal: ${String(_exhaustive)}`);
        }
      }
    }

    case 'external': {
      const ext = expr as { which: 'mouseX' | 'mouseY' | 'mouseOver' };
      // Use smooth positions for organic following
      if (ext.which === 'mouseX') return state.external.smoothX;
      if (ext.which === 'mouseY') return state.external.smoothY;
      if (ext.which === 'mouseOver') return state.external.mouseOver ? 1 : 0;
      throw new Error(`Unknown external signal: ${ext.which}`);
    }

    case 'map': {
      const input = evaluateSignal(expr.input, signals, state);
      return applyPureFn(expr.fn, [input]);
    }

    case 'zip': {
      const inputs = expr.inputs.map((id) => evaluateSignal(id, signals, state));
      return applyPureFn(expr.fn, inputs);
    }

    default: {
      const _exhaustive: never = expr;
      throw new Error(`Unknown signal expr kind: ${(_exhaustive as SigExpr).kind}`);
    }
  }
}

/**
 * Apply a pure function to values
 */
function applyPureFn(
  fn: { kind: 'opcode'; opcode: string } | { kind: 'expr'; expr: string } | { kind: 'kernel'; name: string },
  values: number[]
): number {
  if (fn.kind === 'opcode') {
    return applyOpcode(fn.opcode, values);
  }
  throw new Error(`PureFn kind ${fn.kind} not implemented`);
}
