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
 * These tests verify the contracts from 7-field-kernel.md
 */

import { describe, it, expect } from 'vitest';
import { applyFieldKernel, applyFieldKernelZipSig, hsvToRgb } from '../FieldKernels';
import { signalTypeField, type PayloadType, type CanonicalType, FLOAT, VEC2, VEC3, COLOR } from '../../core/canonical-types';

/**
 * Test helper to create a properly-typed CanonicalType for field tests.
 * Returns a CanonicalType with many(instance) cardinality and continuous temporality.
 */
function testFieldType(payload: PayloadType): CanonicalType {
  return signalTypeField(payload, 'test-instance');
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

  describe('fieldPolarToCartesian', () => {
    it('converts polar to cartesian correctly', () => {
      const out = new Float32Array(6); // 2 vec3s
      const cx = new Float32Array([0, 0]);
      const cy = new Float32Array([0, 0]);
      const r = new Float32Array([1, 2]);
      const angle = new Float32Array([0, Math.PI / 2]); // 0 rad, 90 deg

      applyFieldKernel(out, [cx, cy, r, angle], 'fieldPolarToCartesian', 2, testFieldType(VEC3));

      // Point 0: angle=0, r=1 → (1, 0, 0)
      expect(out[0]).toBeCloseTo(1);
      expect(out[1]).toBeCloseTo(0);
      expect(out[2]).toBe(0.0);

      // Point 1: angle=π/2, r=2 → (0, 2, 0)
      expect(out[3]).toBeCloseTo(0);
      expect(out[4]).toBeCloseTo(2);
      expect(out[5]).toBe(0.0);
    });

    it('is coord-space agnostic (centers at provided cx/cy)', () => {
      const out = new Float32Array(3); // 1 vec3
      const cx = new Float32Array([0.5]); // world center
      const cy = new Float32Array([0.5]);
      const r = new Float32Array([0.25]); // world radius
      const angle = new Float32Array([0]);

      applyFieldKernel(out, [cx, cy, r, angle], 'fieldPolarToCartesian', 1, testFieldType(VEC3));

      expect(out[0]).toBeCloseTo(0.75); // 0.5 + 0.25
      expect(out[1]).toBeCloseTo(0.5);
      expect(out[2]).toBe(0.0);
    });

    it('handles angles in RADIANS', () => {
      const out = new Float32Array(3); // 1 vec3
      const cx = new Float32Array([0]);
      const cy = new Float32Array([0]);
      const r = new Float32Array([1]);
      const angle = new Float32Array([Math.PI]); // 180 degrees

      applyFieldKernel(out, [cx, cy, r, angle], 'fieldPolarToCartesian', 1, testFieldType(VEC3));

      expect(out[0]).toBeCloseTo(-1); // cos(π) = -1
      expect(out[1]).toBeCloseTo(0);  // sin(π) = 0
      expect(out[2]).toBe(0.0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // LAYOUT KERNEL TESTS (ZIPSIG)
  // ══════════════════════════════════════════════════════════════════════

  describe('polygonVertex (zipSig)', () => {
    it('outputs LOCAL-SPACE vertices centered at origin', () => {
      const out = new Float32Array(8); // 4 vertices
      const indices = new Float32Array([0, 1, 2, 3]);
      const signals = [4, 1, 1]; // 4 sides, radiusX=1, radiusY=1

      applyFieldKernelZipSig(out, indices, signals, 'polygonVertex', 4, testFieldType(VEC2));

      // Square (4 sides): vertices at top, right, bottom, left
      // Start at top (angle = -π/2), go clockwise
      // Vertex 0: top (0, -1) - note: sin(-π/2) = -1
      expect(out[0]).toBeCloseTo(0);
      expect(out[1]).toBeCloseTo(-1);

      // Vertex 1: right (1, 0)
      expect(out[2]).toBeCloseTo(1);
      expect(out[3]).toBeCloseTo(0);

      // Vertex 2: bottom (0, 1)
      expect(out[4]).toBeCloseTo(0);
      expect(out[5]).toBeCloseTo(1);

      // Vertex 3: left (-1, 0)
      expect(out[6]).toBeCloseTo(-1);
      expect(out[7]).toBeCloseTo(0);
    });

    it('vertices are at unit radius (local space)', () => {
      const out = new Float32Array(10); // 5 vertices
      const indices = new Float32Array([0, 1, 2, 3, 4]);
      const signals = [5, 1, 1]; // pentagon

      applyFieldKernelZipSig(out, indices, signals, 'polygonVertex', 5, testFieldType(VEC2));

      // All vertices should be at distance 1 from origin
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

      // Right vertex (1, 0 direction) should be at (2, 0)
      expect(out[2]).toBeCloseTo(2);
      expect(out[3]).toBeCloseTo(0);

      // Bottom vertex (0, 1 direction) should be at (0, 1)
      expect(out[4]).toBeCloseTo(0);
      expect(out[5]).toBeCloseTo(1);
    });
  });

  describe('circleLayout (zipSig)', () => {
    it('outputs WORLD-SPACE vec3 positions centered at (0.5, 0.5) with z=0', () => {
      const out = new Float32Array(12); // 4 vec3 positions
      const indices = new Float32Array([0, 0.25, 0.5, 0.75]); // normalized
      const signals = [0.25, 0]; // radius=0.25, phase=0

      applyFieldKernelZipSig(out, indices, signals, 'circleLayout', 4, testFieldType(VEC3));

      // Position 0: index=0 → angle=0 → (0.75, 0.5, 0)
      expect(out[0]).toBeCloseTo(0.75);
      expect(out[1]).toBeCloseTo(0.5);
      expect(out[2]).toBe(0.0);

      // Position 1: index=0.25 → angle=π/2 → (0.5, 0.75, 0)
      expect(out[3]).toBeCloseTo(0.5);
      expect(out[4]).toBeCloseTo(0.75);
      expect(out[5]).toBe(0.0);
    });

    it('phase rotates the entire layout', () => {
      const out = new Float32Array(3); // 1 vec3
      const indices = new Float32Array([0]);
      const signals = [0.25, 0.25]; // radius=0.25, phase=0.25 (90 degrees)

      applyFieldKernelZipSig(out, indices, signals, 'circleLayout', 1, testFieldType(VEC3));

      // index=0 + phase=0.25 → effective angle=0.25*2π=π/2
      expect(out[0]).toBeCloseTo(0.5);
      expect(out[1]).toBeCloseTo(0.75);
      expect(out[2]).toBe(0.0);
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
      expect(r3).toBe(255); // V=1, S=0 → white
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

      // Color 1: Green (H≈0.333) - allows for HSV conversion tolerance
      // H=0.333 is close to pure green but not exact
      expect(out[4]).toBeLessThan(10); // R low
      expect(out[5]).toBeGreaterThan(250); // G high
      expect(out[6]).toBeLessThan(10); // B low
      expect(out[7]).toBe(255); // A full
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // FIELD MATH KERNEL TESTS
  // ══════════════════════════════════════════════════════════════════════

  describe('fieldAdd', () => {
    it('adds two float fields element-wise', () => {
      const out = new Float32Array(3);
      const a = new Float32Array([1, 2, 3]);
      const b = new Float32Array([10, 20, 30]);

      applyFieldKernel(out, [a, b], 'fieldAdd', 3, testFieldType(FLOAT));

      expect(out[0]).toBe(11);
      expect(out[1]).toBe(22);
      expect(out[2]).toBe(33);
    });
  });

  describe('fieldGoldenAngle', () => {
    it('outputs angles in RADIANS', () => {
      const out = new Float32Array(3);
      const id01 = new Float32Array([0, 0.5, 1]);

      applyFieldKernel(out, [id01], 'fieldGoldenAngle', 3, testFieldType(FLOAT));

      // Golden angle ≈ 2.39996 rad (137.5 degrees)
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      const turns = 50;

      expect(out[0]).toBeCloseTo(0); // id=0 → 0
      expect(out[1]).toBeCloseTo(0.5 * turns * goldenAngle); // id=0.5
      expect(out[2]).toBeCloseTo(1 * turns * goldenAngle); // id=1
    });
  });

  describe('fieldHueFromPhase', () => {
    it('computes hue wrapping to [0,1]', () => {
      const out = new Float32Array(3);
      const id01 = new Float32Array([0, 0.5, 0.8]);
      const phase = new Float32Array([0.3, 0.3, 0.3]);

      applyFieldKernel(out, [id01, phase], 'fieldHueFromPhase', 3, testFieldType(FLOAT));

      expect(out[0]).toBeCloseTo(0.3); // 0 + 0.3
      expect(out[1]).toBeCloseTo(0.8); // 0.5 + 0.3
      expect(out[2]).toBeCloseTo(0.1); // 0.8 + 0.3 = 1.1 → 0.1 (wrapped)
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // JITTER KERNEL TESTS
  // ══════════════════════════════════════════════════════════════════════

  describe('jitter2d', () => {
    it('is deterministic given same random seed', () => {
      const out1 = new Float32Array(2);
      const out2 = new Float32Array(2);
      const pos = new Float32Array([0.5, 0.5]);
      const rand = new Float32Array([42]);
      const amtX = new Float32Array([0.1]);
      const amtY = new Float32Array([0.1]);

      applyFieldKernel(out1, [pos, rand, amtX, amtY], 'jitter2d', 1, testFieldType(VEC2));
      applyFieldKernel(out2, [pos, rand, amtX, amtY], 'jitter2d', 1, testFieldType(VEC2));

      expect(out1[0]).toBe(out2[0]);
      expect(out1[1]).toBe(out2[1]);
    });

    it('offset is bounded by amount', () => {
      const out = new Float32Array(200); // 100 positions
      const pos = new Float32Array(200);
      const rand = new Float32Array(100);
      const amtX = new Float32Array(100);
      const amtY = new Float32Array(100);

      for (let i = 0; i < 100; i++) {
        pos[i * 2] = 0.5;
        pos[i * 2 + 1] = 0.5;
        rand[i] = i * 7.3; // varied seeds
        amtX[i] = 0.1;
        amtY[i] = 0.1;
      }

      applyFieldKernel(out, [pos, rand, amtX, amtY], 'jitter2d', 100, testFieldType(VEC2));

      for (let i = 0; i < 100; i++) {
        const offsetX = Math.abs(out[i * 2] - 0.5);
        const offsetY = Math.abs(out[i * 2 + 1] - 0.5);
        expect(offsetX).toBeLessThanOrEqual(0.1);
        expect(offsetY).toBeLessThanOrEqual(0.1);
      }
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // ARITY ENFORCEMENT TESTS
  // ══════════════════════════════════════════════════════════════════════

  describe('Arity Enforcement', () => {
    it('jitter2d requires 4 inputs', () => {
      const out = new Float32Array(2);
      expect(() =>
        applyFieldKernel(out, [new Float32Array(1)], 'jitter2d', 1, testFieldType(VEC2))
      ).toThrow(/4 inputs/);
    });

    it('attract2d requires 5 inputs', () => {
      const out = new Float32Array(2);
      expect(() =>
        applyFieldKernel(out, [new Float32Array(1)], 'attract2d', 1, testFieldType(VEC2))
      ).toThrow(/5 inputs/);
    });

    it('fieldPolarToCartesian requires 4 inputs', () => {
      const out = new Float32Array(2);
      expect(() =>
        applyFieldKernel(out, [new Float32Array(1)], 'fieldPolarToCartesian', 1, testFieldType(VEC2))
      ).toThrow(/4 inputs/);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // COORD-SPACE AGNOSTIC VERIFICATION
  // ══════════════════════════════════════════════════════════════════════

  describe('Coord-space Agnostic Kernels', () => {
    it('fieldPolarToCartesian does NOT multiply by viewport dimensions', () => {
      // This test verifies the kernel doesn't embed any width/height
      const out = new Float32Array(3); // 1 vec3
      const cx = new Float32Array([0]);
      const cy = new Float32Array([0]);
      const r = new Float32Array([1]); // unit radius
      const angle = new Float32Array([0]);

      applyFieldKernel(out, [cx, cy, r, angle], 'fieldPolarToCartesian', 1, testFieldType(VEC3));

      // Output should be (1, 0, 0), not (width, 0, 0) or any scaled value
      expect(out[0]).toBe(1);
      expect(out[1]).toBeCloseTo(0);
      expect(out[2]).toBe(0.0);
    });

    it('jitter2d preserves input space (adds in same units)', () => {
      // If input is in local units, output should be local + local_offset
      const out = new Float32Array(2);
      const pos = new Float32Array([0, 0]); // local origin
      const rand = new Float32Array([0]);
      const amtX = new Float32Array([0]); // zero jitter
      const amtY = new Float32Array([0]);

      applyFieldKernel(out, [pos, rand, amtX, amtY], 'jitter2d', 1, testFieldType(VEC2));

      // With zero amount, output should equal input exactly
      expect(out[0]).toBe(0);
      expect(out[1]).toBe(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // LAYOUT KERNEL TESTS
  // ══════════════════════════════════════════════════════════════════════

  describe('lineLayout', () => {
    it('interpolates between start and end points (vec3 with z=0)', () => {
      const out = new Float32Array(9); // 3 vec3 positions
      const t = new Float32Array([0, 0.5, 1]); // start, middle, end

      applyFieldKernelZipSig(out, t, [0.1, 0.2, 0.9, 0.8], 'lineLayout', 3, testFieldType(VEC3));

      // t=0 should be at start (0.1, 0.2, 0)
      expect(out[0]).toBeCloseTo(0.1);
      expect(out[1]).toBeCloseTo(0.2);
      expect(out[2]).toBe(0.0);
      // t=0.5 should be at midpoint (0.5, 0.5, 0)
      expect(out[3]).toBeCloseTo(0.5);
      expect(out[4]).toBeCloseTo(0.5);
      expect(out[5]).toBe(0.0);
      // t=1 should be at end (0.9, 0.8, 0)
      expect(out[6]).toBeCloseTo(0.9);
      expect(out[7]).toBeCloseTo(0.8);
      expect(out[8]).toBe(0.0);
    });

    it('clamps t to [0,1]', () => {
      const out = new Float32Array(6); // 2 vec3
      const t = new Float32Array([-0.5, 1.5]); // Out of range

      applyFieldKernelZipSig(out, t, [0, 0, 1, 1], 'lineLayout', 2, testFieldType(VEC3));

      // -0.5 clamped to 0 → (0, 0, 0)
      expect(out[0]).toBe(0);
      expect(out[1]).toBe(0);
      expect(out[2]).toBe(0.0);
      // 1.5 clamped to 1 → (1, 1, 0)
      expect(out[3]).toBe(1);
      expect(out[4]).toBe(1);
      expect(out[5]).toBe(0.0);
    });

    it('requires 4 signals', () => {
      const out = new Float32Array(3);
      const t = new Float32Array([0.5]);

      expect(() =>
        applyFieldKernelZipSig(out, t, [0.1, 0.2], 'lineLayout', 1, testFieldType(VEC3))
      ).toThrow(/4 signals/);
    });
  });

  describe('gridLayout', () => {
    it('arranges elements in a 2x2 grid (vec3 with z=0)', () => {
      const out = new Float32Array(12); // 4 vec3 positions
      const index = new Float32Array([0, 1, 2, 3]);

      applyFieldKernelZipSig(out, index, [2, 2], 'gridLayout', 4, testFieldType(VEC3));

      // 2x2 grid: positions at corners
      // index 0: col=0, row=0 → (0, 0, 0)
      expect(out[0]).toBe(0);
      expect(out[1]).toBe(0);
      expect(out[2]).toBe(0.0);
      // index 1: col=1, row=0 → (1, 0, 0)
      expect(out[3]).toBe(1);
      expect(out[4]).toBe(0);
      expect(out[5]).toBe(0.0);
      // index 2: col=0, row=1 → (0, 1, 0)
      expect(out[6]).toBe(0);
      expect(out[7]).toBe(1);
      expect(out[8]).toBe(0.0);
      // index 3: col=1, row=1 → (1, 1, 0)
      expect(out[9]).toBe(1);
      expect(out[10]).toBe(1);
      expect(out[11]).toBe(0.0);
    });

    it('handles single column (centers at 0.5)', () => {
      const out = new Float32Array(6); // 2 vec3
      const index = new Float32Array([0, 1]);

      applyFieldKernelZipSig(out, index, [1, 2], 'gridLayout', 2, testFieldType(VEC3));

      // Single column: x=0.5 for both
      expect(out[0]).toBe(0.5); // x
      expect(out[1]).toBe(0);   // y (row 0)
      expect(out[2]).toBe(0.0); // z
      expect(out[3]).toBe(0.5); // x
      expect(out[4]).toBe(1);   // y (row 1)
      expect(out[5]).toBe(0.0); // z
    });

    it('handles single row (centers at 0.5)', () => {
      const out = new Float32Array(6); // 2 vec3
      const index = new Float32Array([0, 1]);

      applyFieldKernelZipSig(out, index, [2, 1], 'gridLayout', 2, testFieldType(VEC3));

      // Single row: y=0.5 for both
      expect(out[0]).toBe(0);   // x (col 0)
      expect(out[1]).toBe(0.5); // y
      expect(out[2]).toBe(0.0); // z
      expect(out[3]).toBe(1);   // x (col 1)
      expect(out[4]).toBe(0.5); // y
      expect(out[5]).toBe(0.0); // z
    });

    it('requires 2 signals', () => {
      const out = new Float32Array(3);
      const index = new Float32Array([0]);

      expect(() =>
        applyFieldKernelZipSig(out, index, [2], 'gridLayout', 1, testFieldType(VEC3))
      ).toThrow(/2 signals/);
    });

    it('produces world-space vec3 positions in [0,1] with z=0', () => {
      const out = new Float32Array(30); // 10 vec3 positions
      const index = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

      applyFieldKernelZipSig(out, index, [5, 2], 'gridLayout', 10, testFieldType(VEC3));

      for (let i = 0; i < 10; i++) {
        expect(out[i * 3]).toBeGreaterThanOrEqual(0);
        expect(out[i * 3]).toBeLessThanOrEqual(1);
        expect(out[i * 3 + 1]).toBeGreaterThanOrEqual(0);
        expect(out[i * 3 + 1]).toBeLessThanOrEqual(1);
        expect(out[i * 3 + 2]).toBe(0.0);
      }
    });
  });
});
