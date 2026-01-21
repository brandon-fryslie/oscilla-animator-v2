/**
 * Opcode Interpreter - SINGLE ENFORCER
 *
 * Unified opcode evaluation for all runtime modules.
 * This is the ONLY place that defines scalar numeric operations.
 *
 * Adheres to architectural law: SINGLE ENFORCER
 *
 * OPCODE REFERENCE:
 * ─────────────────────────────────────────────────────────────
 * UNARY (exactly 1 arg):
 *   neg, abs, sin, cos, tan, wrap01,
 *   floor, ceil, round, fract, sqrt, exp, log, sign
 *
 * BINARY (exactly 2 args):
 *   sub, div, mod, pow, hash
 *
 * TERNARY (exactly 3 args):
 *   clamp, lerp
 *
 * VARIADIC (1+ args):
 *   add, mul, min, max
 * ─────────────────────────────────────────────────────────────
 *
 * IMPORTANT: sin/cos/tan operate on RADIANS, not phase.
 * For phase-based oscillators, use SignalEvaluator kernels.
 */

/**
 * Apply an opcode to a list of values
 *
 * @param opcode - Opcode name as string
 * @param values - Input values
 * @returns Result of applying the opcode
 */
export function applyOpcode(opcode: string, values: number[]): number {
  // Dispatch based on arity
  if (values.length === 1) {
    return applyUnaryOp(opcode, values[0]);
  }
  return applyNaryOp(opcode, values);
}

/**
 * Validate opcode arity - throws if mismatch
 */
function expectArity(op: string, got: number, expected: number): void {
  if (got !== expected) {
    throw new Error(`OpCode '${op}' requires exactly ${expected} argument(s), got ${got}`);
  }
}

/**
 * Apply a unary opcode to a single value
 *
 * @param op - Opcode name
 * @param x - Input value
 * @returns Result
 */
function applyUnaryOp(op: string, x: number): number {
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
      return ((x % 1) + 1) % 1;
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
    default:
      throw new Error(`OpCode ${op} is not unary`);
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
      return values.reduce((a, b) => a + b, 0);
    case 'sub':
      return values.length >= 2 ? values[0] - values[1] : -values[0];
    case 'mul':
      return values.reduce((a, b) => a * b, 1);
    case 'div':
      return values.length >= 2 ? values[0] / values[1] : 1 / values[0];
    case 'mod':
      return values.length >= 2 ? values[0] % values[1] : 0;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    case 'clamp':
      return values.length >= 3
        ? Math.max(values[1], Math.min(values[2], values[0]))
        : values[0];
    case 'lerp':
      return values.length >= 3
        ? values[0] * (1 - values[2]) + values[1] * values[2]
        : values[0];
    case 'pow':
      expectArity('pow', values.length, 2);
      return Math.pow(values[0], values[1]);
    case 'hash': {
      // Deterministic hash function for seeded randomness
      // Input: (value, seed) → Output: [0, 1)
      const [value, seed = 0] = values;

      // xxHash-style mixing for good distribution
      let h = Math.floor(value * 2654435761) ^ Math.floor(seed * 2246822519);
      h = Math.imul(h ^ (h >>> 15), 2246822519);
      h = Math.imul(h ^ (h >>> 13), 3266489917);
      h = (h ^ (h >>> 16)) >>> 0;

      // Normalize to [0, 1)
      return h / 0x100000000;
    }
    default:
      // Try unary if single value
      if (values.length === 1) {
        return applyUnaryOp(op, values[0]);
      }
      throw new Error(`OpCode ${op} not implemented for ${values.length} args`);
  }
}
