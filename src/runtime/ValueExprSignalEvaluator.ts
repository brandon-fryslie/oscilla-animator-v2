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
import type { PureFn } from '../compiler/ir/types';
import type { RuntimeState } from './RuntimeState';
import { applyOpcode } from './OpcodeInterpreter';
import { recordNaN, recordInfinity } from './HealthMonitor';
import { constValueAsNumber } from '../core/canonical-types';

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
      return applyPureFn(expr.fn, [input], state);
    }

    case 'zip': {
      const inputs = expr.inputs.map(id => evaluateValueExprSignal(id, valueExprs, state));
      return applyPureFn(expr.fn, inputs, state);
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

/**
 * Apply a pure function to values
 *
 * This is identical to the implementation in SignalEvaluator.ts.
 * Consider extracting to a shared module if this duplication becomes problematic.
 */
function applyPureFn(
  fn: PureFn,
  values: number[],
  state: RuntimeState
): number {
  switch (fn.kind) {
    case 'opcode':
      return applyOpcode(fn.opcode, values);

    case 'kernel':
      return applySignalKernel(fn.name, values, state);

    case 'expr':
      throw new Error(`PureFn kind 'expr' not yet implemented`);

    case 'composed': {
      // Apply each opcode in sequence
      let result = values[0];
      for (const op of fn.ops) {
        result = applyOpcode(op, [result]);
      }
      return result;
    }

    default: {
      const _exhaustive: never = fn;
      throw new Error(`Unknown PureFn kind: ${(_exhaustive as PureFn).kind}`);
    }
  }
}

/**
 * Apply kernel function at signal level
 *
 * This is a copy of applySignalKernel from SignalEvaluator.ts.
 * We duplicate it here to keep ValueExpr evaluation completely independent
 * during the migration phase.
 *
 * IMPORTANT: Signal kernels oscSin/oscCos/oscTan expect PHASE [0,1), not radians.
 * They convert phase to radians internally (phase * 2π) before applying Math functions.
 * This is the standard expectation for oscillator blocks.
 */

// ═══════════════════════════════════════════════════════════════════════════
// SIGNAL KERNEL HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wrap phase value to [0, 1) range.
 * Handles negative values correctly: -0.25 → 0.75
 */
function wrapPhase(p: number): number {
  const t = p - Math.floor(p);
  return t; // ∈ [0,1)
}

/**
 * Clamp value to [0, 1] range.
 * Used by easing functions to ensure well-defined output.
 */
function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// ═══════════════════════════════════════════════════════════════════════════
// SIGNAL KERNEL IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

function applySignalKernel(name: string, values: number[], _state: RuntimeState): number {
  switch (name) {
    // === OSCILLATORS (phase [0,1) → [-1,1], auto-wrapped) ===

    case 'oscSin': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'oscSin' expects 1 input, got ${values.length}`);
      }
      const p = wrapPhase(values[0]);
      return Math.sin(p * 2 * Math.PI);
    }

    case 'oscCos': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'oscCos' expects 1 input, got ${values.length}`);
      }
      const p = wrapPhase(values[0]);
      return Math.cos(p * 2 * Math.PI);
    }

    case 'oscTan': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'oscTan' expects 1 input, got ${values.length}`);
      }
      const p = wrapPhase(values[0]);
      return Math.tan(p * 2 * Math.PI);
    }

    // Waveform kernels - input is phase (0..1), output is -1..1 (auto-wrapped)
    case 'triangle': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'triangle' expects 1 input, got ${values.length}`);
      }
      const t = wrapPhase(values[0]);
      return 4 * Math.abs(t - 0.5) - 1;
    }

    case 'square': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'square' expects 1 input, got ${values.length}`);
      }
      const t = wrapPhase(values[0]);
      return t < 0.5 ? 1 : -1;
    }

    case 'sawtooth': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'sawtooth' expects 1 input, got ${values.length}`);
      }
      const t = wrapPhase(values[0]);
      return 2 * t - 1;
    }

    // === SHAPING FUNCTIONS ===

    case 'smoothstep': {
      if (values.length !== 3) {
        throw new Error(`Signal kernel 'smoothstep' expects 3 inputs (edge0, edge1, x), got ${values.length}`);
      }
      const edge0 = values[0], edge1 = values[1], x = values[2];
      // Handle degenerate case where edges are equal
      if (edge0 === edge1) return x < edge0 ? 0 : 1;
      const t = clamp01((x - edge0) / (edge1 - edge0));
      return t * t * (3 - 2 * t);
    }

    case 'step': {
      if (values.length !== 2) {
        throw new Error(`Signal kernel 'step' expects 2 inputs (edge, x), got ${values.length}`);
      }
      // Returns 0 if x < edge, 1 otherwise
      return values[1] < values[0] ? 0 : 1;
    }

    // === EASING FUNCTIONS (t [0,1] → u [0,1], clamped) ===

    case 'easeInQuad': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'easeInQuad' expects 1 input, got ${values.length}`);
      }
      const t = clamp01(values[0]);
      return t * t;
    }

    case 'easeOutQuad': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'easeOutQuad' expects 1 input, got ${values.length}`);
      }
      const t = clamp01(values[0]);
      return t * (2 - t);
    }

    case 'easeInOutQuad': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'easeInOutQuad' expects 1 input, got ${values.length}`);
      }
      const t = clamp01(values[0]);
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    case 'easeInCubic': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'easeInCubic' expects 1 input, got ${values.length}`);
      }
      const t = clamp01(values[0]);
      return t * t * t;
    }

    case 'easeOutCubic': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'easeOutCubic' expects 1 input, got ${values.length}`);
      }
      const t = clamp01(values[0]) - 1;
      return t * t * t + 1;
    }

    case 'easeInOutCubic': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'easeInOutCubic' expects 1 input, got ${values.length}`);
      }
      const t = clamp01(values[0]);
      return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
    }

    case 'easeInElastic': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'easeInElastic' expects 1 input, got ${values.length}`);
      }
      const t = clamp01(values[0]);
      if (t === 0 || t === 1) return t;
      return -Math.pow(2, 10 * (t - 1)) * Math.sin((t - 1.1) * 5 * Math.PI);
    }

    case 'easeOutElastic': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'easeOutElastic' expects 1 input, got ${values.length}`);
      }
      const t = clamp01(values[0]);
      if (t === 0 || t === 1) return t;
      return Math.pow(2, -10 * t) * Math.sin((t - 0.1) * 5 * Math.PI) + 1;
    }

    case 'easeOutBounce': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'easeOutBounce' expects 1 input, got ${values.length}`);
      }
      let t = clamp01(values[0]);
      const n1 = 7.5625, d1 = 2.75;
      if (t < 1 / d1) {
        return n1 * t * t;
      } else if (t < 2 / d1) {
        return n1 * (t -= 1.5 / d1) * t + 0.75;
      } else if (t < 2.5 / d1) {
        return n1 * (t -= 2.25 / d1) * t + 0.9375;
      } else {
        return n1 * (t -= 2.625 / d1) * t + 0.984375;
      }
    }

    // === NOISE (deterministic, seed-based) ===

    case 'noise': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'noise' expects 1 input, got ${values.length}`);
      }
      // Simple hash-based noise, deterministic
      const x = values[0];
      const n = Math.sin(x * 12.9898 + 78.233) * 43758.5453;
      return n - Math.floor(n);
    }

    // === COMBINE KERNELS (multi-input signal combination) ===

    case 'combine_sum': {
      return values.reduce((a, b) => a + b, 0);
    }

    case 'combine_average': {
      if (values.length === 0) return 0;
      return values.reduce((a, b) => a + b, 0) / values.length;
    }

    case 'combine_max': {
      if (values.length === 0) return -Infinity;
      return Math.max(...values);
    }

    case 'combine_min': {
      if (values.length === 0) return Infinity;
      return Math.min(...values);
    }

    case 'combine_last': {
      if (values.length === 0) return 0;
      return values[values.length - 1];
    }

    // === COMPONENT EXTRACTION (vec3/color → float) ===

    case 'vec3ExtractX': {
      if (values.length !== 3) {
        throw new Error(`Signal kernel 'vec3ExtractX' expects 3 inputs (vec3 components), got ${values.length}`);
      }
      return values[0];
    }

    case 'vec3ExtractY': {
      if (values.length !== 3) {
        throw new Error(`Signal kernel 'vec3ExtractY' expects 3 inputs (vec3 components), got ${values.length}`);
      }
      return values[1];
    }

    case 'vec3ExtractZ': {
      if (values.length !== 3) {
        throw new Error(`Signal kernel 'vec3ExtractZ' expects 3 inputs (vec3 components), got ${values.length}`);
      }
      return values[2];
    }

    case 'colorExtractR': {
      if (values.length !== 4) {
        throw new Error(`Signal kernel 'colorExtractR' expects 4 inputs (color components), got ${values.length}`);
      }
      return values[0];
    }

    case 'colorExtractG': {
      if (values.length !== 4) {
        throw new Error(`Signal kernel 'colorExtractG' expects 4 inputs (color components), got ${values.length}`);
      }
      return values[1];
    }

    case 'colorExtractB': {
      if (values.length !== 4) {
        throw new Error(`Signal kernel 'colorExtractB' expects 4 inputs (color components), got ${values.length}`);
      }
      return values[2];
    }

    case 'colorExtractA': {
      if (values.length !== 4) {
        throw new Error(`Signal kernel 'colorExtractA' expects 4 inputs (color components), got ${values.length}`);
      }
      return values[3];
    }

    // === VECTOR CONSTRUCTION (for swizzle results) ===
    // Note: These return multi-component values, which requires special handling.
    // For now, they throw an error similar to other vec2-returning kernels.
    // Future: Support multi-component signal returns via tuple slots or similar mechanism.

    case 'makeVec2Sig': {
      if (values.length !== 2) {
        throw new Error(`Signal kernel 'makeVec2Sig' expects 2 inputs, got ${values.length}`);
      }
      throw new Error('makeVec2Sig: multi-component signal returns not yet supported');
    }

    case 'makeVec3Sig': {
      if (values.length !== 3) {
        throw new Error(`Signal kernel 'makeVec3Sig' expects 3 inputs, got ${values.length}`);
      }
      throw new Error('makeVec3Sig: multi-component signal returns not yet supported');
    }

    case 'makeColorSig': {
      if (values.length !== 4) {
        throw new Error(`Signal kernel 'makeColorSig' expects 4 inputs, got ${values.length}`);
      }
      throw new Error('makeColorSig: multi-component signal returns not yet supported');
    }

    // vec2 kernels not supported at signal level
    case 'polarToCartesian':
    case 'offsetPosition':
    case 'circleLayout':
    case 'circleAngle':
      throw new Error(
        `Signal kernel '${name}' returns vec2 which is not yet supported at signal level. ` +
        `Use field-level version instead (fieldZipSig or fieldMap).`
      );

    default:
      throw new Error(`Unknown signal kernel: ${name}`);
  }
}
