/**
 * ══════════════════════════════════════════════════════════════════════
 * SIGNAL KERNEL CONTRACT TESTS
 * ══════════════════════════════════════════════════════════════════════
 *
 * Tests for signal kernel contract enforcement:
 * - Phase wrapping for oscillators
 * - Input clamping for easing functions
 * - Edge case handling (smoothstep with equal edges)
 *
 * These tests verify the hardened contracts from 6-signal-kernel.md
 */

import { describe, it, expect } from 'vitest';

// We need to test through the exported evaluateSignal function
// Import the internal test helper that exposes applySignalKernel
import { testApplySignalKernel } from '../SignalEvaluator';

describe('Signal Kernel Contract Tests', () => {
  // ════════════════════════════════════════════════════════════════════
  // OSCILLATOR PHASE WRAPPING TESTS
  // ════════════════════════════════════════════════════════════════════

  describe('Oscillator Phase Wrapping', () => {
    it('oscSin: wraps phase > 1 correctly', () => {
      // 1.25 should behave like 0.25
      const at025 = testApplySignalKernel('oscSin', [0.25]);
      const at125 = testApplySignalKernel('oscSin', [1.25]);
      expect(at125).toBeCloseTo(at025, 10);

      // 2.5 should behave like 0.5
      const at05 = testApplySignalKernel('oscSin', [0.5]);
      const at25 = testApplySignalKernel('oscSin', [2.5]);
      expect(at25).toBeCloseTo(at05, 10);
    });

    it('oscSin: wraps negative phase correctly', () => {
      // -0.25 should behave like 0.75
      const at075 = testApplySignalKernel('oscSin', [0.75]);
      const atNeg025 = testApplySignalKernel('oscSin', [-0.25]);
      expect(atNeg025).toBeCloseTo(at075, 10);
    });

    it('oscCos: wraps phase > 1 correctly', () => {
      const at025 = testApplySignalKernel('oscCos', [0.25]);
      const at125 = testApplySignalKernel('oscCos', [1.25]);
      expect(at125).toBeCloseTo(at025, 10);
    });

    it('oscCos: wraps negative phase correctly', () => {
      const at075 = testApplySignalKernel('oscCos', [0.75]);
      const atNeg025 = testApplySignalKernel('oscCos', [-0.25]);
      expect(atNeg025).toBeCloseTo(at075, 10);
    });

    it('oscTan: wraps phase correctly', () => {
      const at01 = testApplySignalKernel('oscTan', [0.1]);
      const at11 = testApplySignalKernel('oscTan', [1.1]);
      expect(at11).toBeCloseTo(at01, 10);
    });

    it('triangle: wraps phase correctly', () => {
      const at025 = testApplySignalKernel('triangle', [0.25]);
      const at125 = testApplySignalKernel('triangle', [1.25]);
      expect(at125).toBeCloseTo(at025, 10);

      // Negative phase
      const at075 = testApplySignalKernel('triangle', [0.75]);
      const atNeg025 = testApplySignalKernel('triangle', [-0.25]);
      expect(atNeg025).toBeCloseTo(at075, 10);
    });

    it('square: wraps phase correctly', () => {
      const at025 = testApplySignalKernel('square', [0.25]);
      const at125 = testApplySignalKernel('square', [1.25]);
      expect(at125).toBe(at025);
    });

    it('sawtooth: wraps phase correctly', () => {
      const at025 = testApplySignalKernel('sawtooth', [0.25]);
      const at125 = testApplySignalKernel('sawtooth', [1.25]);
      expect(at125).toBeCloseTo(at025, 10);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // EASING INPUT CLAMPING TESTS
  // ════════════════════════════════════════════════════════════════════

  describe('Easing Input Clamping', () => {
    const easingFunctions = [
      'easeInQuad',
      'easeOutQuad',
      'easeInOutQuad',
      'easeInCubic',
      'easeOutCubic',
      'easeInOutCubic',
      'easeInElastic',
      'easeOutElastic',
      'easeOutBounce',
    ];

    for (const fn of easingFunctions) {
      it(`${fn}: t < 0 clamps to 0 (returns 0)`, () => {
        const result = testApplySignalKernel(fn, [-0.5]);
        expect(result).toBe(0);
      });

      it(`${fn}: t > 1 clamps to 1 (returns 1)`, () => {
        const result = testApplySignalKernel(fn, [1.5]);
        expect(result).toBe(1);
      });

      it(`${fn}: t = 0 returns 0`, () => {
        const result = testApplySignalKernel(fn, [0]);
        expect(result).toBe(0);
      });

      it(`${fn}: t = 1 returns 1`, () => {
        const result = testApplySignalKernel(fn, [1]);
        expect(result).toBe(1);
      });
    }
  });

  // ════════════════════════════════════════════════════════════════════
  // SMOOTHSTEP EDGE CASE TESTS
  // ════════════════════════════════════════════════════════════════════

  describe('Smoothstep Edge Cases', () => {
    it('smoothstep: edge0 === edge1 returns step function', () => {
      // When edges are equal, should return 0 if x < edge, 1 otherwise
      expect(testApplySignalKernel('smoothstep', [0.5, 0.5, 0.3])).toBe(0);
      expect(testApplySignalKernel('smoothstep', [0.5, 0.5, 0.5])).toBe(1);
      expect(testApplySignalKernel('smoothstep', [0.5, 0.5, 0.7])).toBe(1);
    });

    it('smoothstep: normal operation', () => {
      // At edge0
      expect(testApplySignalKernel('smoothstep', [0, 1, 0])).toBe(0);
      // At edge1
      expect(testApplySignalKernel('smoothstep', [0, 1, 1])).toBe(1);
      // At midpoint
      expect(testApplySignalKernel('smoothstep', [0, 1, 0.5])).toBe(0.5);
      // Below edge0
      expect(testApplySignalKernel('smoothstep', [0, 1, -0.5])).toBe(0);
      // Above edge1
      expect(testApplySignalKernel('smoothstep', [0, 1, 1.5])).toBe(1);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // OSCILLATOR OUTPUT RANGE TESTS
  // ════════════════════════════════════════════════════════════════════

  describe('Oscillator Output Ranges', () => {
    it('oscSin: output in [-1, 1]', () => {
      for (let p = 0; p < 1; p += 0.1) {
        const result = testApplySignalKernel('oscSin', [p]);
        expect(result).toBeGreaterThanOrEqual(-1);
        expect(result).toBeLessThanOrEqual(1);
      }
    });

    it('oscCos: output in [-1, 1]', () => {
      for (let p = 0; p < 1; p += 0.1) {
        const result = testApplySignalKernel('oscCos', [p]);
        expect(result).toBeGreaterThanOrEqual(-1);
        expect(result).toBeLessThanOrEqual(1);
      }
    });

    it('triangle: output in [-1, 1]', () => {
      for (let p = 0; p < 1; p += 0.1) {
        const result = testApplySignalKernel('triangle', [p]);
        expect(result).toBeGreaterThanOrEqual(-1);
        expect(result).toBeLessThanOrEqual(1);
      }
    });

    it('square: output is exactly -1 or 1', () => {
      for (let p = 0; p < 1; p += 0.1) {
        const result = testApplySignalKernel('square', [p]);
        expect(result === 1 || result === -1).toBe(true);
      }
    });

    it('sawtooth: output in [-1, 1]', () => {
      for (let p = 0; p < 1; p += 0.1) {
        const result = testApplySignalKernel('sawtooth', [p]);
        expect(result).toBeGreaterThanOrEqual(-1);
        expect(result).toBeLessThanOrEqual(1);
      }
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // NOISE OUTPUT RANGE TESTS
  // ════════════════════════════════════════════════════════════════════

  describe('Noise Output Range', () => {
    it('noise: output in [0, 1)', () => {
      for (let x = 0; x < 100; x += 7.3) {
        const result = testApplySignalKernel('noise', [x]);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThan(1);
      }
    });

    it('noise: deterministic', () => {
      const n1 = testApplySignalKernel('noise', [42.5]);
      const n2 = testApplySignalKernel('noise', [42.5]);
      expect(n1).toBe(n2);
    });
  });
});
