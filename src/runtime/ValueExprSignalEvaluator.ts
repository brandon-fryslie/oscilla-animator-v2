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
 * Evaluate a construct expression and write all components contiguously to a buffer
 *
 * @param expr - Construct ValueExpr node
 * @param valueExprs - Dense array of ValueExpr nodes
 * @param state - Runtime state
 * @param targetBuffer - Target f64 buffer
 * @param targetOffset - Starting offset in buffer
 * @returns Number of components written (stride)
 */
export function evaluateConstructSignal(
  expr: Extract<ValueExpr, { kind: 'construct' }>,
  valueExprs: readonly ValueExpr[],
  state: RuntimeState,
  targetBuffer: Float64Array,
  targetOffset: number
): number {
  // Evaluate each component and write contiguously
  for (let i = 0; i < expr.components.length; i++) {
    const componentValue = evaluateValueExprSignal(expr.components[i], valueExprs, state);
    targetBuffer[targetOffset + i] = componentValue;
  }
  return expr.components.length;
}

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
      // Read from persistent state array using resolved physical slot
      if (expr.resolvedSlot === undefined) {
        throw new Error(`State expression for key "${expr.stateKey}" has no resolved slot — binding pass may not have run`);
      }
      return state.state[expr.resolvedSlot as number];
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
      // For signal-extent, multi-component values are stored in strided slots.
      // The input should resolve to a slot read (base slot), and we read at offset.
      const inputExpr = valueExprs[expr.input as unknown as number];
      if (inputExpr && inputExpr.kind === 'slotRead') {
        // Read from the component offset of the strided slot
        return state.values.f64[(inputExpr.slot as number) + expr.componentIndex];
      }

      // Fallback: evaluate the input and return it for componentIndex 0
      // This handles the case where extract is applied to non-strided signals
      const inputVal = evaluateValueExprSignal(expr.input, valueExprs, state);
      if (expr.componentIndex === 0) return inputVal;

      throw new Error(
        `extract(${expr.componentIndex}) on signal-extent: input is not a slotRead, cannot access component ${expr.componentIndex}`
      );
    }

    case 'construct': {
      // Construct evaluates component expressions and returns the first component's value.
      // For multi-component signals (vec2, vec3, color), the evaluator is responsible
      // for writing ALL components contiguously when this expression is used as a step target.
      // When construct is evaluated recursively (not as a step root), we return component[0].
      if (expr.components.length === 0) {
        throw new Error('construct expression has no components');
      }
      // Return first component value (caller may write all components if this is a step root)
      return evaluateValueExprSignal(expr.components[0], valueExprs, state);
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
      // Unary kernel: fn(input)
      const inputVal = evaluateValueExprSignal(expr.input, valueExprs, state);
      return applyPureFn(expr.fn, [inputVal]);
    }

    case 'zip': {
      // N-ary kernel: fn(inputs...)
      const inputVals = expr.inputs.map(id => evaluateValueExprSignal(id, valueExprs, state));
      return applyPureFn(expr.fn, inputVals);
    }

    case 'zipSig': {
      // ZipSig is field-extent only (requires field input)
      throw new Error('zipSig kernels are field-extent, not signal-extent');
    }

    case 'broadcast': {
      // Broadcast is signal → field (changes cardinality to many)
      throw new Error('broadcast kernels are field-extent, not signal-extent');
    }

    case 'reduce': {
      // Reduce is field → signal, but should never appear in signal evaluator
      // (reduce itself is evaluated at field level, result is read as signal)
      throw new Error('reduce kernels should be evaluated at field level, not signal level');
    }

    case 'pathDerivative': {
      // PathDerivative is field-extent only
      throw new Error('pathDerivative kernels are field-extent, not signal-extent');
    }

    default: {
      const _exhaustive: never = expr;
      throw new Error(`Unknown kernel kind: ${(_exhaustive as Extract<ValueExpr, { kind: 'kernel' }>).kernelKind}`);
    }
  }
}
