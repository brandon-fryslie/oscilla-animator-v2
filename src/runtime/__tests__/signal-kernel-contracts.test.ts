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

// Import from shared SignalKernelLibrary (single source of truth)
import { testApplySignalKernel } from '../SignalKernelLibrary';

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

    it('triangle: wraps phase > 1 correctly', () => {
      const at025 = testApplySignalKernel('triangle', [0.25]);
      const at125 = testApplySignalKernel('triangle', [1.25]);
      expect(at125).toBeCloseTo(at025, 10);
    });

    it('triangle: wraps negative phase correctly', () => {
      const at075 = testApplySignalKernel('triangle', [0.75]);
      const atNeg025 = testApplySignalKernel('triangle', [-0.25]);
      expect(atNeg025).toBeCloseTo(at075, 10);
    });

    it('square: wraps phase > 1 correctly', () => {
      const at025 = testApplySignalKernel('square', [0.25]);
      const at125 = testApplySignalKernel('square', [1.25]);
      expect(at125).toBe(at025);

      const at075 = testApplySignalKernel('square', [0.75]);
      const at175 = testApplySignalKernel('square', [1.75]);
      expect(at175).toBe(at075);
    });

    it('square: wraps negative phase correctly', () => {
      const at025 = testApplySignalKernel('square', [0.25]);
      const atNeg075 = testApplySignalKernel('square', [-0.75]);
      expect(atNeg075).toBe(at025);
    });

    it('sawtooth: wraps phase > 1 correctly', () => {
      const at025 = testApplySignalKernel('sawtooth', [0.25]);
      const at125 = testApplySignalKernel('sawtooth', [1.25]);
      expect(at125).toBeCloseTo(at025, 10);
    });

    it('sawtooth: wraps negative phase correctly', () => {
      const at075 = testApplySignalKernel('sawtooth', [0.75]);
      const atNeg025 = testApplySignalKernel('sawtooth', [-0.25]);
      expect(atNeg025).toBeCloseTo(at075, 10);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // EASING FUNCTION CLAMPING TESTS
  // ════════════════════════════════════════════════════════════════════

  describe('Easing Function Clamping', () => {
    it('easeInQuad: clamps t > 1', () => {
      const at1 = testApplySignalKernel('easeInQuad', [1]);
      const at2 = testApplySignalKernel('easeInQuad', [2]);
      expect(at2).toBe(at1);
      expect(at2).toBe(1); // Should be clamped to 1
    });

    it('easeInQuad: clamps t < 0', () => {
      const at0 = testApplySignalKernel('easeInQuad', [0]);
      const atNeg1 = testApplySignalKernel('easeInQuad', [-1]);
      expect(atNeg1).toBe(at0);
      expect(atNeg1).toBe(0); // Should be clamped to 0
    });

    it('easeOutQuad: clamps t > 1', () => {
      const at1 = testApplySignalKernel('easeOutQuad', [1]);
      const at2 = testApplySignalKernel('easeOutQuad', [2]);
      expect(at2).toBe(at1);
      expect(at2).toBe(1);
    });

    it('easeOutQuad: clamps t < 0', () => {
      const at0 = testApplySignalKernel('easeOutQuad', [0]);
      const atNeg1 = testApplySignalKernel('easeOutQuad', [-1]);
      expect(atNeg1).toBe(at0);
      expect(atNeg1).toBe(0);
    });

    it('easeInCubic: clamps t > 1', () => {
      const at1 = testApplySignalKernel('easeInCubic', [1]);
      const at2 = testApplySignalKernel('easeInCubic', [2]);
      expect(at2).toBe(at1);
      expect(at2).toBe(1);
    });

    it('easeInCubic: clamps t < 0', () => {
      const at0 = testApplySignalKernel('easeInCubic', [0]);
      const atNeg1 = testApplySignalKernel('easeInCubic', [-1]);
      expect(atNeg1).toBe(at0);
      expect(atNeg1).toBe(0);
    });

    it('easeInElastic: clamps t > 1', () => {
      const at1 = testApplySignalKernel('easeInElastic', [1]);
      const at2 = testApplySignalKernel('easeInElastic', [2]);
      expect(at2).toBe(at1);
      expect(at2).toBe(1);
    });

    it('easeInElastic: clamps t < 0', () => {
      const at0 = testApplySignalKernel('easeInElastic', [0]);
      const atNeg1 = testApplySignalKernel('easeInElastic', [-1]);
      expect(atNeg1).toBe(at0);
      expect(atNeg1).toBe(0);
    });

    it('easeOutElastic: clamps t > 1', () => {
      const at1 = testApplySignalKernel('easeOutElastic', [1]);
      const at2 = testApplySignalKernel('easeOutElastic', [2]);
      expect(at2).toBe(at1);
      expect(at2).toBe(1);
    });

    it('easeOutElastic: clamps t < 0', () => {
      const at0 = testApplySignalKernel('easeOutElastic', [0]);
      const atNeg1 = testApplySignalKernel('easeOutElastic', [-1]);
      expect(atNeg1).toBe(at0);
      expect(atNeg1).toBe(0);
    });

    it('easeOutBounce: clamps t > 1', () => {
      const at1 = testApplySignalKernel('easeOutBounce', [1]);
      const at2 = testApplySignalKernel('easeOutBounce', [2]);
      expect(at2).toBeCloseTo(at1, 10);
      expect(at2).toBeCloseTo(1, 10);
    });

    it('easeOutBounce: clamps t < 0', () => {
      const at0 = testApplySignalKernel('easeOutBounce', [0]);
      const atNeg1 = testApplySignalKernel('easeOutBounce', [-1]);
      expect(atNeg1).toBeCloseTo(at0, 10);
      expect(atNeg1).toBeCloseTo(0, 10);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // SHAPING FUNCTION EDGE CASE TESTS
  // ════════════════════════════════════════════════════════════════════

  describe('Shaping Function Edge Cases', () => {
    it('smoothstep: handles edge0 == edge1 correctly', () => {
      // When edges are equal, should act as a step function
      const result1 = testApplySignalKernel('smoothstep', [5, 5, 4]);
      expect(result1).toBe(0); // x < edge

      const result2 = testApplySignalKernel('smoothstep', [5, 5, 5]);
      expect(result2).toBe(1); // x >= edge

      const result3 = testApplySignalKernel('smoothstep', [5, 5, 6]);
      expect(result3).toBe(1); // x >= edge
    });

    it('smoothstep: interpolates correctly between edges', () => {
      // At edge0, should be 0
      const atEdge0 = testApplySignalKernel('smoothstep', [0, 1, 0]);
      expect(atEdge0).toBe(0);

      // At edge1, should be 1
      const atEdge1 = testApplySignalKernel('smoothstep', [0, 1, 1]);
      expect(atEdge1).toBe(1);

      // At midpoint, should be 0.5
      const atMid = testApplySignalKernel('smoothstep', [0, 1, 0.5]);
      expect(atMid).toBe(0.5);
    });

    it('step: basic threshold function', () => {
      const belowEdge = testApplySignalKernel('step', [5, 4]);
      expect(belowEdge).toBe(0);

      const atEdge = testApplySignalKernel('step', [5, 5]);
      expect(atEdge).toBe(1);

      const aboveEdge = testApplySignalKernel('step', [5, 6]);
      expect(aboveEdge).toBe(1);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // OUTPUT RANGE VERIFICATION
  // ════════════════════════════════════════════════════════════════════

  describe('Output Range Verification', () => {
    it('oscSin: output is in [-1, 1]', () => {
      const samples = [0, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, -0.5];
      for (const phase of samples) {
        const result = testApplySignalKernel('oscSin', [phase]);
        expect(result).toBeGreaterThanOrEqual(-1);
        expect(result).toBeLessThanOrEqual(1);
      }
    });

    it('triangle: output is in [-1, 1]', () => {
      const samples = [0, 0.25, 0.5, 0.75, 1.0, 1.5, -0.5];
      for (const phase of samples) {
        const result = testApplySignalKernel('triangle', [phase]);
        expect(result).toBeGreaterThanOrEqual(-1);
        expect(result).toBeLessThanOrEqual(1);
      }
    });

    it('easeInQuad: output is in [0, 1]', () => {
      const samples = [-0.5, 0, 0.25, 0.5, 0.75, 1.0, 1.5];
      for (const t of samples) {
        const result = testApplySignalKernel('easeInQuad', [t]);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(1);
      }
    });

    it('noise: output is in [0, 1)', () => {
      const samples = [0, 1, 2, 3, 42, 100, -5];
      for (const x of samples) {
        const result = testApplySignalKernel('noise', [x]);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThan(1);
      }
    });
  });
});
