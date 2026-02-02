/**
 * ══════════════════════════════════════════════════════════════════════
 * VALUEEXPR SIGNAL EVALUATOR
 * ══════════════════════════════════════════════════════════════════════
 *
 * Signal evaluation for the unified ValueExpr table.
 * This evaluator handles signal-extent ValueExpr nodes (cardinality one,
 * temporality continuous).
 *
 * Migration Status: Shadow mode implementation for incremental ValueExpr adoption.
 * This evaluator runs in parallel with legacy SignalEvaluator during migration,
 * validating equivalence before cutover.
 *
 * ──────────────────────────────────────────────────────────────────────
 * IMPORTANT: SIGNAL-EXTENT ONLY
 * ──────────────────────────────────────────────────────────────────────
 *
 * This evaluator handles ONLY signal-extent expressions:
 * - Cardinality: one (not zero, not many)
 * - Temporality: continuous (not discrete)
 *
 * Field-extent (cardinality many) → Materializer
 * Event-extent (temporality discrete) → EventEvaluator
 *
 * Runtime assertions enforce this constraint.
 *
 * ══════════════════════════════════════════════════════════════════════
 */

import type { ValueExpr } from '../compiler/ir/value-expr';
import type { ValueExprId } from '../compiler/ir/Indices';
import type { RuntimeState } from './RuntimeState';
import { recordNaN, recordInfinity } from './HealthMonitor';
import { constValueAsNumber } from '../core/canonical-types';
import { applyPureFn } from './SignalKernelLibrary';

/**
 * Evaluate a ValueExpr signal with caching
 *
 * @param veId - ValueExpr ID to evaluate
 * @param valueExprs - Dense array of ValueExpr nodes
 * @param state - Runtime state with cache
 * @returns Evaluated signal value
 */
export function evaluateValueExprSignal(
  veId: ValueExprId,
  valueExprs: readonly ValueExpr[],
  state: RuntimeState
): number {
  // Check cache first
  const cached = state.cache.valueExprValues[veId as number];
  const cachedStamp = state.cache.valueExprStamps[veId as number];
  if (cachedStamp === state.cache.frameId) {
    return cached;
  }

  // Get expression from dense array
  const expr = valueExprs[veId as number];
  if (!expr) {
    throw new Error(`ValueExpr ${veId} not found`);
  }

  // Evaluate based on kind
  const value = evaluateSignalExtent(expr, valueExprs, state);

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
  state.cache.valueExprValues[veId as number] = value;
  state.cache.valueExprStamps[veId as number] = state.cache.frameId;

  return value;
}

/**
 * Evaluate a signal-extent ValueExpr recursively
 *
 * @param expr - ValueExpr to evaluate
 * @param valueExprs - Dense array of all ValueExpr nodes (for recursive evaluation)
 * @param state - Runtime state
 * @returns Evaluated value
 */
function evaluateSignalExtent(
  expr: ValueExpr,
  valueExprs: readonly ValueExpr[],
  state: RuntimeState
): number {
  if (!state.time) {
    throw new Error('Effective time not set');
  }

  switch (expr.kind) {
    case 'const': {
      return constValueAsNumber(expr.value);
    }

    case 'slotRead': {
      // Read from f64 storage using slot as offset
      // (In the current implementation, slot number IS the offset for f64)
      return state.values.f64[expr.slot as number];
    }

    case 'time': {
      switch (expr.which) {
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
          const _exhaustive: never = expr.which;
          throw new Error(`Unknown time signal: ${String(_exhaustive)}`);
        }
      }
    }

    case 'external': {
      return state.externalChannels.snapshot.getFloat(expr.channel);
    }

    case 'kernel': {
      return evaluateKernelSignal(expr, valueExprs, state);
    }

    case 'state': {
      // Read from persistent state array
      return state.state[expr.stateSlot as number];
    }

    case 'shapeRef': {
      // ShapeRef signals are not evaluated as numeric values.
      // The ScheduleExecutor handles shape2d record writes directly.
      // Return 0 as a safe numeric fallback if this is ever called.
      return 0;
    }

    case 'eventRead': {
      // Read event scalar as float: 0 → 0.0, 1 → 1.0 (spec §9.2)
      return state.eventScalars[expr.eventSlot as number] ?? 0;
    }

    case 'intrinsic': {
      throw new Error('Intrinsic expressions are field-extent, not signal-extent');
    }

    case 'event': {
      throw new Error('Event expressions must be evaluated by EventEvaluator');
    }

    case 'extract': {
      // Extract a component from a multi-component signal.
      // In signal context, multi-component values use slotWriteStrided,
      // so extract reads from the source and picks one component.
      const inputVal = evaluateValueExprSignal(expr.input, valueExprs, state);
      // For signal-extent, the input is a single scalar — extract(0) returns it as-is.
      // Multi-component signals are decomposed at compile time via slotRead.
      if (expr.componentIndex === 0) return inputVal;
      throw new Error(
        `extract(${expr.componentIndex}) on signal-extent: multi-component signals use slotRead, not extract`
      );
    }

    case 'construct': {
      // Construct is field-extent only in practice (signal vec3 uses slotWriteStrided).
      throw new Error('construct expressions are field-extent, not signal-extent');
    }

    case 'hslToRgb': {
      // HSL→RGB is field-extent only (signal color uses slotWriteStrided).
      throw new Error('hslToRgb expressions are field-extent, not signal-extent');
    }

    default: {
      const _exhaustive: never = expr;
      throw new Error(`Unknown ValueExpr kind: ${(_exhaustive as ValueExpr).kind}`);
    }
  }
}

/**
 * Evaluate kernel operations for signal-extent expressions
 *
 * @param expr - Kernel ValueExpr
 * @param valueExprs - Dense array of ValueExpr nodes
 * @param state - Runtime state
 * @returns Evaluated value
 */
function evaluateKernelSignal(
  expr: Extract<ValueExpr, { kind: 'kernel' }>,
  valueExprs: readonly ValueExpr[],
  state: RuntimeState
): number {
  switch (expr.kernelKind) {
    case 'map': {
      const input = evaluateValueExprSignal(expr.input, valueExprs, state);
      return applyPureFn(expr.fn, [input]);
    }

    case 'zip': {
      const inputs = expr.inputs.map(id => evaluateValueExprSignal(id, valueExprs, state));
      return applyPureFn(expr.fn, inputs);
    }

    case 'reduce': {
      // Field reduction is handled during step execution (materialization needed)
      // This case should not be reached during signal evaluation
      // Return 0 as placeholder (actual work done in executor)
      return 0;
    }

    case 'broadcast': {
      throw new Error('Broadcast is field-extent, not signal-extent');
    }

    case 'zipSig': {
      throw new Error('ZipSig is field-extent, not signal-extent');
    }

    case 'pathDerivative': {
      throw new Error('PathDerivative is field-extent, not signal-extent');
    }

    default: {
      const _exhaustive: never = expr;
      throw new Error(`Unknown kernel kind: ${(_exhaustive as Extract<ValueExpr, { kind: 'kernel' }>).kernelKind}`);
    }
  }
}
