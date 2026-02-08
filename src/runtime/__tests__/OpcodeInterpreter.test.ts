/**
 * ══════════════════════════════════════════════════════════════════════
 * PHASE 7 - OPCODE INTERPRETER UNIT TESTS
 * ══════════════════════════════════════════════════════════════════════
 *
 * Tests for scalar numeric operations (OpcodeInterpreter.ts)
 *
 * Coverage:
 * - Unary ops: sin, cos, floor, ceil, round, fract, sqrt, exp, log, sign
 * - Binary ops: sub, div, mod, pow, hash
 * - Ternary ops: clamp, lerp, select
 * - Variadic ops: add, mul, min, max
 * - Special cases: wrap01, abs, neg
 */

import { describe, it, expect } from 'vitest';
import { applyOpcode } from '../OpcodeInterpreter';

describe('OpcodeInterpreter - Unary Operations', () => {
  describe('Trigonometric (RADIANS)', () => {
    it('sin: computes sine in radians', () => {
      expect(applyOpcode('sin', [0])).toBeCloseTo(0);
      expect(applyOpcode('sin', [Math.PI / 2])).toBeCloseTo(1);
      expect(applyOpcode('sin', [Math.PI])).toBeCloseTo(0);
      expect(applyOpcode('sin', [3 * Math.PI / 2])).toBeCloseTo(-1);
    });

    it('cos: computes cosine in radians', () => {
      expect(applyOpcode('cos', [0])).toBeCloseTo(1);
      expect(applyOpcode('cos', [Math.PI / 2])).toBeCloseTo(0);
      expect(applyOpcode('cos', [Math.PI])).toBeCloseTo(-1);
      expect(applyOpcode('cos', [3 * Math.PI / 2])).toBeCloseTo(0);
    });

    it('tan: computes tangent in radians', () => {
      expect(applyOpcode('tan', [0])).toBeCloseTo(0);
      expect(applyOpcode('tan', [Math.PI / 4])).toBeCloseTo(1);
      expect(applyOpcode('tan', [-Math.PI / 4])).toBeCloseTo(-1);
    });
  });

  describe('Rounding', () => {
    it('floor: rounds down', () => {
      expect(applyOpcode('floor', [2.7])).toBe(2);
      expect(applyOpcode('floor', [2.1])).toBe(2);
      expect(applyOpcode('floor', [-2.7])).toBe(-3);
      expect(applyOpcode('floor', [3])).toBe(3);
    });

    it('ceil: rounds up', () => {
      expect(applyOpcode('ceil', [2.1])).toBe(3);
      expect(applyOpcode('ceil', [2.9])).toBe(3);
      expect(applyOpcode('ceil', [-2.1])).toBe(-2);
      expect(applyOpcode('ceil', [3])).toBe(3);
    });

    it('round: rounds to nearest', () => {
      expect(applyOpcode('round', [2.4])).toBe(2);
      expect(applyOpcode('round', [2.5])).toBe(3);
      expect(applyOpcode('round', [2.6])).toBe(3);
      expect(applyOpcode('round', [-2.5])).toBe(-2);
    });

    it('fract: extracts fractional part', () => {
      expect(applyOpcode('fract', [2.7])).toBeCloseTo(0.7);
      expect(applyOpcode('fract', [5.3])).toBeCloseTo(0.3);
      expect(applyOpcode('fract', [3])).toBeCloseTo(0);
      expect(applyOpcode('fract', [-1.3])).toBeCloseTo(0.7); // fract(x) = x - floor(x), floor(-1.3) = -2
    });
  });

  describe('Math functions', () => {
    it('sqrt: computes square root', () => {
      expect(applyOpcode('sqrt', [4])).toBe(2);
      expect(applyOpcode('sqrt', [9])).toBe(3);
      expect(applyOpcode('sqrt', [2])).toBeCloseTo(Math.sqrt(2));
      expect(applyOpcode('sqrt', [0])).toBe(0);
    });

    it('exp: computes e^x', () => {
      expect(applyOpcode('exp', [0])).toBe(1);
      expect(applyOpcode('exp', [1])).toBeCloseTo(Math.E);
      expect(applyOpcode('exp', [2])).toBeCloseTo(Math.E * Math.E);
    });

    it('log: computes natural logarithm', () => {
      expect(applyOpcode('log', [1])).toBe(0);
      expect(applyOpcode('log', [Math.E])).toBeCloseTo(1);
      expect(applyOpcode('log', [Math.E * Math.E])).toBeCloseTo(2);
    });

    it('sign: returns sign of number', () => {
      expect(applyOpcode('sign', [5])).toBe(1);
      expect(applyOpcode('sign', [-3])).toBe(-1);
      expect(applyOpcode('sign', [0])).toBe(0);
      // Note: Math.sign(-0) returns -0, not 0
    });

    it('abs: computes absolute value', () => {
      expect(applyOpcode('abs', [5])).toBe(5);
      expect(applyOpcode('abs', [-5])).toBe(5);
      expect(applyOpcode('abs', [0])).toBe(0);
    });

    it('neg: negates value', () => {
      expect(applyOpcode('neg', [5])).toBe(-5);
      expect(applyOpcode('neg', [-5])).toBe(5);
      expect(applyOpcode('neg', [0])).toBe(-0);
    });
  });

  describe('Phase/Wrapping', () => {
    it('wrap01: wraps to [0,1)', () => {
      expect(applyOpcode('wrap01', [0.5])).toBeCloseTo(0.5);
      expect(applyOpcode('wrap01', [0])).toBeCloseTo(0);
      expect(applyOpcode('wrap01', [1])).toBeCloseTo(0);
      expect(applyOpcode('wrap01', [1.3])).toBeCloseTo(0.3);
      expect(applyOpcode('wrap01', [2.7])).toBeCloseTo(0.7);
      expect(applyOpcode('wrap01', [-0.3])).toBeCloseTo(0.7);
      expect(applyOpcode('wrap01', [-1.3])).toBeCloseTo(0.7);
    });
  });
});

