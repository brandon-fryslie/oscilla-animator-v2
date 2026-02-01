/**
 * Metadata-driven property tests for all registered kernels.
 *
 * These tests iterate over every kernel in the default registry and validate
 * the properties declared in their metadata:
 * - Determinism: same inputs → same output
 * - Finiteness: bounded inputs → finite output
 * - Range: output within declared bounds
 * - Purity: no side effects (no state changes between calls)
 */

import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../kernels/default-registry';

describe('kernel property tests (metadata-driven)', () => {
  const registry = createDefaultRegistry();
  const allKernels = registry.listAll();

  describe.each(allKernels)('$id ($abi)', (entry) => {
    const { id, abi, handle, meta } = entry;

    if (meta.purity === 'pure') {
      it('is deterministic (same args → same output)', () => {
        const args = generateArgs(meta.argCount);

        if (abi === 'scalar') {
          const r1 = registry.callScalar(handle, args);
          const r2 = registry.callScalar(handle, args);
          expect(r1).toBe(r2);
        } else {
          const out1 = new Float32Array(meta.outStride ?? 4);
          const out2 = new Float32Array(meta.outStride ?? 4);
          registry.callLane(handle, out1, 0, args);
          registry.callLane(handle, out2, 0, args);
          for (let i = 0; i < out1.length; i++) {
            expect(out1[i]).toBe(out2[i]);
          }
        }
      });
    }

    if (meta.guaranteesFiniteForFiniteInputs) {
      it('produces finite output for bounded inputs', () => {
        // Test with 50 random inputs
        for (let trial = 0; trial < 50; trial++) {
          const args = generateRandomArgs(meta.argCount);

          if (abi === 'scalar') {
            const result = registry.callScalar(handle, args);
            expect(Number.isFinite(result)).toBe(true);
          } else {
            const out = new Float32Array(meta.outStride ?? 4);
            registry.callLane(handle, out, 0, args);
            for (let i = 0; i < (meta.outStride ?? 4); i++) {
              expect(Number.isFinite(out[i])).toBe(true);
            }
          }
        }
      });
    }

    if (meta.range && abi === 'scalar') {
      it(`scalar output in [${meta.range.min}, ${meta.range.max}]`, () => {
        for (let trial = 0; trial < 100; trial++) {
          const args = generateRandomArgs(meta.argCount);
          const result = registry.callScalar(handle, args);
          expect(result).toBeGreaterThanOrEqual(meta.range!.min);
          expect(result).toBeLessThanOrEqual(meta.range!.max);
        }
      });
    }

    if (meta.range && abi === 'lane') {
      it(`lane output channels in [${meta.range.min}, ${meta.range.max}]`, () => {
        for (let trial = 0; trial < 50; trial++) {
          const args = generateRandomArgs(meta.argCount);
          const out = new Float32Array(meta.outStride ?? 4);
          registry.callLane(handle, out, 0, args);
          for (let i = 0; i < (meta.outStride ?? 4); i++) {
            expect(out[i]).toBeGreaterThanOrEqual(meta.range!.min);
            expect(out[i]).toBeLessThanOrEqual(meta.range!.max);
          }
        }
      });
    }
  });
});

// =============================================================================
// Helpers
// =============================================================================

function generateArgs(count: number): number[] {
  return Array.from({ length: count }, (_, i) => 0.3 + i * 0.1);
}

function generateRandomArgs(count: number): number[] {
  return Array.from({ length: count }, () => Math.random() * 2 - 1);
}
