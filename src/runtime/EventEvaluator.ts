/**
 * Event Evaluator
 *
 * Evaluates EventExpr expressions to boolean (fired/not-fired).
 * Events are discrete boolean signals that fire for exactly one tick.
 *
 * Spec Reference: design-docs/_new/10-Events-1.md
 */

import type { EventExpr } from '../compiler/ir/types';
import type { EventExprId, SigExprId } from '../compiler/ir/Indices';
import type { SigExpr } from '../compiler/ir/types';
import type { RuntimeState } from './RuntimeState';
import { evaluateSignal } from './SignalEvaluator';

/**
 * Evaluate an event expression to determine if it fires this tick.
 *
 * @param exprId - Event expression ID
 * @param eventExprs - Dense array of event expressions
 * @param state - Runtime state (for wrap edge detection state)
 * @param signals - Signal expressions (for wrap signal evaluation)
 * @returns true if the event fires this tick
 */
export function evaluateEvent(
  exprId: EventExprId,
  eventExprs: readonly EventExpr[],
  state: RuntimeState,
  signals: readonly SigExpr[],
): boolean {
  const expr = eventExprs[exprId as number];
  if (!expr) {
    return false;
  }

  switch (expr.kind) {
    case 'const':
      return expr.fired;

    case 'never':
      return false;

    case 'pulse':
      // Pulse fires every tick (spec §8.4)
      return true;

    case 'combine': {
      if (expr.mode === 'any') {
        return expr.events.some(e => evaluateEvent(e, eventExprs, state, signals));
      } else {
        // 'all'
        return expr.events.every(e => evaluateEvent(e, eventExprs, state, signals));
      }
    }

    case 'wrap': {
      // Edge detection: rising edge of (signalValue >= 0.5)
      const signalValue = evaluateSignal(expr.signal, signals, state);
      // NaN and Inf treated as false (spec §8.6.3)
      const predicate = (Number.isFinite(signalValue) && signalValue >= 0.5) ? 1 : 0;
      const prevPredicate = state.eventPrevPredicate[exprId as number] ?? 0;
      state.eventPrevPredicate[exprId as number] = predicate;
      // Rising edge: was 0, now 1
      return predicate === 1 && prevPredicate === 0;
    }
  }
}
