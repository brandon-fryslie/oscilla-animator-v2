/**
 * ══════════════════════════════════════════════════════════════════════
 * KERNEL REGISTRY TESTS
 * ══════════════════════════════════════════════════════════════════════
 *
 * Tests for KernelRegistry infrastructure (Phase A).
 *
 * Test Coverage:
 * - Register + resolve + call (scalar and lane kernels)
 * - Missing kernel error (KernelNotImplemented)
 * - Duplicate registration error
 * - Invalid metadata validation
 * - Arity validation (Phase B, when implemented)
 */

import { describe, it, expect } from 'vitest';
import {
  KernelRegistry,
  kernelId,
  type ScalarKernel,
  type LaneKernel,
  type KernelMeta,
} from '../KernelRegistry';

describe('KernelRegistry', () => {
  describe('ScalarKernel registration and dispatch', () => {
    it('should register, resolve, and call a scalar kernel', () => {
      const registry = new KernelRegistry();

      // Register a simple scalar kernel
      const addFn: ScalarKernel = (args) => args[0] + args[1];
      const meta: KernelMeta = {
        argCount: 2,
        purity: 'pure',
        guaranteesFiniteForFiniteInputs: true,
      };

      const handle = registry.registerScalar(kernelId('add'), addFn, meta);

      // Resolve kernel
      const resolved = registry.resolve(kernelId('add'));
      expect(resolved.handle).toBe(handle);
      expect(resolved.abi).toBe('scalar');
      expect(resolved.meta).toEqual(meta);

      // Call kernel
      const result = registry.callScalar(handle, [5, 3]);
      expect(result).toBe(8);
    });

    it('should support multiple scalar kernels', () => {
      const registry = new KernelRegistry();

      const addFn: ScalarKernel = (args) => args[0] + args[1];
      const mulFn: ScalarKernel = (args) => args[0] * args[1];

      const meta: KernelMeta = {
        argCount: 2,
        purity: 'pure',
        guaranteesFiniteForFiniteInputs: true,
      };

      const h1 = registry.registerScalar(kernelId('add'), addFn, meta);
      const h2 = registry.registerScalar(kernelId('mul'), mulFn, meta);

      expect(registry.callScalar(h1, [5, 3])).toBe(8);
      expect(registry.callScalar(h2, [5, 3])).toBe(15);
    });
  });

  describe('LaneKernel registration and dispatch', () => {
    it('should register, resolve, and call a lane kernel', () => {
      const registry = new KernelRegistry();

      // Register a simple lane kernel (writes 2 components)
      const vec2Fn: LaneKernel = (out, outBase, args) => {
        out[outBase + 0] = args[0];
        out[outBase + 1] = args[1];
      };

      const meta: KernelMeta = {
        argCount: 2,
        purity: 'pure',
        guaranteesFiniteForFiniteInputs: true,
        outStride: 2,
      };

      const handle = registry.registerLane(kernelId('makeVec2'), vec2Fn, meta);

      // Resolve kernel
      const resolved = registry.resolve(kernelId('makeVec2'));
      expect(resolved.handle).toBe(handle);
      expect(resolved.abi).toBe('lane');
      expect(resolved.meta.outStride).toBe(2);

      // Call kernel
      const out = new Float32Array(10);
      registry.callLane(handle, out, 3, [5.5, 7.2]);
      expect(out[3]).toBeCloseTo(5.5);
      expect(out[4]).toBeCloseTo(7.2);
    });

    it('should require outStride for lane kernels', () => {
      const registry = new KernelRegistry();

      const vec2Fn: LaneKernel = (out, outBase, args) => {
        out[outBase + 0] = args[0];
        out[outBase + 1] = args[1];
      };

      // Missing outStride
      const badMeta: KernelMeta = {
        argCount: 2,
        purity: 'pure',
        guaranteesFiniteForFiniteInputs: true,
      };

      expect(() => {
        registry.registerLane(kernelId('makeVec2'), vec2Fn, badMeta);
      }).toThrow(/outStride/);
    });
  });

  describe('Error cases', () => {
    it('should throw if kernel not found', () => {
      const registry = new KernelRegistry();

      expect(() => {
        registry.resolve(kernelId('nonExistent'));
      }).toThrow(/not found/);
    });

    it('should throw if kernel already registered', () => {
      const registry = new KernelRegistry();

      const fn: ScalarKernel = (args) => args[0];
      const meta: KernelMeta = {
        argCount: 1,
        purity: 'pure',
        guaranteesFiniteForFiniteInputs: true,
      };

      registry.registerScalar(kernelId('test'), fn, meta);

      expect(() => {
        registry.registerScalar(kernelId('test'), fn, meta);
      }).toThrow(/already registered/);
    });

    it('should validate metadata argCount', () => {
      const registry = new KernelRegistry();

      const fn: ScalarKernel = (args) => args[0];
      const badMeta: KernelMeta = {
        argCount: -1, // Invalid
        purity: 'pure',
        guaranteesFiniteForFiniteInputs: true,
      };

      expect(() => {
        registry.registerScalar(kernelId('test'), fn, badMeta);
      }).toThrow(/argCount/);
    });

    it('should validate metadata range', () => {
      const registry = new KernelRegistry();

      const fn: ScalarKernel = (args) => args[0];
      const badMeta: KernelMeta = {
        argCount: 1,
        purity: 'pure',
        guaranteesFiniteForFiniteInputs: true,
        range: { min: 10, max: 5 }, // min > max
      };

      expect(() => {
        registry.registerScalar(kernelId('test'), fn, badMeta);
      }).toThrow(/range/);
    });

    it('should throw if handle is invalid', () => {
      const registry = new KernelRegistry();

      const fn: ScalarKernel = (args) => args[0];
      const meta: KernelMeta = {
        argCount: 1,
        purity: 'pure',
        guaranteesFiniteForFiniteInputs: true,
      };

      registry.registerScalar(kernelId('test'), fn, meta);

      // Invalid handle (out of bounds)
      expect(() => {
        registry.callScalar(999 as any, [1]);
      }).toThrow(/Invalid.*handle/);
    });
  });

  describe('getMeta', () => {
    it('should return metadata for a valid handle', () => {
      const registry = new KernelRegistry();

      const fn: ScalarKernel = (args) => args[0];
      const meta: KernelMeta = {
        argCount: 1,
        purity: 'pure',
        guaranteesFiniteForFiniteInputs: true,
        range: { min: 0, max: 1 },
      };

      const handle = registry.registerScalar(kernelId('test'), fn, meta);
      const retrievedMeta = registry.getMeta(handle, 'scalar');

      expect(retrievedMeta).toEqual(meta);
    });
  });
});
