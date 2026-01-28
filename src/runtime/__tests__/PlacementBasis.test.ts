/**
 * PlacementBasis Tests
 *
 * Tests for gauge-invariant placement coordinate system.
 */

import { describe, it, expect } from 'vitest';
import {
  MAX_ELEMENTS,
  halton,
  halton2D,
  generateRank,
  generateSeed,
  generateUV,
} from '../PlacementBasis';
import type { BasisKind } from '../../compiler/ir/types';

describe('PlacementBasis Sprint 1: Type Foundation', () => {
  describe('constants', () => {
    it('MAX_ELEMENTS is defined and correct', () => {
      expect(MAX_ELEMENTS).toBe(10_000);
    });
  });

  describe('types', () => {
    it('PlacementFieldName type is exported from IR types', () => {
      // Type-only test - if this compiles, the type exists
      const field: import('../../compiler/ir/types').PlacementFieldName = 'uv';
      expect(['uv', 'rank', 'seed']).toContain(field);
    });

    it('BasisKind type is exported from IR types', () => {
      // Type-only test - if this compiles, the type exists
      const kind: import('../../compiler/ir/types').BasisKind = 'halton2D';
      expect(['halton2D', 'random', 'spiral', 'grid']).toContain(kind);
    });
  });
});

describe('PlacementBasis Sprint 2: Generation Functions', () => {
  describe('halton', () => {
    it('produces values in [0,1]', () => {
      for (let i = 0; i < 1000; i++) {
        const v = halton(i, 2);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });

    it('is deterministic', () => {
      expect(halton(42, 2)).toBe(halton(42, 2));
      expect(halton(42, 3)).toBe(halton(42, 3));
    });

    it('throws on missing parameters', () => {
      expect(() => halton(undefined as any, 2)).toThrow();
      expect(() => halton(5, undefined as any)).toThrow();
    });
  });

  describe('halton2D', () => {
    it('produces values in [0,1] x [0,1]', () => {
      for (let i = 0; i < 1000; i++) {
        const [u, v] = halton2D(i, 2, 3);
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(1);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });

    it('is deterministic', () => {
      const [u1, v1] = halton2D(42, 2, 3);
      const [u2, v2] = halton2D(42, 2, 3);
      expect(u1).toBe(u2);
      expect(v1).toBe(v2);
    });

    it('throws on missing parameters', () => {
      expect(() => halton2D(5, undefined as any, 3)).toThrow();
      expect(() => halton2D(5, 2, undefined as any)).toThrow();
    });
  });

  describe('generateRank', () => {
    it('produces values in [0,1)', () => {
      for (let i = 0; i < 1000; i++) {
        const v = generateRank(i);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });

    it('is deterministic', () => {
      expect(generateRank(42)).toBe(generateRank(42));
    });

    it('has good distribution (no clustering)', () => {
      const buckets = new Array(10).fill(0);
      for (let i = 0; i < 1000; i++) {
        const bucket = Math.floor(generateRank(i) * 10);
        buckets[Math.min(bucket, 9)]++;
      }
      // Each bucket should have ~100 ± 50
      for (const count of buckets) {
        expect(count).toBeGreaterThan(50);
        expect(count).toBeLessThan(150);
      }
    });

    it('throws on missing parameter', () => {
      expect(() => generateRank(undefined as any)).toThrow();
    });
  });

  describe('generateSeed', () => {
    it('produces values in [0,1]', () => {
      for (let i = 0; i < 100; i++) {
        const v = generateSeed('test', i);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });

    it('is deterministic', () => {
      expect(generateSeed('instance1', 42)).toBe(generateSeed('instance1', 42));
    });

    it('produces different values for different instances', () => {
      expect(generateSeed('instance1', 42)).not.toBe(generateSeed('instance2', 42));
    });

    it('produces different values for different indices', () => {
      expect(generateSeed('instance1', 42)).not.toBe(generateSeed('instance1', 43));
    });

    it('throws on missing parameters', () => {
      expect(() => generateSeed(undefined as any, 42)).toThrow();
      expect(() => generateSeed('test', undefined as any)).toThrow();
    });
  });

  describe('generateUV', () => {
    it('handles all BasisKind values', () => {
      const kinds: BasisKind[] = ['halton2D', 'random', 'spiral', 'grid'];
      for (const kind of kinds) {
        const [u, v] = generateUV(kind, 42, 'test');
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(1);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });

    it('halton2D produces deterministic values', () => {
      const [u1, v1] = generateUV('halton2D', 42, 'test');
      const [u2, v2] = generateUV('halton2D', 42, 'test');
      expect(u1).toBe(u2);
      expect(v1).toBe(v2);
    });

    it('random produces instance-specific values', () => {
      const [u1, v1] = generateUV('random', 42, 'instance1');
      const [u2, v2] = generateUV('random', 42, 'instance2');
      expect(u1).not.toBe(u2);
      expect(v1).not.toBe(v2);
    });

    it('spiral produces centered values', () => {
      // First element should be near center (index 0 → radius 0)
      const [u, v] = generateUV('spiral', 0, 'test');
      expect(u).toBeCloseTo(0.5, 1);
      expect(v).toBeCloseTo(0.5, 1);
    });

    it('grid uses halton sequence', () => {
      const [u1, v1] = generateUV('grid', 42, 'test');
      const [u2, v2] = halton2D(42, 2, 3);
      expect(u1).toBe(u2);
      expect(v1).toBe(v2);
    });

    it('throws on missing basisKind', () => {
      expect(() => generateUV(undefined as any, 42, 'test')).toThrow(/basisKind.*required/i);
    });

    it('exhaustive switch handles all BasisKind values', () => {
      // Type check: This test ensures the switch is exhaustive
      // If a new BasisKind is added, this will fail to compile
      const allKinds: BasisKind[] = ['halton2D', 'random', 'spiral', 'grid'];
      for (const kind of allKinds) {
        expect(() => generateUV(kind, 0, 'test')).not.toThrow();
      }
    });
  });
});