describe('OpcodeInterpreter - Binary Operations', () => {
  it('sub: subtraction', () => {
    expect(applyOpcode('sub', [5, 3])).toBe(2);
    expect(applyOpcode('sub', [3, 5])).toBe(-2);
    expect(applyOpcode('sub', [0, 0])).toBe(0);
  });

  it('div: division', () => {
    expect(applyOpcode('div', [6, 3])).toBe(2);
    expect(applyOpcode('div', [5, 2])).toBe(2.5);
    expect(applyOpcode('div', [1, 4])).toBe(0.25);
  });

  it('mod: modulo', () => {
    expect(applyOpcode('mod', [7, 3])).toBe(1);
    expect(applyOpcode('mod', [10, 5])).toBe(0);
    expect(applyOpcode('mod', [2.5, 1])).toBeCloseTo(0.5);
  });

  it('pow: power', () => {
    expect(applyOpcode('pow', [2, 3])).toBe(8);
    expect(applyOpcode('pow', [3, 2])).toBe(9);
    expect(applyOpcode('pow', [5, 0])).toBe(1);
    expect(applyOpcode('pow', [2, -1])).toBe(0.5);
  });

  it('hash: deterministic hash to [0,1)', () => {
    // Hash should be deterministic
    const h1 = applyOpcode('hash', [42, 0]);
    const h2 = applyOpcode('hash', [42, 0]);
    expect(h1).toBe(h2);

    // Hash should be in [0, 1)
    expect(h1).toBeGreaterThanOrEqual(0);
    expect(h1).toBeLessThan(1);

    // Different seeds should produce different results
    const h3 = applyOpcode('hash', [42, 1]);
    expect(h3).not.toBe(h1);

    // Different values should produce different results
    const h4 = applyOpcode('hash', [43, 0]);
    expect(h4).not.toBe(h1);
  });
});

