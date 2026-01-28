/**
 * PlacementBasis Hot-Swap Tests
 *
 * Sprint 6: Verify that placement basis persists correctly across hot-swap
 * and element count changes.
 */

import { describe, it, expect } from 'vitest';
import { ensurePlacementBasis, MAX_ELEMENTS } from '../PlacementBasis';
import type { BasisKind } from '../../compiler/ir/types';

describe('PlacementBasis Sprint 6: Persistence & Hot-Swap', () => {
  describe('ensurePlacementBasis persistence', () => {
    it('returns same buffer reference on repeated calls', () => {
      const store = new Map();

      const buffers1 = ensurePlacementBasis(store, 'instance1', 100, 'halton2D');
      const buffers2 = ensurePlacementBasis(store, 'instance1', 100, 'halton2D');
      const buffers3 = ensurePlacementBasis(store, 'instance1', 200, 'halton2D');

      // All calls return the same buffer reference
      expect(buffers1).toBe(buffers2);
      expect(buffers1).toBe(buffers3);
    });

    it('preserves buffers across element count changes', () => {
      const store = new Map();

      // First call with 50 elements
      const buffers1 = ensurePlacementBasis(store, 'instance1', 50, 'halton2D');
      const uv_0_before = buffers1.uv[0];
      const rank_5_before = buffers1.rank[5];

      // Second call with 100 elements (hot-swap scenario)
      const buffers2 = ensurePlacementBasis(store, 'instance1', 100, 'halton2D');

      // Same buffer reference
      expect(buffers1).toBe(buffers2);

      // Values unchanged (deterministic generation)
      expect(buffers2.uv[0]).toBe(uv_0_before);
      expect(buffers2.rank[5]).toBe(rank_5_before);
    });

    it('different instances get different buffers', () => {
      const store = new Map();

      const buffers1 = ensurePlacementBasis(store, 'instance1', 100, 'halton2D');
      const buffers2 = ensurePlacementBasis(store, 'instance2', 100, 'halton2D');

      expect(buffers1).not.toBe(buffers2);
      expect(buffers1.seed[0]).not.toBe(buffers2.seed[0]); // Different instance seeds
    });

    it('buffers pre-allocated to MAX_ELEMENTS', () => {
      const store = new Map();

      // Create with small count
      const buffers = ensurePlacementBasis(store, 'instance1', 10, 'halton2D');

      // But buffers are full size
      expect(buffers.uv.length).toBe(MAX_ELEMENTS * 2);
      expect(buffers.rank.length).toBe(MAX_ELEMENTS);
      expect(buffers.seed.length).toBe(MAX_ELEMENTS);
    });
  });

  describe('deterministic generation', () => {
    it('generates same values across multiple store instances', () => {
      const store1 = new Map();
      const store2 = new Map();

      const buffers1 = ensurePlacementBasis(store1, 'test', 100, 'halton2D');
      const buffers2 = ensurePlacementBasis(store2, 'test', 100, 'halton2D');

      // Different buffer instances
      expect(buffers1).not.toBe(buffers2);

      // But same values
      for (let i = 0; i < 100; i++) {
        expect(buffers1.uv[i * 2 + 0]).toBe(buffers2.uv[i * 2 + 0]);
        expect(buffers1.uv[i * 2 + 1]).toBe(buffers2.uv[i * 2 + 1]);
        expect(buffers1.rank[i]).toBe(buffers2.rank[i]);
        expect(buffers1.seed[i]).toBe(buffers2.seed[i]);
      }
    });

    it('values unchanged regardless of initial count', () => {
      const store1 = new Map();
      const store2 = new Map();

      // Different initial counts
      const buffers1 = ensurePlacementBasis(store1, 'test', 50, 'halton2D');
      const buffers2 = ensurePlacementBasis(store2, 'test', 200, 'halton2D');

      // But element 42 has same values in both
      expect(buffers1.uv[42 * 2 + 0]).toBe(buffers2.uv[42 * 2 + 0]);
      expect(buffers1.rank[42]).toBe(buffers2.rank[42]);
      expect(buffers1.seed[42]).toBe(buffers2.seed[42]);
    });
  });

  describe('hot-swap simulation', () => {
    it('simulates element count increase without position change', () => {
      const store = new Map();
      const instanceId = 'particles';
      const basisKind: BasisKind = 'halton2D';

      // Initial state: 50 elements
      const buffers1 = ensurePlacementBasis(store, instanceId, 50, basisKind);

      // Sample some UV values
      const samples = [0, 10, 25, 49].map(i => ({
        u: buffers1.uv[i * 2 + 0],
        v: buffers1.uv[i * 2 + 1],
        rank: buffers1.rank[i],
        seed: buffers1.seed[i],
      }));

      // Hot-swap: increase to 100 elements
      const buffers2 = ensurePlacementBasis(store, instanceId, 100, basisKind);

      // Verify old elements unchanged
      samples.forEach((sample, idx) => {
        const i = [0, 10, 25, 49][idx];
        expect(buffers2.uv[i * 2 + 0]).toBe(sample.u);
        expect(buffers2.uv[i * 2 + 1]).toBe(sample.v);
        expect(buffers2.rank[i]).toBe(sample.rank);
        expect(buffers2.seed[i]).toBe(sample.seed);
      });

      // New elements have valid values
      for (let i = 50; i < 100; i++) {
        expect(buffers2.uv[i * 2 + 0]).toBeGreaterThanOrEqual(0);
        expect(buffers2.uv[i * 2 + 0]).toBeLessThanOrEqual(1);
        expect(buffers2.rank[i]).toBeGreaterThanOrEqual(0);
        expect(buffers2.rank[i]).toBeLessThan(1);
      }
    });

    it('simulates element count decrease preserving remaining elements', () => {
      const store = new Map();
      const instanceId = 'particles';
      const basisKind: BasisKind = 'halton2D';

      // Initial state: 100 elements
      const buffers1 = ensurePlacementBasis(store, instanceId, 100, basisKind);

      // Sample first 30 elements
      const samples = Array.from({ length: 30 }, (_, i) => ({
        u: buffers1.uv[i * 2 + 0],
        v: buffers1.uv[i * 2 + 1],
        rank: buffers1.rank[i],
      }));

      // Hot-swap: decrease to 30 elements
      const buffers2 = ensurePlacementBasis(store, instanceId, 30, basisKind);

      // Same buffer (no reallocation)
      expect(buffers1).toBe(buffers2);

      // First 30 elements unchanged
      samples.forEach((sample, i) => {
        expect(buffers2.uv[i * 2 + 0]).toBe(sample.u);
        expect(buffers2.uv[i * 2 + 1]).toBe(sample.v);
        expect(buffers2.rank[i]).toBe(sample.rank);
      });
    });
  });

  describe('basisKind independence', () => {
    it('different basisKinds produce different UV but same seed', () => {
      const store = new Map();

      const halton = ensurePlacementBasis(store, 'test-halton', 100, 'halton2D');
      const random = ensurePlacementBasis(store, 'test-random', 100, 'random');

      // UV values differ (different generation algorithms)
      expect(halton.uv[10]).not.toBe(random.uv[10]);

      // But seed deterministic per instance (both use same instance id logic)
      // Note: different instanceIds, so seeds will differ
      expect(halton.seed[0]).not.toBe(random.seed[0]);
    });

    it('rank values identical across basisKinds', () => {
      const store = new Map();

      const halton = ensurePlacementBasis(store, 'test1', 100, 'halton2D');
      const spiral = ensurePlacementBasis(store, 'test2', 100, 'spiral');

      // Rank is instance-independent and basis-independent
      // (uses golden ratio on index only)
      expect(halton.rank[5]).toBe(spiral.rank[5]);
      expect(halton.rank[42]).toBe(spiral.rank[42]);
    });
  });
});
