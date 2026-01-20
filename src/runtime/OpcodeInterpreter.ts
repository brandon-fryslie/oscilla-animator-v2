/**
 * Opcode Interpreter - SINGLE ENFORCER
 *
 * Unified opcode evaluation for all runtime modules.
 * Eliminates triple duplication of opcode dispatch logic.
 *
 * Adheres to architectural law: SINGLE ENFORCER
 *
 * IMPORTANT: Opcode-level sin/cos/tan operate on RADIANS, not phase.
 * These are used for field-level math where angles may already be in radians.
 * For phase-based oscillators, use SignalEvaluator kernels which accept phase [0,1).
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
