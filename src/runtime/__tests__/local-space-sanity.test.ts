import { describe, it, expect } from 'vitest';
import { applyFieldKernelZipSig } from '../FieldKernels';
import { signalTypeField, type PayloadType, type SignalType } from '../../core/canonical-types';

/**
 * Local-space sanity tests verifying coordinate space conventions.
 *
 * LOCAL-SPACE MODEL:
 * - Control points are defined in local space, centered at origin (0,0)
 * - Instance transforms (position, size, rotation) are applied via renderer
 * - Reference dimension D = min(width, height) for isotropic scaling
 *
 * These tests ensure the foundational assumptions hold.
 */

/**
 * Test helper to create a properly-typed SignalType for field tests.
 * Returns a SignalType with many(instance) cardinality and continuous temporality.
 */
function testFieldType(payload: PayloadType): SignalType {
  return signalTypeField(payload, 'test-instance');
}

describe('Local-Space Sanity Tests', () => {
  describe('Control Point Centering', () => {
    it('polygonVertex produces control points centered at origin', () => {
      // Regular polygon with unit radius should have vertices that sum to ~(0,0)
      const sides = 6; // Hexagon
      const N = sides;

      // Create index field (0, 1, 2, ... sides-1)
      const indices = new Float32Array(N);
      for (let i = 0; i < N; i++) indices[i] = i;

      // Output buffer for vec2 vertices
      const out = new Float32Array(N * 2);

      // Signals: [sides, radiusX, radiusY]
      const signals = [sides, 1.0, 1.0];

      applyFieldKernelZipSig(out, indices, signals, 'polygonVertex', N, testFieldType('vec2'));

      // Sum all vertices
      let sumX = 0, sumY = 0;
      for (let i = 0; i < N; i++) {
        sumX += out[i * 2];
        sumY += out[i * 2 + 1];
      }

      // Regular polygon centered at origin sums to ~(0,0)
      expect(Math.abs(sumX)).toBeLessThan(1e-6);
      expect(Math.abs(sumY)).toBeLessThan(1e-6);
    });

    it('starVertex produces control points centered at origin', () => {
      // Star with 5 points (10 vertices)
      const points = 5;
      const N = points * 2; // Star has 2 vertices per point

      // Create index field (0, 1, 2, ... 9)
      const indices = new Float32Array(N);
      for (let i = 0; i < N; i++) indices[i] = i;

      // Output buffer for vec2 vertices
      const out = new Float32Array(N * 2);

      // Signals: [points, outerRadius, innerRadius]
      const signals = [points, 1.0, 0.5];

      applyFieldKernelZipSig(out, indices, signals, 'starVertex', N, testFieldType('vec2'));

      // Sum all vertices
      let sumX = 0, sumY = 0;
      for (let i = 0; i < N; i++) {
        sumX += out[i * 2];
        sumY += out[i * 2 + 1];
      }

      // Star centered at origin sums to ~(0,0)
      expect(Math.abs(sumX)).toBeLessThan(1e-6);
      expect(Math.abs(sumY)).toBeLessThan(1e-6);
    });
  });

  describe('Control Point Magnitude', () => {
    it('polygonVertex with unit radius produces vertices with |p| = 1.0', () => {
      const sides = 4; // Square
      const N = sides;

      const indices = new Float32Array(N);
      for (let i = 0; i < N; i++) indices[i] = i;

      const out = new Float32Array(N * 2);
      const signals = [sides, 1.0, 1.0]; // Unit radius

      applyFieldKernelZipSig(out, indices, signals, 'polygonVertex', N, testFieldType('vec2'));

      // Each vertex should be at distance 1.0 from origin
      for (let i = 0; i < N; i++) {
        const x = out[i * 2];
        const y = out[i * 2 + 1];
        const distance = Math.sqrt(x * x + y * y);
        expect(distance).toBeCloseTo(1.0, 5);
      }
    });

    it('polygonVertex with radius 2.0 produces vertices with |p| = 2.0', () => {
      const sides = 6;
      const N = sides;

      const indices = new Float32Array(N);
      for (let i = 0; i < N; i++) indices[i] = i;

      const out = new Float32Array(N * 2);
      const signals = [sides, 2.0, 2.0]; // Radius 2.0

      applyFieldKernelZipSig(out, indices, signals, 'polygonVertex', N, testFieldType('vec2'));

      for (let i = 0; i < N; i++) {
        const x = out[i * 2];
        const y = out[i * 2 + 1];
        const distance = Math.sqrt(x * x + y * y);
        expect(distance).toBeCloseTo(2.0, 5);
      }
    });

    it('anisotropic radius produces elliptical vertices', () => {
      const sides = 4;
      const N = sides;

      const indices = new Float32Array(N);
      for (let i = 0; i < N; i++) indices[i] = i;

      const out = new Float32Array(N * 2);
      const signals = [sides, 2.0, 1.0]; // radiusX=2, radiusY=1

      applyFieldKernelZipSig(out, indices, signals, 'polygonVertex', N, testFieldType('vec2'));

      // Square: top/bottom at y=±1, left/right at x=±2
      // Find max extents
      let maxAbsX = 0, maxAbsY = 0;
      for (let i = 0; i < N; i++) {
        maxAbsX = Math.max(maxAbsX, Math.abs(out[i * 2]));
        maxAbsY = Math.max(maxAbsY, Math.abs(out[i * 2 + 1]));
      }

      expect(maxAbsX).toBeCloseTo(2.0, 5);
      expect(maxAbsY).toBeCloseTo(1.0, 5);
    });
  });

  describe('Polygon Topology', () => {
    it('polygonVertex starts at top and goes clockwise', () => {
      const sides = 4;
      const N = sides;

      const indices = new Float32Array(N);
      for (let i = 0; i < N; i++) indices[i] = i;

      const out = new Float32Array(N * 2);
      const signals = [sides, 1.0, 1.0];

      applyFieldKernelZipSig(out, indices, signals, 'polygonVertex', N, testFieldType('vec2'));

      // First vertex (index 0) should be at top: (0, -1)
      // (Canvas convention: y increases downward, so top is negative y)
      expect(out[0]).toBeCloseTo(0, 5);     // x ≈ 0
      expect(out[1]).toBeCloseTo(-1, 5);    // y ≈ -1 (top)

      // Second vertex should be to the right: (1, 0)
      expect(out[2]).toBeCloseTo(1, 5);     // x ≈ 1 (right)
      expect(out[3]).toBeCloseTo(0, 5);     // y ≈ 0
    });
  });

  describe('Reference Dimension Convention', () => {
    it('min(width, height) should be used for isotropic scaling', () => {
      // This is a documentation test - the actual implementation is in renderer
      // We're just verifying the convention is understood

      const width = 1920;
      const height = 1080;
      const referenceDimension = Math.min(width, height);

      // A size of 0.1 (10% of reference) on a 1920x1080 canvas
      // should produce 108px (10% of 1080)
      const size = 0.1;
      const expectedPixels = size * referenceDimension;

      expect(referenceDimension).toBe(1080);
      expect(expectedPixels).toBe(108);
    });

    it('square canvas uses either dimension as reference', () => {
      const width = 800;
      const height = 800;
      const referenceDimension = Math.min(width, height);

      expect(referenceDimension).toBe(800);
    });
  });
});