describe('OpcodeInterpreter - Ternary Operations', () => {
  it('clamp: clamps value between min and max', () => {
    expect(applyOpcode('clamp', [0.5, 0, 1])).toBe(0.5);
    expect(applyOpcode('clamp', [-0.5, 0, 1])).toBe(0);
    expect(applyOpcode('clamp', [1.5, 0, 1])).toBe(1);
    expect(applyOpcode('clamp', [5, 0, 10])).toBe(5);
    expect(applyOpcode('clamp', [-5, 0, 10])).toBe(0);
    expect(applyOpcode('clamp', [15, 0, 10])).toBe(10);
  });

  it('lerp: linear interpolation', () => {
    expect(applyOpcode('lerp', [0, 10, 0])).toBe(0);
    expect(applyOpcode('lerp', [0, 10, 1])).toBe(10);
    expect(applyOpcode('lerp', [0, 10, 0.5])).toBe(5);
    expect(applyOpcode('lerp', [0, 10, 0.25])).toBe(2.5);
    expect(applyOpcode('lerp', [5, 15, 0.5])).toBe(10);
  });

  it('select: conditional selection', () => {
    // Condition true (> 0): returns valueIfTrue
    expect(applyOpcode('select', [1, 10, 20])).toBe(10);
    expect(applyOpcode('select', [0.5, 10, 20])).toBe(10);
    expect(applyOpcode('select', [100, 10, 20])).toBe(10);

    // Condition false (<= 0): returns valueIfFalse
    expect(applyOpcode('select', [0, 10, 20])).toBe(20);
    expect(applyOpcode('select', [-1, 10, 20])).toBe(20);
    expect(applyOpcode('select', [-0.5, 10, 20])).toBe(20);
  });
});

describe('OpcodeInterpreter - Variadic Operations', () => {
  it('add: sums all values', () => {
    expect(applyOpcode('add', [1, 2])).toBe(3);
    expect(applyOpcode('add', [1, 2, 3])).toBe(6);
    expect(applyOpcode('add', [1, 2, 3, 4, 5])).toBe(15);
  });

  it('mul: multiplies all values', () => {
    expect(applyOpcode('mul', [2, 3])).toBe(6);
    expect(applyOpcode('mul', [2, 3, 4])).toBe(24);
    expect(applyOpcode('mul', [1, 2, 3, 4, 5])).toBe(120);
  });

  it('min: finds minimum', () => {
    expect(applyOpcode('min', [5, 3])).toBe(3);
    expect(applyOpcode('min', [5, 3, 8, 1, 9])).toBe(1);
    expect(applyOpcode('min', [-5, -3, -8])).toBe(-8);
  });

  it('max: finds maximum', () => {
    expect(applyOpcode('max', [5, 3])).toBe(5);
    expect(applyOpcode('max', [5, 3, 8, 1, 9])).toBe(9);
    expect(applyOpcode('max', [-5, -3, -8])).toBe(-3);
  });
});

describe('OpcodeInterpreter - Error Handling', () => {
  it('throws on unknown opcode', () => {
    expect(() => applyOpcode('unknownOp', [1])).toThrow();
  });

  it('pow: requires exactly 2 arguments', () => {
    expect(() => applyOpcode('pow', [2, 3, 4])).toThrow(/exactly 2 argument/);
  });
});

describe('OpcodeInterpreter - F64ToI32Trunc', () => {
  it('truncates positive floats toward zero', () => {
    expect(applyOpcode('f64_to_i32_trunc', [2.7])).toBe(2);
    expect(applyOpcode('f64_to_i32_trunc', [2.1])).toBe(2);
    expect(applyOpcode('f64_to_i32_trunc', [2.9])).toBe(2);
  });

  it('truncates negative floats toward zero', () => {
    expect(applyOpcode('f64_to_i32_trunc', [-2.7])).toBe(-2);
    expect(applyOpcode('f64_to_i32_trunc', [-2.1])).toBe(-2);
    expect(applyOpcode('f64_to_i32_trunc', [-2.9])).toBe(-2);
  });

  it('preserves integers already in range', () => {
    expect(applyOpcode('f64_to_i32_trunc', [0])).toBe(0);
    expect(applyOpcode('f64_to_i32_trunc', [1])).toBe(1);
    expect(applyOpcode('f64_to_i32_trunc', [-1])).toBe(-1);
    expect(applyOpcode('f64_to_i32_trunc', [42])).toBe(42);
    expect(applyOpcode('f64_to_i32_trunc', [2147483647])).toBe(2147483647);
    expect(applyOpcode('f64_to_i32_trunc', [-2147483648])).toBe(-2147483648);
  });

  it('clamps overflow to i32 range', () => {
    expect(applyOpcode('f64_to_i32_trunc', [2147483648])).toBe(2147483647);
    expect(applyOpcode('f64_to_i32_trunc', [1e15])).toBe(2147483647);
    expect(applyOpcode('f64_to_i32_trunc', [-2147483649])).toBe(-2147483648);
    expect(applyOpcode('f64_to_i32_trunc', [-1e15])).toBe(-2147483648);
  });

  it('NaN returns 0', () => {
    expect(applyOpcode('f64_to_i32_trunc', [NaN])).toBe(0);
  });

  it('Infinity clamps to 0 (not finite)', () => {
    expect(applyOpcode('f64_to_i32_trunc', [Infinity])).toBe(0);
    expect(applyOpcode('f64_to_i32_trunc', [-Infinity])).toBe(0);
  });

  it('handles zero cases', () => {
    expect(applyOpcode('f64_to_i32_trunc', [0])).toBe(0);
    expect(applyOpcode('f64_to_i32_trunc', [-0])).toBe(0);
  });
});

