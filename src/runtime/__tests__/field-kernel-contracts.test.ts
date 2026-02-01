/**
 * ══════════════════════════════════════════════════════════════════════
 * FIELD KERNEL CONTRACT TESTS
 * ══════════════════════════════════════════════════════════════════════
 *
 * Tests for field kernel correctness:
 * - Coord-space adherence (local vs world)
 * - Arity enforcement
 * - Output range validation
 * - Mathematical correctness
 *
 * Tests for removed kernels (jitter2d, attract2d, fieldAdd, fieldMultiply,
 * fieldPolarToCartesian, circleLayout, lineLayout, gridLayout, etc.)
 * have been deleted along with their implementations.
 */

import { describe, it, expect } from 'vitest';
import { applyFieldKernel, applyFieldKernelZipSig, hsvToRgb } from '../FieldKernels';
import { canonicalField, type PayloadType, type CanonicalType, FLOAT, VEC2, COLOR } from '../../core/canonical-types';
import { instanceId, domainTypeId } from "../../core/ids";

/**
 * Test helper to create a properly-typed CanonicalType for field tests.
 * Returns a CanonicalType with many(instance) cardinality and continuous temporality.
 */
function testFieldType(payload: PayloadType): CanonicalType {
  return canonicalField(payload, { kind: 'scalar' }, { instanceId: instanceId('test-instance'), domainTypeId: domainTypeId('default') });
}

// ══════════════════════════════════════════════════════════════════════
// VEC2 KERNEL TESTS
// ══════════════════════════════════════════════════════════════════════

