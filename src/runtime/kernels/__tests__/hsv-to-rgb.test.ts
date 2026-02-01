/**
 * ══════════════════════════════════════════════════════════════════════
 * HSV_TO_RGB TESTS
 * ══════════════════════════════════════════════════════════════════════
 *
 * Tests for HSV to RGBA conversion kernel.
 *
 * Test Coverage:
 * - Known color conversions (hue wheel positions)
 * - Output in [0, 1] range
 * - Alpha always 1.0
 * - Hue wrapping behavior
 * - Saturation/value clamping
 * - Finiteness for finite inputs
 */

import { describe, it, expect } from 'vitest';
import { hsvToRgb } from '../hsv-to-rgb';

describe('hsvToRgb', () => {
  describe('Known color conversions', () => {
    it('should convert pure red (h=0, s=1, v=1)', () => {
      const out = new Float32Array(10);
      hsvToRgb(out, 0, [0, 1, 1]);

      expect(out[0]).toBeCloseTo(1.0, 5); // Red
      expect(out[1]).toBeCloseTo(0.0, 5); // Green
      expect(out[2]).toBeCloseTo(0.0, 5); // Blue
      expect(out[3]).toBeCloseTo(1.0, 5); // Alpha
    });

    it('should convert pure green (h=1/3, s=1, v=1)', () => {
      const out = new Float32Array(10);
      hsvToRgb(out, 0, [1 / 3, 1, 1]);

      expect(out[0]).toBeCloseTo(0.0, 5); // Red
      expect(out[1]).toBeCloseTo(1.0, 5); // Green
      expect(out[2]).toBeCloseTo(0.0, 5); // Blue
      expect(out[3]).toBeCloseTo(1.0, 5); // Alpha
    });

    it('should convert pure blue (h=2/3, s=1, v=1)', () => {
      const out = new Float32Array(10);
      hsvToRgb(out, 0, [2 / 3, 1, 1]);

      expect(out[0]).toBeCloseTo(0.0, 5); // Red
      expect(out[1]).toBeCloseTo(0.0, 5); // Green
      expect(out[2]).toBeCloseTo(1.0, 5); // Blue
      expect(out[3]).toBeCloseTo(1.0, 5); // Alpha
    });

    it('should convert white (h=any, s=0, v=1)', () => {
      const out = new Float32Array(10);
      hsvToRgb(out, 0, [0.5, 0, 1]);

      expect(out[0]).toBeCloseTo(1.0, 5); // Red
      expect(out[1]).toBeCloseTo(1.0, 5); // Green
      expect(out[2]).toBeCloseTo(1.0, 5); // Blue
      expect(out[3]).toBeCloseTo(1.0, 5); // Alpha
    });

    it('should convert black (h=any, s=any, v=0)', () => {
      const out = new Float32Array(10);
      hsvToRgb(out, 0, [0.3, 0.8, 0]);

      expect(out[0]).toBeCloseTo(0.0, 5); // Red
      expect(out[1]).toBeCloseTo(0.0, 5); // Green
      expect(out[2]).toBeCloseTo(0.0, 5); // Blue
      expect(out[3]).toBeCloseTo(1.0, 5); // Alpha
    });

    it('should convert gray (h=any, s=0, v=0.5)', () => {
      const out = new Float32Array(10);
      hsvToRgb(out, 0, [0.0, 0, 0.5]);

      expect(out[0]).toBeCloseTo(0.5, 5); // Red
      expect(out[1]).toBeCloseTo(0.5, 5); // Green
      expect(out[2]).toBeCloseTo(0.5, 5); // Blue
      expect(out[3]).toBeCloseTo(1.0, 5); // Alpha
    });
  });

  describe('Output range and finiteness', () => {
    it('should produce outputs in [0, 1] for valid inputs', () => {
      const testCases = [
        [0, 1, 1],
        [0.5, 0.5, 0.5],
        [0.25, 0.75, 0.9],
        [0.9, 0.1, 0.3],
      ];

      for (const args of testCases) {
        const out = new Float32Array(10);
        hsvToRgb(out, 0, args);

        expect(out[0]).toBeGreaterThanOrEqual(0);
        expect(out[0]).toBeLessThanOrEqual(1);
        expect(out[1]).toBeGreaterThanOrEqual(0);
        expect(out[1]).toBeLessThanOrEqual(1);
        expect(out[2]).toBeGreaterThanOrEqual(0);
        expect(out[2]).toBeLessThanOrEqual(1);
        expect(out[3]).toBe(1.0); // Alpha
      }
    });

    it('should produce finite outputs for finite inputs', () => {
      const testCases = [
        [0, 0, 0],
        [1, 1, 1],
        [0.5, 0.5, 0.5],
        [0.123, 0.456, 0.789],
      ];

      for (const args of testCases) {
        const out = new Float32Array(10);
        hsvToRgb(out, 0, args);

        expect(Number.isFinite(out[0])).toBe(true);
        expect(Number.isFinite(out[1])).toBe(true);
        expect(Number.isFinite(out[2])).toBe(true);
        expect(Number.isFinite(out[3])).toBe(true);
      }
    });
  });

  describe('Hue wrapping', () => {
    it('should wrap hue > 1 to [0, 1]', () => {
      const out1 = new Float32Array(10);
      const out2 = new Float32Array(10);

      hsvToRgb(out1, 0, [0, 1, 1]);      // h=0 (red)
      hsvToRgb(out2, 0, [1, 1, 1]);      // h=1 (wraps to 0, also red)

      expect(out2[0]).toBeCloseTo(out1[0], 5);
      expect(out2[1]).toBeCloseTo(out1[1], 5);
      expect(out2[2]).toBeCloseTo(out1[2], 5);
    });

    it('should wrap hue = 1.5 (wraps to 0.5)', () => {
      const out1 = new Float32Array(10);
      const out2 = new Float32Array(10);

      hsvToRgb(out1, 0, [0.5, 1, 1]);    // h=0.5 (cyan)
      hsvToRgb(out2, 0, [1.5, 1, 1]);    // h=1.5 wraps to 0.5

      expect(out2[0]).toBeCloseTo(out1[0], 5);
      expect(out2[1]).toBeCloseTo(out1[1], 5);
      expect(out2[2]).toBeCloseTo(out1[2], 5);
    });

    it('should handle negative hue (wraps to positive)', () => {
      const out1 = new Float32Array(10);
      const out2 = new Float32Array(10);

      hsvToRgb(out1, 0, [0.25, 1, 1]);   // h=0.25 (yellow-green)
      hsvToRgb(out2, 0, [-0.75, 1, 1]);  // h=-0.75 wraps to 0.25

      expect(out2[0]).toBeCloseTo(out1[0], 5);
      expect(out2[1]).toBeCloseTo(out1[1], 5);
      expect(out2[2]).toBeCloseTo(out1[2], 5);
    });
  });

  describe('Saturation and value clamping', () => {
    it('should clamp saturation > 1 to 1', () => {
      const out1 = new Float32Array(10);
      const out2 = new Float32Array(10);

      hsvToRgb(out1, 0, [0, 1, 1]);      // s=1
      hsvToRgb(out2, 0, [0, 2, 1]);      // s=2, clamped to 1

      expect(out2[0]).toBeCloseTo(out1[0], 5);
      expect(out2[1]).toBeCloseTo(out1[1], 5);
      expect(out2[2]).toBeCloseTo(out1[2], 5);
    });

    it('should clamp saturation < 0 to 0', () => {
      const out1 = new Float32Array(10);
      const out2 = new Float32Array(10);

      hsvToRgb(out1, 0, [0, 0, 1]);      // s=0 (white)
      hsvToRgb(out2, 0, [0, -1, 1]);     // s=-1, clamped to 0

      expect(out2[0]).toBeCloseTo(out1[0], 5);
      expect(out2[1]).toBeCloseTo(out1[1], 5);
      expect(out2[2]).toBeCloseTo(out1[2], 5);
    });

    it('should clamp value > 1 to 1', () => {
      const out1 = new Float32Array(10);
      const out2 = new Float32Array(10);

      hsvToRgb(out1, 0, [0, 1, 1]);      // v=1
      hsvToRgb(out2, 0, [0, 1, 2]);      // v=2, clamped to 1

      expect(out2[0]).toBeCloseTo(out1[0], 5);
      expect(out2[1]).toBeCloseTo(out1[1], 5);
      expect(out2[2]).toBeCloseTo(out1[2], 5);
    });

    it('should clamp value < 0 to 0', () => {
      const out1 = new Float32Array(10);
      const out2 = new Float32Array(10);

      hsvToRgb(out1, 0, [0, 1, 0]);      // v=0 (black)
      hsvToRgb(out2, 0, [0, 1, -1]);     // v=-1, clamped to 0

      expect(out2[0]).toBeCloseTo(out1[0], 5);
      expect(out2[1]).toBeCloseTo(out1[1], 5);
      expect(out2[2]).toBeCloseTo(out1[2], 5);
    });
  });

  describe('Buffer writing', () => {
    it('should write to the correct offset in the output buffer', () => {
      const out = new Float32Array(20);
      out.fill(999); // Fill with sentinel values

      hsvToRgb(out, 5, [0, 1, 1]); // Write at offset 5

      // Check that offset 5-8 were written
      expect(out[5]).toBeCloseTo(1.0, 5); // Red
      expect(out[6]).toBeCloseTo(0.0, 5); // Green
      expect(out[7]).toBeCloseTo(0.0, 5); // Blue
      expect(out[8]).toBeCloseTo(1.0, 5); // Alpha

      // Check that other values weren't touched
      expect(out[4]).toBe(999);
      expect(out[9]).toBe(999);
    });

    it('should support multiple writes to different offsets', () => {
      const out = new Float32Array(12);

      hsvToRgb(out, 0, [0, 1, 1]);       // Red at offset 0
      hsvToRgb(out, 4, [1 / 3, 1, 1]);   // Green at offset 4
      hsvToRgb(out, 8, [2 / 3, 1, 1]);   // Blue at offset 8

      // Red
      expect(out[0]).toBeCloseTo(1.0, 5);
      expect(out[1]).toBeCloseTo(0.0, 5);
      expect(out[2]).toBeCloseTo(0.0, 5);
      expect(out[3]).toBeCloseTo(1.0, 5);

      // Green
      expect(out[4]).toBeCloseTo(0.0, 5);
      expect(out[5]).toBeCloseTo(1.0, 5);
      expect(out[6]).toBeCloseTo(0.0, 5);
      expect(out[7]).toBeCloseTo(1.0, 5);

      // Blue
      expect(out[8]).toBeCloseTo(0.0, 5);
      expect(out[9]).toBeCloseTo(0.0, 5);
      expect(out[10]).toBeCloseTo(1.0, 5);
      expect(out[11]).toBeCloseTo(1.0, 5);
    });
  });

  describe('Alpha policy', () => {
    it('should always write alpha = 1.0', () => {
      const testCases = [
        [0, 1, 1],
        [0.5, 0.5, 0.5],
        [0, 0, 0],
        [0.123, 0.456, 0.789],
      ];

      for (const args of testCases) {
        const out = new Float32Array(10);
        hsvToRgb(out, 0, args);
        expect(out[3]).toBe(1.0);
      }
    });
  });
});