describe('OpcodeInterpreter - I32ToF64', () => {
  it('preserves integer values unchanged', () => {
    expect(applyOpcode('i32_to_f64', [0])).toBe(0);
    expect(applyOpcode('i32_to_f64', [1])).toBe(1);
    expect(applyOpcode('i32_to_f64', [-1])).toBe(-1);
    expect(applyOpcode('i32_to_f64', [42])).toBe(42);
  });

  it('preserves i32 boundary values', () => {
    expect(applyOpcode('i32_to_f64', [2147483647])).toBe(2147483647);
    expect(applyOpcode('i32_to_f64', [-2147483648])).toBe(-2147483648);
  });

  it('identity semantics: float values pass through unchanged', () => {
    expect(applyOpcode('i32_to_f64', [3.14])).toBe(3.14);
    expect(applyOpcode('i32_to_f64', [-0.5])).toBe(-0.5);
  });
});

describe('OpcodeInterpreter - Strict Arity Enforcement', () => {
  describe('Binary ops require exactly 2 arguments', () => {
    it('sub: throws on 1 argument', () => {
      expect(() => applyOpcode('sub', [5])).toThrow(/not unary/);
    });

    it('sub: throws on 3+ arguments', () => {
      expect(() => applyOpcode('sub', [5, 3, 2])).toThrow(/exactly 2 argument/);
    });

    it('div: throws on 1 argument', () => {
      expect(() => applyOpcode('div', [6])).toThrow(/not unary/);
    });

    it('div: throws on 3+ arguments', () => {
      expect(() => applyOpcode('div', [6, 3, 2])).toThrow(/exactly 2 argument/);
    });

    it('mod: throws on 1 argument', () => {
      expect(() => applyOpcode('mod', [7])).toThrow(/not unary/);
    });

    it('mod: throws on 3+ arguments', () => {
      expect(() => applyOpcode('mod', [7, 3, 2])).toThrow(/exactly 2 argument/);
    });
  });

  describe('Ternary ops require exactly 3 arguments', () => {
    it('clamp: throws on 2 arguments', () => {
      expect(() => applyOpcode('clamp', [0.5, 0])).toThrow(/exactly 3 argument/);
    });

    it('clamp: throws on 4+ arguments', () => {
      expect(() => applyOpcode('clamp', [0.5, 0, 1, 2])).toThrow(/exactly 3 argument/);
    });

    it('lerp: throws on 2 arguments', () => {
      expect(() => applyOpcode('lerp', [0, 10])).toThrow(/exactly 3 argument/);
    });

    it('lerp: throws on 4+ arguments', () => {
      expect(() => applyOpcode('lerp', [0, 10, 0.5, 1])).toThrow(/exactly 3 argument/);
    });

    it('select: throws on 2 arguments', () => {
      expect(() => applyOpcode('select', [1, 10])).toThrow(/exactly 3 argument/);
    });

    it('select: throws on 4+ arguments', () => {
      expect(() => applyOpcode('select', [1, 10, 20, 30])).toThrow(/exactly 3 argument/);
    });
  });
});
