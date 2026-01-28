/**
 * FieldKernels Tests for PlacementBasis Layouts
 *
 * Tests for circleLayoutUV, lineLayoutUV, gridLayoutUV kernels.
 */

import { describe, it, expect } from 'vitest';
import { applyFieldKernelZipSig } from '../FieldKernels';
import { signalTypeField, VEC3, type CanonicalType, type PayloadType } from '../../core/canonical-types';

/**
 * Test helper to create a properly-typed CanonicalType for field tests.
 * Returns a CanonicalType with many(instance) cardinality and continuous temporality.
 */
function testFieldType(payload: PayloadType): CanonicalType {
  return signalTypeField(payload, 'test-instance');
}

describe('FieldKernels Sprint 4: PlacementBasis Layouts', () => {
  describe('circleLayoutUV', () => {
    it('produces vec3 positions from UV input', () => {
      const N = 10;
      const uv = new Float32Array(N * 2);
      const out = new Float32Array(N * 3);

      // Fill UV with simple values
      for (let i = 0; i < N; i++) {
        uv[i * 2 + 0] = i / N; // u from 0 to ~0.9
        uv[i * 2 + 1] = 0.5;   // v unused
      }

      applyFieldKernelZipSig(out, uv, [0.3, 0.0], 'circleLayoutUV', N, testFieldType(VEC3));

      // Check first element (u=0, phase=0)
      expect(out[0]).toBeCloseTo(0.5 + 0.3, 2); // x = cx + radius
      expect(out[1]).toBeCloseTo(0.5, 2);       // y = cy
      expect(out[2]).toBe(0.0);                 // z = 0

      // Check that all outputs are valid
      for (let i = 0; i < N; i++) {
        expect(out[i * 3 + 2]).toBe(0.0); // z always 0
        expect(Number.isFinite(out[i * 3 + 0])).toBe(true);
        expect(Number.isFinite(out[i * 3 + 1])).toBe(true);
      }
    });

    it('throws on wrong signal count', () => {
      const uv = new Float32Array(10);
      const out = new Float32Array(15);
      expect(() => applyFieldKernelZipSig(out, uv, [0.3], 'circleLayoutUV', 5, testFieldType(VEC3))).toThrow(/2 signals/);
    });
  });

  describe('lineLayoutUV', () => {
    it('interpolates from start to end using u coordinate', () => {
      const N = 5;
      const uv = new Float32Array(N * 2);
      const out = new Float32Array(N * 3);

      // Fill UV with linear progression
      for (let i = 0; i < N; i++) {
        uv[i * 2 + 0] = i / (N - 1); // u from 0 to 1
        uv[i * 2 + 1] = 0.5;         // v unused
      }

      // Line from (0.1, 0.2) to (0.9, 0.8)
      applyFieldKernelZipSig(out, uv, [0.1, 0.2, 0.9, 0.8], 'lineLayoutUV', N, testFieldType(VEC3));

      // Check first element (u=0)
      expect(out[0]).toBeCloseTo(0.1, 5);
      expect(out[1]).toBeCloseTo(0.2, 5);
      expect(out[2]).toBe(0.0);

      // Check last element (u=1)
      expect(out[12]).toBeCloseTo(0.9, 5);
      expect(out[13]).toBeCloseTo(0.8, 5);
      expect(out[14]).toBe(0.0);

      // Check middle element (u=0.5)
      expect(out[6]).toBeCloseTo(0.5, 5);
      expect(out[7]).toBeCloseTo(0.5, 5);
    });

    it('throws on wrong signal count', () => {
      const uv = new Float32Array(10);
      const out = new Float32Array(15);
      expect(() => applyFieldKernelZipSig(out, uv, [0.1, 0.2], 'lineLayoutUV', 5, testFieldType(VEC3))).toThrow(/4 signals/);
    });
  });

  describe('gridLayoutUV', () => {
    it('arranges elements in a grid using UV coordinates', () => {
      const N = 9;
      const uv = new Float32Array(N * 2);
      const out = new Float32Array(N * 3);

      // 3x3 grid - fill UV with grid positions
      for (let i = 0; i < N; i++) {
        const col = i % 3;
        const row = Math.floor(i / 3);
        uv[i * 2 + 0] = (col + 0.5) / 3; // u centered in cell
        uv[i * 2 + 1] = (row + 0.5) / 3; // v centered in cell
      }

      applyFieldKernelZipSig(out, uv, [3, 3], 'gridLayoutUV', N, testFieldType(VEC3));

      // Check corners
      // First element (col=0, row=0)
      expect(out[0]).toBeCloseTo(0.0, 5);
      expect(out[1]).toBeCloseTo(0.0, 5);
      expect(out[2]).toBe(0.0);

      // Last element (col=2, row=2)
      expect(out[24]).toBeCloseTo(1.0, 5);
      expect(out[25]).toBeCloseTo(1.0, 5);
      expect(out[26]).toBe(0.0);

      // Center element (col=1, row=1)
      expect(out[12]).toBeCloseTo(0.5, 5);
      expect(out[13]).toBeCloseTo(0.5, 5);
      expect(out[14]).toBe(0.0);
    });

    it('handles single column/row by centering at 0.5', () => {
      const N = 3;
      const uv = new Float32Array(N * 2);
      const out = new Float32Array(N * 3);

      for (let i = 0; i < N; i++) {
        uv[i * 2 + 0] = (i + 0.5) / N;
        uv[i * 2 + 1] = 0.5;
      }

      applyFieldKernelZipSig(out, uv, [1, 3], 'gridLayoutUV', N, testFieldType(VEC3));

      // All elements should have x = 0.5 (single column)
      expect(out[0]).toBeCloseTo(0.5, 5);
      expect(out[3]).toBeCloseTo(0.5, 5);
      expect(out[6]).toBeCloseTo(0.5, 5);
    });

    it('throws on wrong signal count', () => {
      const uv = new Float32Array(10);
      const out = new Float32Array(15);
      expect(() => applyFieldKernelZipSig(out, uv, [3], 'gridLayoutUV', 5, testFieldType(VEC3))).toThrow(/2 signals/);
    });
  });
});
