/**
 * FieldKernels Tests for PlacementBasis Layouts
 *
 * Tests for circleLayoutUV, lineLayoutUV, gridLayoutUV kernels.
 *
 * NOTE (2026-02-01): These layout kernels have been decomposed into opcode
 * sequences in instance-blocks.ts. The tests below verify they are properly
 * removed from FieldKernels.ts.
 */

import { describe, it, expect } from 'vitest';
import { applyFieldKernelZipSig } from '../FieldKernels';
import { canonicalField, VEC3, type CanonicalType, type PayloadType } from '../../core/canonical-types';
import { instanceId, domainTypeId } from "../../core/ids";

/**
 * Test helper to create a properly-typed CanonicalType for field tests.
 * Returns a CanonicalType with many(instance) cardinality and continuous temporality.
 */
function testFieldType(payload: PayloadType): CanonicalType {
  return canonicalField(payload, { kind: 'scalar' }, { instanceId: instanceId('test-instance'), domainTypeId: domainTypeId('default') });
}

describe('FieldKernels Sprint 4: PlacementBasis Layouts', () => {
  describe('Removed layout kernels throw (decomposed to opcodes)', () => {
    it('circleLayoutUV throws "Unknown field kernel (zipSig)"', () => {
      const uv = new Float32Array(10);
      const out = new Float32Array(15);
      expect(() =>
        applyFieldKernelZipSig(out, uv, [0.3, 0.0], 'circleLayoutUV', 5, testFieldType(VEC3))
      ).toThrow(/Unknown field kernel \(zipSig\)/);
    });

    it('lineLayoutUV throws "Unknown field kernel (zipSig)"', () => {
      const uv = new Float32Array(10);
      const out = new Float32Array(15);
      expect(() =>
        applyFieldKernelZipSig(out, uv, [0.1, 0.2, 0.9, 0.8], 'lineLayoutUV', 5, testFieldType(VEC3))
      ).toThrow(/Unknown field kernel \(zipSig\)/);
    });

    it('gridLayoutUV throws "Unknown field kernel (zipSig)"', () => {
      const uv = new Float32Array(10);
      const out = new Float32Array(15);
      expect(() =>
        applyFieldKernelZipSig(out, uv, [3, 3], 'gridLayoutUV', 5, testFieldType(VEC3))
      ).toThrow(/Unknown field kernel \(zipSig\)/);
    });
  });
});
