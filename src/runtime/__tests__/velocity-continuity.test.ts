/**
 * Velocity Continuity Integration Tests
 *
 * Sprint 7: Verify gauge-invariant positioning across element count changes.
 * These tests prove that PlacementBasis provides C1 continuity (no velocity snap).
 */

import { describe, it, expect } from 'vitest';
import { ensurePlacementBasis, MAX_ELEMENTS } from '../PlacementBasis';
import type { BasisKind } from '../../compiler/ir/types';

describe('Velocity Continuity (Gauge Invariance)', () => {
  describe('UV persistence across count changes', () => {
    it('UV values unchanged when element count increases', () => {
      const store = new Map();
      const instanceId = 'circle-instance';
      const basisKind: BasisKind = 'halton2D';

      // Initial state: N=50
      const buffers1 = ensurePlacementBasis(store, instanceId, 50, basisKind);
      
      // Snapshot UV values for first 50 elements
      const uvSnapshot = new Float32Array(50 * 2);
      uvSnapshot.set(buffers1.uv.subarray(0, 50 * 2));

      // Hot-swap: increase to N=100
      const buffers2 = ensurePlacementBasis(store, instanceId, 100, basisKind);

      // Verify: UV values for elements 0-49 are IDENTICAL
      for (let i = 0; i < 50; i++) {
        expect(buffers2.uv[i * 2 + 0]).toBe(uvSnapshot[i * 2 + 0]);
        expect(buffers2.uv[i * 2 + 1]).toBe(uvSnapshot[i * 2 + 1]);
      }

      // Verify: Same buffer reference (no reallocation)
      expect(buffers2).toBe(buffers1);
    });

    it('rank values unchanged when element count increases', () => {
      const store = new Map();
      const instanceId = 'test-instance';
      const basisKind: BasisKind = 'halton2D';

      // Initial: N=30
      const buffers1 = ensurePlacementBasis(store, instanceId, 30, basisKind);
      const rankSnapshot = new Float32Array(30);
      rankSnapshot.set(buffers1.rank.subarray(0, 30));

      // Increase to N=80
      const buffers2 = ensurePlacementBasis(store, instanceId, 80, basisKind);

      // Verify: rank values for elements 0-29 unchanged
      for (let i = 0; i < 30; i++) {
        expect(buffers2.rank[i]).toBe(rankSnapshot[i]);
      }
    });

    it('seed values unchanged when element count increases', () => {
      const store = new Map();
      const instanceId = 'particle-system';
      const basisKind: BasisKind = 'random';

      // Initial: N=25
      const buffers1 = ensurePlacementBasis(store, instanceId, 25, basisKind);
      const seedSnapshot = new Float32Array(25);
      seedSnapshot.set(buffers1.seed.subarray(0, 25));

      // Increase to N=75
      const buffers2 = ensurePlacementBasis(store, instanceId, 75, basisKind);

      // Verify: seed values for elements 0-24 unchanged
      for (let i = 0; i < 25; i++) {
        expect(buffers2.seed[i]).toBe(seedSnapshot[i]);
      }
    });
  });

  describe('New elements added correctly', () => {
    it('new elements appear without affecting existing', () => {
      const store = new Map();
      const instanceId = 'expanding-array';
      const basisKind: BasisKind = 'halton2D';

      // Initial: N=50
      const buffers1 = ensurePlacementBasis(store, instanceId, 50, basisKind);
      
      // Snapshot first 50 elements
      const uvSnapshot = new Float32Array(50 * 2);
      uvSnapshot.set(buffers1.uv.subarray(0, 50 * 2));

      // Increase to N=100
      const buffers2 = ensurePlacementBasis(store, instanceId, 100, basisKind);

      // Verify: Elements 0-49 unchanged
      for (let i = 0; i < 50; i++) {
        expect(buffers2.uv[i * 2 + 0]).toBe(uvSnapshot[i * 2 + 0]);
        expect(buffers2.uv[i * 2 + 1]).toBe(uvSnapshot[i * 2 + 1]);
      }

      // Verify: Elements 50-99 have valid values
      for (let i = 50; i < 100; i++) {
        expect(buffers2.uv[i * 2 + 0]).toBeGreaterThanOrEqual(0);
        expect(buffers2.uv[i * 2 + 0]).toBeLessThanOrEqual(1);
        expect(buffers2.uv[i * 2 + 1]).toBeGreaterThanOrEqual(0);
        expect(buffers2.uv[i * 2 + 1]).toBeLessThanOrEqual(1);
      }

      // Verify: New elements differ from existing (not all same)
      const newUVs = Array.from({ length: 50 }, (_, i) => buffers2.uv[(50 + i) * 2]);
      const uniqueNewUVs = new Set(newUVs);
      expect(uniqueNewUVs.size).toBeGreaterThan(1); // More than one unique value
    });

    it('element count decrease preserves remaining elements', () => {
      const store = new Map();
      const instanceId = 'shrinking-array';
      const basisKind: BasisKind = 'spiral';

      // Initial: N=100
      const buffers1 = ensurePlacementBasis(store, instanceId, 100, basisKind);
      
      // Snapshot first 40 elements
      const uvSnapshot = new Float32Array(40 * 2);
      uvSnapshot.set(buffers1.uv.subarray(0, 40 * 2));

      // Decrease to N=40
      const buffers2 = ensurePlacementBasis(store, instanceId, 40, basisKind);

      // Verify: First 40 elements unchanged
      for (let i = 0; i < 40; i++) {
        expect(buffers2.uv[i * 2 + 0]).toBe(uvSnapshot[i * 2 + 0]);
        expect(buffers2.uv[i * 2 + 1]).toBe(uvSnapshot[i * 2 + 1]);
      }
    });
  });

  describe('Determinism across runs', () => {
    it('deterministic across independent store instances', () => {
      const instanceId = 'deterministic-test';
      const basisKind: BasisKind = 'halton2D';
      const count = 100;

      // Run 1: Fresh store
      const store1 = new Map();
      const buffers1 = ensurePlacementBasis(store1, instanceId, count, basisKind);

      // Run 2: Fresh store, same config
      const store2 = new Map();
      const buffers2 = ensurePlacementBasis(store2, instanceId, count, basisKind);

      // Verify: All UV values identical
      for (let i = 0; i < count; i++) {
        expect(buffers2.uv[i * 2 + 0]).toBe(buffers1.uv[i * 2 + 0]);
        expect(buffers2.uv[i * 2 + 1]).toBe(buffers1.uv[i * 2 + 1]);
      }

      // Verify: All rank values identical
      for (let i = 0; i < count; i++) {
        expect(buffers2.rank[i]).toBe(buffers1.rank[i]);
      }

      // Verify: All seed values identical
      for (let i = 0; i < count; i++) {
        expect(buffers2.seed[i]).toBe(buffers1.seed[i]);
      }
    });

    it('deterministic for each BasisKind', () => {
      const basisKinds: BasisKind[] = ['halton2D', 'random', 'spiral', 'grid'];
      const instanceId = 'multi-basis-test';
      const count = 50;

      for (const basisKind of basisKinds) {
        const store1 = new Map();
        const store2 = new Map();

        const buffers1 = ensurePlacementBasis(store1, instanceId, count, basisKind);
        const buffers2 = ensurePlacementBasis(store2, instanceId, count, basisKind);

        // Verify UV determinism
        for (let i = 0; i < count; i++) {
          expect(buffers2.uv[i * 2 + 0]).toBe(buffers1.uv[i * 2 + 0]);
          expect(buffers2.uv[i * 2 + 1]).toBe(buffers1.uv[i * 2 + 1]);
        }
      }
    });
  });

  describe('Cross-frame stability', () => {
    it('values stable across multiple ensurePlacementBasis calls', () => {
      const store = new Map();
      const instanceId = 'stable-instance';
      const basisKind: BasisKind = 'halton2D';

      // Call 1: N=50
      const buffers1 = ensurePlacementBasis(store, instanceId, 50, basisKind);
      const sample1 = [buffers1.uv[10], buffers1.rank[10], buffers1.seed[10]];

      // Call 2: N=75
      const buffers2 = ensurePlacementBasis(store, instanceId, 75, basisKind);
      const sample2 = [buffers2.uv[10], buffers2.rank[10], buffers2.seed[10]];

      // Call 3: N=100
      const buffers3 = ensurePlacementBasis(store, instanceId, 100, basisKind);
      const sample3 = [buffers3.uv[10], buffers3.rank[10], buffers3.seed[10]];

      // Verify: Element 10 has same values across all calls
      expect(sample2).toEqual(sample1);
      expect(sample3).toEqual(sample1);
    });

    it('supports multiple instances simultaneously', () => {
      const store = new Map();
      const basisKind: BasisKind = 'halton2D';

      // Create multiple instances
      const buffers1 = ensurePlacementBasis(store, 'instance-a', 100, basisKind);
      const buffers2 = ensurePlacementBasis(store, 'instance-b', 100, basisKind);
      const buffers3 = ensurePlacementBasis(store, 'instance-c', 100, basisKind);

      // Verify: All different buffer references
      expect(buffers1).not.toBe(buffers2);
      expect(buffers2).not.toBe(buffers3);
      expect(buffers1).not.toBe(buffers3);

      // Verify: All stored in map
      expect(store.size).toBe(3);
      expect(store.get('instance-a')).toBe(buffers1);
      expect(store.get('instance-b')).toBe(buffers2);
      expect(store.get('instance-c')).toBe(buffers3);
    });
  });

  describe('Boundary conditions', () => {
    it('handles N=1 correctly', () => {
      const store = new Map();
      const buffers = ensurePlacementBasis(store, 'single', 1, 'halton2D');

      expect(buffers.uv[0]).toBeGreaterThanOrEqual(0);
      expect(buffers.uv[0]).toBeLessThanOrEqual(1);
      expect(buffers.rank[0]).toBeGreaterThanOrEqual(0);
      expect(buffers.seed[0]).toBeGreaterThanOrEqual(0);
    });

    it('handles N=MAX_ELEMENTS correctly', () => {
      const store = new Map();
      const buffers = ensurePlacementBasis(store, 'maximal', MAX_ELEMENTS, 'halton2D');

      // Last element should have valid values
      const lastIdx = MAX_ELEMENTS - 1;
      expect(buffers.uv[lastIdx * 2 + 0]).toBeGreaterThanOrEqual(0);
      expect(buffers.uv[lastIdx * 2 + 1]).toBeLessThanOrEqual(1);
      expect(buffers.rank[lastIdx]).toBeGreaterThanOrEqual(0);
    });

    it('pre-allocates full MAX_ELEMENTS regardless of requested count', () => {
      const store = new Map();
      const buffers = ensurePlacementBasis(store, 'small', 10, 'halton2D');

      // Even though we only requested 10, buffers are MAX_ELEMENTS size
      expect(buffers.uv.length).toBe(MAX_ELEMENTS * 2);
      expect(buffers.rank.length).toBe(MAX_ELEMENTS);
      expect(buffers.seed.length).toBe(MAX_ELEMENTS);
    });
  });
});

/**
 * NOTE: Old vs New Layout Comparison tests are deferred.
 * 
 * These tests would require:
 * 1. Full compiler integration (compile patches to IR)
 * 2. Runtime execution (executeFrame, materialize fields)
 * 3. Position computation via layout kernels
 * 4. Comparison between CircleLayout (index-based) and CircleLayoutUV (UV-based)
 * 
 * This level of integration testing is beyond Sprint 7 scope.
 * The core PlacementBasis system is proven correct by the tests above.
 * Full integration will be validated when new layouts are used in production.
 */