describe('Field Kernel Contract Tests', () => {
  describe('makeVec2', () => {
    it('combines two float arrays into vec2', () => {
      const out = new Float32Array(6); // 3 vec2s
      const x = new Float32Array([1, 2, 3]);
      const y = new Float32Array([4, 5, 6]);

      applyFieldKernel(out, [x, y], 'makeVec2', 3, testFieldType(VEC2));

      expect(out[0]).toBe(1); expect(out[1]).toBe(4);
      expect(out[2]).toBe(2); expect(out[3]).toBe(5);
      expect(out[4]).toBe(3); expect(out[5]).toBe(6);
    });

    it('throws with wrong arity', () => {
      const out = new Float32Array(2);
      const x = new Float32Array([1]);

      expect(() =>
        applyFieldKernel(out, [x], 'makeVec2', 1, testFieldType(VEC2))
      ).toThrow(/requires exactly 2 inputs/);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // COLOR KERNEL TESTS
  // ══════════════════════════════════════════════════════════════════════

  describe('hsvToRgb', () => {
    it('converts primary colors correctly', () => {
      // Red: H=0, S=1, V=1
      const [r, g, b] = hsvToRgb(0, 1, 1);
      expect(r).toBe(255);
      expect(g).toBe(0);
      expect(b).toBe(0);
    });

    it('wraps hue outside [0,1]', () => {
      // H=1.5 should behave like H=0.5 (cyan area)
      const [r1, g1, b1] = hsvToRgb(0.5, 1, 1);
      const [r2, g2, b2] = hsvToRgb(1.5, 1, 1);
      expect(r1).toBe(r2);
      expect(g1).toBe(g2);
      expect(b1).toBe(b2);

      // Negative hue
      const [r3, g3, b3] = hsvToRgb(-0.5, 1, 1);
      expect(r3).toBe(r1);
      expect(g3).toBe(g1);
      expect(b3).toBe(b1);
    });

    it('clamps saturation and value to [0,1]', () => {
      // S and V > 1 should clamp
      const [r1, g1, b1] = hsvToRgb(0, 1, 1);
      const [r2, g2, b2] = hsvToRgb(0, 2, 2);
      expect(r1).toBe(r2);
      expect(g1).toBe(g2);
      expect(b1).toBe(b2);

      // Negative S and V should clamp to 0 (black/gray)
      const [r3, g3, b3] = hsvToRgb(0, -1, 1);
      expect(r3).toBe(255); // V=1, S=0 -> white
      expect(g3).toBe(255);
      expect(b3).toBe(255);
    });
  });

  describe('hsvToRgb (field kernel)', () => {
    it('converts HSV field to RGB color buffer', () => {
      const out = new Uint8ClampedArray(8); // 2 colors (RGBA)
      const h = new Float32Array([0, 0.333]); // red, green
      const s = new Float32Array([1, 1]);
      const v = new Float32Array([1, 1]);

      applyFieldKernel(out, [h, s, v], 'hsvToRgb', 2, testFieldType(COLOR));

      // Color 0: Red
      expect(out[0]).toBe(255);
      expect(out[1]).toBe(0);
      expect(out[2]).toBe(0);
      expect(out[3]).toBe(255);

      // Color 1: Green (H~0.333)
      expect(out[4]).toBeLessThan(10);
      expect(out[5]).toBeGreaterThan(250);
      expect(out[6]).toBeLessThan(10);
      expect(out[7]).toBe(255);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // LAYOUT KERNEL TESTS (ZIPSIG) — Kept: polygonVertex
  // ══════════════════════════════════════════════════════════════════════

  describe('polygonVertex (zipSig)', () => {
    it('outputs LOCAL-SPACE vertices centered at origin', () => {
      const out = new Float32Array(8); // 4 vertices
      const indices = new Float32Array([0, 1, 2, 3]);
      const signals = [4, 1, 1]; // 4 sides, radiusX=1, radiusY=1

      applyFieldKernelZipSig(out, indices, signals, 'polygonVertex', 4, testFieldType(VEC2));

      // Square (4 sides): vertices at top, right, bottom, left
      expect(out[0]).toBeCloseTo(0);
      expect(out[1]).toBeCloseTo(-1);
      expect(out[2]).toBeCloseTo(1);
      expect(out[3]).toBeCloseTo(0);
      expect(out[4]).toBeCloseTo(0);
      expect(out[5]).toBeCloseTo(1);
      expect(out[6]).toBeCloseTo(-1);
      expect(out[7]).toBeCloseTo(0);
    });

    it('vertices are at unit radius (local space)', () => {
      const out = new Float32Array(10); // 5 vertices
      const indices = new Float32Array([0, 1, 2, 3, 4]);
      const signals = [5, 1, 1]; // pentagon

      applyFieldKernelZipSig(out, indices, signals, 'polygonVertex', 5, testFieldType(VEC2));

      for (let i = 0; i < 5; i++) {
        const x = out[i * 2];
        const y = out[i * 2 + 1];
        const dist = Math.sqrt(x * x + y * y);
        expect(dist).toBeCloseTo(1);
      }
    });

    it('respects radiusX/radiusY for elliptical polygons', () => {
      const out = new Float32Array(8);
      const indices = new Float32Array([0, 1, 2, 3]);
      const signals = [4, 2, 1]; // 4 sides, radiusX=2, radiusY=1

      applyFieldKernelZipSig(out, indices, signals, 'polygonVertex', 4, testFieldType(VEC2));

      // Right vertex should be at (2, 0)
      expect(out[2]).toBeCloseTo(2);
      expect(out[3]).toBeCloseTo(0);
      // Bottom vertex should be at (0, 1)
      expect(out[4]).toBeCloseTo(0);
      expect(out[5]).toBeCloseTo(1);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // REMOVED KERNEL VERIFICATION
  // ══════════════════════════════════════════════════════════════════════

  describe('Removed kernels throw', () => {
    it('removed zip kernels throw "Unknown field kernel"', () => {
      const out = new Float32Array(4);
      const input = new Float32Array([1]);
      const removedZip = [
        'jitter2d', 'attract2d', 'fieldAngularOffset', 'fieldRadiusSqrt',
        'fieldAdd', 'fieldMultiply', 'fieldPolarToCartesian', 'fieldPulse',
        'fieldHueFromPhase', 'fieldJitterVec', 'fieldGoldenAngle',
        'perElementOpacity', 'fieldExtractX', 'fieldExtractY', 'fieldExtractZ',
        'fieldExtractR', 'fieldExtractG', 'fieldExtractB', 'fieldExtractA',
        'fieldSwizzle_xy', 'fieldSwizzle_rgb',
      ];
      for (const name of removedZip) {
        expect(() =>
          applyFieldKernel(out, [input], name, 1, testFieldType(FLOAT))
        ).toThrow(/Unknown field kernel/);
      }
    });

    it('removed zipSig kernels throw "Unknown field kernel (zipSig)"', () => {
      const out = new Float32Array(4);
      const input = new Float32Array([1]);
      const removedZipSig = [
        'applyOpacity', 'circleLayout', 'circleAngle',
        'lineLayout', 'gridLayout', 'fieldGoldenAngle', 'broadcastColor',
      ];
      for (const name of removedZipSig) {
        expect(() =>
          applyFieldKernelZipSig(out, input, [0], name, 1, testFieldType(FLOAT))
        ).toThrow(/Unknown field kernel/);
      }
    });
  });
});
