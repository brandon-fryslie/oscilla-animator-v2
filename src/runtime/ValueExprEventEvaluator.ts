/**
 * ══════════════════════════════════════════════════════════════════════
 * VALUEEXPR EVENT EVALUATOR
 * ══════════════════════════════════════════════════════════════════════
 *
 * Event evaluation for the unified ValueExpr table.
 * This evaluator handles event-extent ValueExpr nodes (temporality discrete).
 *
 * ──────────────────────────────────────────────────────────────────────
 * IMPORTANT: EVENT-EXTENT ONLY
 * ──────────────────────────────────────────────────────────────────────
 *
 * This evaluator handles ONLY event-extent expressions:
 * - Temporality: discrete (not continuous)
 *
 * Cardinality-one continuous values → Materializer (count=1)
 * Field-extent (cardinality many) → Materializer
 *
 * Runtime assertions enforce this constraint.
 *
 * ══════════════════════════════════════════════════════════════════════
 */

import type { ValueExpr, ValueExprEvent } from '../compiler/ir/value-expr';
import type { ValueExprId } from '../compiler/ir/Indices';
import type { RuntimeState } from './RuntimeState';
import type { CompiledProgramIR } from '../compiler/ir/program';
import { SCALAR_INSTANCE_ID } from '../compiler/ir/Indices';
import { createMaterializeScratch } from './MaterializeScratch';
import { materializeValueExpr } from './ValueExprMaterializer';
import type { PureFnExecutionContext } from './ScalarKernelLibrary';

const EVENT_MATERIALIZE_SCRATCH = createMaterializeScratch();

/**
 * Cycle detection error for combine recursion
 *
 * Thrown when a combine expression has a cyclic dependency chain.
 * This should never happen with valid IR (compiler must prevent cycles),
 * but we detect it at runtime as a safety measure.
 */
export class CycleInEventEvalError extends Error {
  constructor(veId: ValueExprId) {
    super(`Cycle detected in event expression: ValueExprId=${veId}`);
    this.name = 'CycleInEventEvalError';
  }
}

/**
 * Evaluate a ValueExpr event expression
 *
 * @param veId - ValueExpr ID to evaluate
 * @param table - ValueExpr table (program.valueExprs)
 * @param state - Runtime state
 * @param program - Compiled program (for cross-evaluator scalar calls)
 * @returns true if event fires this tick, false otherwise
 */
export function evaluateValueExprEvent(
  veId: ValueExprId,
  table: { readonly nodes: readonly ValueExpr[] },
  state: RuntimeState,
  program: CompiledProgramIR,
  pureFnContext?: PureFnExecutionContext,
): boolean {
  const expr = table.nodes[veId as number];
  if (!expr) {
    throw new Error(`ValueExpr ${veId} not found`);
  }

  if (expr.kind !== 'event') {
    throw new Error(`Expected event-extent ValueExpr, got kind '${expr.kind}'`);
  }

  // Initialize cycle detection tripwire if needed
  if (!state.eventCycleDetection) {
    state.eventCycleDetection = new Uint8Array(table.nodes.length);
  }

  // Check for cycle
  if (state.eventCycleDetection[veId as number] === 1) {
    throw new CycleInEventEvalError(veId);
  }

  // Mark as visiting
  state.eventCycleDetection[veId as number] = 1;

  try {
    // Evaluate event kind
    const result = evaluateEventKind(expr, veId, table, state, program, pureFnContext);
    return result;
  } finally {
    // Clear visiting flag before returning (even on error)
    state.eventCycleDetection[veId as number] = 0;
  }
}

/**
 * Evaluate event kind dispatch
 */
function evaluateEventKind(
  expr: ValueExprEvent,
  veId: ValueExprId,
  table: { readonly nodes: readonly ValueExpr[] },
  state: RuntimeState,
  program: CompiledProgramIR,
  pureFnContext?: PureFnExecutionContext,
): boolean {
  switch (expr.eventKind) {
    case 'const':
      return expr.fired;

    case 'never':
      return false;

    case 'pulse':
      // Fires every tick.
      return true;

    case 'combine': {
      if (expr.mode === 'any') {
        // OR semantics: any input fires → output fires
        return expr.inputs.some(id => evaluateValueExprEvent(id, table, state, program, pureFnContext));
      } else {
        // AND semantics: all inputs fire → output fires
        return expr.inputs.every(id => evaluateValueExprEvent(id, table, state, program, pureFnContext));
      }
    }

    case 'wrap': {
      // Edge detection: rising edge of (oneValue >= 0.5)
      // [LAW:one-source-of-truth] Event wrap reads cardinality-one values through
      // the canonical materialization path (count=1), not a parallel evaluator path.
      EVENT_MATERIALIZE_SCRATCH.reset();
      const oneValueBuf = materializeValueExpr(
        expr.input,
        table,
        SCALAR_INSTANCE_ID,
        1,
        state,
        program,
        undefined,
        EVENT_MATERIALIZE_SCRATCH,
        pureFnContext,
      );
      const oneValue = oneValueBuf[0];
      // [LAW:single-enforcer] Event wrap semantics consume exactly one scalar
      // from canonical materialization; missing lane is an upstream bug.
      if (oneValue === undefined) {
        throw new Error('Event wrap materialization produced empty scalar buffer');
      }

      // NaN and Inf treated as false (spec §8.6.3)
      const predicate = (Number.isFinite(oneValue) && oneValue >= 0.5) ? 1 : 0;

      // Read previous predicate (separate array for ValueExpr)
      const prev = state.eventWrapPredicate[veId as number];
      const prevPredicate = prev !== undefined ? prev : 0;

      // Write current predicate
      state.eventWrapPredicate[veId as number] = predicate;

      // Rising edge: was 0, now 1
      return predicate === 1 && prevPredicate === 0;
    }

    default: {
      const _exhaustive: never = expr;
      throw new Error(`Unknown event kind: ${(_exhaustive as ValueExprEvent).eventKind}`);
    }
  }
}
