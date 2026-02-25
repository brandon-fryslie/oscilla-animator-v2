/**
 * ══════════════════════════════════════════════════════════════════════
 * OPCODE INTERPRETER - SINGLE ENFORCER
 * ══════════════════════════════════════════════════════════════════════
 *
 * This is the ONLY place that defines scalar numeric operations.
 * All runtime modules (legacy evaluators, materializers) delegate here.
 *
 * ARCHITECTURAL LAW: SINGLE ENFORCER
 * - No other module may implement scalar math
 * - No duplication of these operations anywhere
 *
 * ──────────────────────────────────────────────────────────────────────
 * OPCODE REFERENCE
 * ──────────────────────────────────────────────────────────────────────
 *
 * UNARY (exactly 1 argument):
 *   neg      - Negation: -x
 *   abs      - Absolute value: |x|
 *   sin      - Sine (RADIANS): Math.sin(x)
 *   cos      - Cosine (RADIANS): Math.cos(x)
 *   tan      - Tangent (RADIANS): Math.tan(x)
 *   wrap01   - Wrap to [0,1): ((x % 1) + 1) % 1
 *   floor    - Floor: Math.floor(x)
 *   ceil     - Ceiling: Math.ceil(x)
 *   round    - Round: Math.round(x)
 *   fract    - Fractional part: x - floor(x)
 *   sqrt     - Square root: Math.sqrt(x)
 *   exp      - Exponential: Math.exp(x)
 *   log      - Natural log: Math.log(x)
 *   sign     - Sign: -1, 0, or 1
 *   f64_to_i32_trunc - Float to int: trunc toward zero, clamp to i32, NaN→0
 *   i32_to_f64       - Int to float: identity in JS (type boundary marker)
 *   identity         - Identity: returns input unchanged (used by cheater adapters)
 *
 * BINARY (exactly 2 arguments):
 *   sub      - Subtraction: a - b
 *   div      - Division: a / b
 *   mod      - Modulo: a % b
 *   pow      - Power: a^b
 *   atan2    - Arc tangent: Math.atan2(y, x)
 *   hash     - Deterministic hash: (value, seed) → [0,1)
 *
 * TERNARY (exactly 3 arguments):
 *   clamp    - Clamp: clamp(x, min, max)
 *   lerp     - Linear interp: lerp(a, b, t)
 *   select   - Conditional: select(cond, ifTrue, ifFalse) → cond > 0 ? ifTrue : ifFalse
 *
 * VARIADIC (1+ arguments):
 *   add      - Sum: a + b + c + ...
 *   mul      - Product: a * b * c * ...
 *   min      - Minimum: min(a, b, c, ...)
 *   max      - Maximum: max(a, b, c, ...)
 *
 * ──────────────────────────────────────────────────────────────────────
 * VECTOR SEMANTICS (component-wise)
 * ──────────────────────────────────────────────────────────────────────
 *
 * Opcodes are SCALAR operations. When applied to vector fields (vec2,
 * vec3, color), the materializer dispatches per-lane, per-component:
 *
 *   sin(vec2) = [sin(x), sin(y)]
 *   add(vec3, vec3) = [x1+x2, y1+y2, z1+z2]
 *
 * This component-wise application is intentional. The materializer
 * iterates: for each element i, for each component c, apply opcode.
 * See ValueExprMaterializer.ts applyZip/applyMap for the dispatch loop.
 *
 * ──────────────────────────────────────────────────────────────────────
 * IMPORTANT: RADIANS vs PHASE
 * ──────────────────────────────────────────────────────────────────────
 *
 * Opcode sin/cos/tan operate on RADIANS (raw Math functions).
 * Use these for field-level math where angles are already in radians.
 *
 * For PHASE-based oscillators (input [0,1) → output [-1,1]):
 * Use oscillator kernels: oscSin, oscCos, oscTan, triangle, etc.
 * These convert phase to radians internally (phase * 2π).
 *
 * ══════════════════════════════════════════════════════════════════════
 */

import { wrapToPhase01 } from '../utilities/phase';

// Module-level reducer functions (hoisted to avoid per-call closure allocation)
function _reduceAdd(a: number, b: number): number { return a + b; }
function _reduceMul(a: number, b: number): number { return a * b; }
const UNARY_OPS = new Set<string>([
  'neg',
  'abs',
  'sin',
  'cos',
  'tan',
  'wrap01',
  'floor',
  'ceil',
  'round',
  'fract',
  'sqrt',
  'exp',
  'log',
  'sign',
  'f64_to_i32_trunc',
  'i32_to_f64',
  'identity',
]);

/**
 * Apply an opcode to a list of values
 *
 * @param opcode - Opcode name as string
 * @param values - Input values
 * @returns Result of applying the opcode
 */
export function applyOpcode(opcode: string, values: number[]): number {
  // [LAW:single-enforcer] Arity dispatch is centralized here so all scalar
  // opcode callsites share one behavior contract.
  if (UNARY_OPS.has(opcode)) return applyUnaryOp(opcode, values[0], values.length);
  return applyNaryOp(opcode, values);
}

