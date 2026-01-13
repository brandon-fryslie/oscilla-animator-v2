/**
 * Signal Evaluator - SINGLE SOURCE OF TRUTH
 *
 * Unified signal evaluation for both ScheduleExecutor and Materializer.
 * Eliminates ~90 lines of code duplication.
 *
 * Adheres to architectural law: ONE SOURCE OF TRUTH
 *
 * Sprint 2: Adds NaN/Inf detection with batched reporting
 */

import type { SigExpr } from '../compiler/ir/types';
import type { SigExprId } from '../types';
import type { RuntimeState } from './RuntimeState';
import { applyOpcode } from './OpcodeInterpreter';
import { recordNaN, recordInfinity } from './HealthMonitor';

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
      return typeof expr.value === 'number' ? expr.value : 0;
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
      const timeExpr = expr as { which: 'tMs' | 'phaseA' | 'phaseB' | 'dt' | 'pulse' | 'progress' };
      switch (timeExpr.which) {
        case 'tMs':
          return state.time.tMs;
        case 'dt':
          return state.time.dt;
        case 'phaseA':
          return state.time.phaseA;
        case 'phaseB':
          return state.time.phaseB;
        case 'pulse':
          return state.time.pulse;
        case 'progress':
          return state.time.progress ?? 0;
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

    case 'stateRead': {
      // Read from persistent state array
      return state.state[expr.stateSlot as number];
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
  if (fn.kind === 'kernel') {
    return applySignalKernel(fn.name, values);
  }
  throw new Error(`PureFn kind ${fn.kind} not implemented`);
}

/**
 * Apply kernel function at signal level
 *
 * Signal kernels operate on scalar values (single numbers).
 * Note: vec2 kernels are not supported at signal level - use field-level versions.
 */
function applySignalKernel(name: string, values: number[]): number {
  switch (name) {
    case 'sin':
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'sin' expects 1 input, got ${values.length}`);
      }
      return Math.sin(values[0]);

    case 'cos':
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'cos' expects 1 input, got ${values.length}`);
      }
      return Math.cos(values[0]);

    case 'tan':
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'tan' expects 1 input, got ${values.length}`);
      }
      return Math.tan(values[0]);

    // Waveform kernels - input is phase (0..1), output is -1..1 or 0..1
    case 'triangle': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'triangle' expects 1 input, got ${values.length}`);
      }
      // Triangle wave: rises from -1 to 1, then falls back to -1
      const t = values[0] % 1;
      return 4 * Math.abs(t - 0.5) - 1;
    }

    case 'square': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'square' expects 1 input, got ${values.length}`);
      }
      // Square wave: 1 for first half, -1 for second half
      const t = values[0] % 1;
      return t < 0.5 ? 1 : -1;
    }

    case 'sawtooth': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'sawtooth' expects 1 input, got ${values.length}`);
      }
      // Sawtooth wave: rises from -1 to 1 over the period
      const t = values[0] % 1;
      return 2 * t - 1;
    }

    // === MATH FUNCTIONS ===

    case 'abs': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'abs' expects 1 input, got ${values.length}`);
      }
      return Math.abs(values[0]);
    }

    case 'floor': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'floor' expects 1 input, got ${values.length}`);
      }
      return Math.floor(values[0]);
    }

    case 'ceil': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'ceil' expects 1 input, got ${values.length}`);
      }
      return Math.ceil(values[0]);
    }

    case 'round': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'round' expects 1 input, got ${values.length}`);
      }
      return Math.round(values[0]);
    }

    case 'fract': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'fract' expects 1 input, got ${values.length}`);
      }
      // Fractional part (always positive, like GLSL)
      const x = values[0];
      return x - Math.floor(x);
    }

    case 'sqrt': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'sqrt' expects 1 input, got ${values.length}`);
      }
      return Math.sqrt(values[0]);
    }

    case 'exp': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'exp' expects 1 input, got ${values.length}`);
      }
      return Math.exp(values[0]);
    }

    case 'log': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'log' expects 1 input, got ${values.length}`);
      }
      return Math.log(values[0]);
    }

    case 'pow': {
      if (values.length !== 2) {
        throw new Error(`Signal kernel 'pow' expects 2 inputs, got ${values.length}`);
      }
      return Math.pow(values[0], values[1]);
    }

    case 'min': {
      if (values.length !== 2) {
        throw new Error(`Signal kernel 'min' expects 2 inputs, got ${values.length}`);
      }
      return Math.min(values[0], values[1]);
    }

    case 'max': {
      if (values.length !== 2) {
        throw new Error(`Signal kernel 'max' expects 2 inputs, got ${values.length}`);
      }
      return Math.max(values[0], values[1]);
    }

    case 'clamp': {
      if (values.length !== 3) {
        throw new Error(`Signal kernel 'clamp' expects 3 inputs (value, min, max), got ${values.length}`);
      }
      return Math.min(Math.max(values[0], values[1]), values[2]);
    }

    case 'mix': {
      if (values.length !== 3) {
        throw new Error(`Signal kernel 'mix' expects 3 inputs (a, b, t), got ${values.length}`);
      }
      // Linear interpolation: a + (b - a) * t
      return values[0] + (values[1] - values[0]) * values[2];
    }

    case 'smoothstep': {
      if (values.length !== 3) {
        throw new Error(`Signal kernel 'smoothstep' expects 3 inputs (edge0, edge1, x), got ${values.length}`);
      }
      // Hermite interpolation with clamping
      const edge0 = values[0], edge1 = values[1], x = values[2];
      const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
      return t * t * (3 - 2 * t);
    }

    case 'step': {
      if (values.length !== 2) {
        throw new Error(`Signal kernel 'step' expects 2 inputs (edge, x), got ${values.length}`);
      }
      // Returns 0 if x < edge, 1 otherwise
      return values[1] < values[0] ? 0 : 1;
    }

    case 'sign': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'sign' expects 1 input, got ${values.length}`);
      }
      return Math.sign(values[0]);
    }

    // === EASING FUNCTIONS (input 0..1, output 0..1) ===

    case 'easeInQuad': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'easeInQuad' expects 1 input, got ${values.length}`);
      }
      const t = values[0];
      return t * t;
    }

    case 'easeOutQuad': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'easeOutQuad' expects 1 input, got ${values.length}`);
      }
      const t = values[0];
      return t * (2 - t);
    }

    case 'easeInOutQuad': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'easeInOutQuad' expects 1 input, got ${values.length}`);
      }
      const t = values[0];
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    case 'easeInCubic': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'easeInCubic' expects 1 input, got ${values.length}`);
      }
      const t = values[0];
      return t * t * t;
    }

    case 'easeOutCubic': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'easeOutCubic' expects 1 input, got ${values.length}`);
      }
      const t = values[0] - 1;
      return t * t * t + 1;
    }

    case 'easeInOutCubic': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'easeInOutCubic' expects 1 input, got ${values.length}`);
      }
      const t = values[0];
      return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
    }

    case 'easeInElastic': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'easeInElastic' expects 1 input, got ${values.length}`);
      }
      const t = values[0];
      if (t === 0 || t === 1) return t;
      return -Math.pow(2, 10 * (t - 1)) * Math.sin((t - 1.1) * 5 * Math.PI);
    }

    case 'easeOutElastic': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'easeOutElastic' expects 1 input, got ${values.length}`);
      }
      const t = values[0];
      if (t === 0 || t === 1) return t;
      return Math.pow(2, -10 * t) * Math.sin((t - 0.1) * 5 * Math.PI) + 1;
    }

    case 'easeOutBounce': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'easeOutBounce' expects 1 input, got ${values.length}`);
      }
      let t = values[0];
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