/**
 * Validate opcode arity - throws if mismatch
 */
function expectArity(op: string, got: number, expected: number): void {
  if (got !== expected) {
    throw new Error('OpCode \'' + op + '\' requires exactly ' + expected + ' argument(s), got ' + got);
  }
}

function expectMinArity(op: string, got: number, expectedMin: number): void {
  if (got < expectedMin) {
    throw new Error('OpCode \'' + op + '\' requires at least ' + expectedMin + ' argument(s), got ' + got);
  }
}

/**
 * Apply a unary opcode to a single value
 *
 * @param op - Opcode name
 * @param x - Input value
 * @returns Result
 */
function applyUnaryOp(op: string, x: number, got: number): number {
  expectArity(op, got, 1);
  switch (op) {
    case 'neg':
      return -x;
    case 'abs':
      return Math.abs(x);
    case 'sin':
      // Opcode sin operates on RADIANS (not phase)
      // Used for field-level math where angles are already in radians
      return Math.sin(x);
    case 'cos':
      // Opcode cos operates on RADIANS (not phase)
      // Used for field-level math where angles are already in radians
      return Math.cos(x);
    case 'tan':
      // Opcode tan operates on RADIANS (not phase)
      // Used for field-level math where angles are already in radians
      return Math.tan(x);
    case 'wrap01':
      return wrapToPhase01(x);
    case 'floor':
      return Math.floor(x);
    case 'ceil':
      return Math.ceil(x);
    case 'round':
      return Math.round(x);
    case 'fract':
      return x - Math.floor(x);
    case 'sqrt':
      return Math.sqrt(x);
    case 'exp':
      return Math.exp(x);
    case 'log':
      return Math.log(x);
    case 'sign':
      return Math.sign(x);
    case 'f64_to_i32_trunc': {
      if (!Number.isFinite(x)) return 0;
      const t = Math.trunc(x);
      if (t > 2147483647) return 2147483647;
      if (t < -2147483648) return -2147483648;
      return t || 0; // normalize -0 to +0
    }
    case 'i32_to_f64':
      return x; // Identity in JS — type boundary marker
    case 'identity':
      return x; // Identity — used by cheater adapters
    default:
      throw new Error('OpCode ' + op + ' is not unary');
  }
}

/**
 * Apply an n-ary opcode to multiple values
 *
 * @param op - Opcode name
 * @param values - Input values
 * @returns Result
 */
function applyNaryOp(op: string, values: number[]): number {
  switch (op) {
    case 'add':
      expectMinArity('add', values.length, 1);
      return values.reduce(_reduceAdd, 0);
    case 'sub':
      expectArity('sub', values.length, 2);
      return values[0] - values[1];
    case 'mul':
      expectMinArity('mul', values.length, 1);
      return values.reduce(_reduceMul, 1);
    case 'div':
      expectArity('div', values.length, 2);
      return values[0] / values[1];
    case 'mod':
      expectArity('mod', values.length, 2);
      return values[0] % values[1];
    case 'min':
      expectMinArity('min', values.length, 1);
      return Math.min(...values);
    case 'max':
      expectMinArity('max', values.length, 1);
      return Math.max(...values);
    case 'clamp':
      expectArity('clamp', values.length, 3);
      return Math.max(values[1], Math.min(values[2], values[0]));
    case 'lerp':
      expectArity('lerp', values.length, 3);
      return values[0] * (1 - values[2]) + values[1] * values[2];
    case 'pow':
      expectArity('pow', values.length, 2);
      return Math.pow(values[0], values[1]);
    case 'eq':
      expectArity('eq', values.length, 2);
      return values[0] === values[1] ? 1 : 0;
    case 'lt':
      expectArity('lt', values.length, 2);
      return values[0] < values[1] ? 1 : 0;
    case 'gt':
      expectArity('gt', values.length, 2);
      return values[0] > values[1] ? 1 : 0;
    case 'atan2':
      expectArity('atan2', values.length, 2);
      return Math.atan2(values[0], values[1]);
    case 'hash': {
      expectArity('hash', values.length, 2);
      // Deterministic hash function for seeded randomness
      // Input: (value, seed) → Output: [0, 1)
      const [value, seed] = values;

      // xxHash-style mixing for good distribution
      let h = Math.floor(value * 2654435761) ^ Math.floor(seed * 2246822519);
      h = Math.imul(h ^ (h >>> 15), 2246822519);
      h = Math.imul(h ^ (h >>> 13), 3266489917);
      h = (h ^ (h >>> 16)) >>> 0;

      // Normalize to [0, 1)
      return h / 0x100000000;
    }
    case 'select':
      expectArity('select', values.length, 3);
      // select(condition, valueIfTrue, valueIfFalse)
      return values[0] > 0 ? values[1] : values[2];
    default:
      throw new Error('OpCode ' + op + ' is unsupported for ' + values.length + ' args');
  }
}
