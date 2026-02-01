/**
 * ══════════════════════════════════════════════════════════════════════
 * NOISE3 TESTS
 * ══════════════════════════════════════════════════════════════════════
 *
 * Tests for 3D simplex noise kernel.
 *
 * Test Coverage:
 * - Determinism: same inputs → same output
 * - Finiteness: bounded inputs → finite output
 * - Range: output approximately in [-1, 1]
 * - Spatial coherence: nearby inputs → nearby outputs
 * - Seed variation: different seeds → different outputs
 */

import { describe, it, expect } from 'vitest';
import { noise3 } from '../noise3';

describe('noise3', () => {
  describe('Determinism', () => {
    it('should return the same value for the same inputs', () => {
      const args = [1.5, 2.3, -0.7, 42];
      const result1 = noise3(args);
      const result2 = noise3(args);
      expect(result1).toBe(result2);
    });

    it('should be deterministic across multiple calls', () => {
      const testCases = [
        [0, 0, 0, 0],
        [1, 1, 1, 0],
        [100, 200, 300, 123],
        [-5.5, 10.2, -3.1, 999],
      ];

      for (const args of testCases) {
        const result1 = noise3(args);
        const result2 = noise3(args);
        expect(result1).toBe(result2);
      }
    });
  });

  describe('Finiteness', () => {
    it('should return finite values for bounded inputs', () => {
      const testCases = [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [10, 20, 30, 5],
        [-10, -20, -30, 10],
        [0.5, 0.5, 0.5, 0.5],
      ];

      for (const args of testCases) {
        const result = noise3(args);
        expect(Number.isFinite(result)).toBe(true);
      }
    });

    it('should handle large coordinates', () => {
      const result = noise3([1000, 2000, 3000, 42]);
      expect(Number.isFinite(result)).toBe(true);
    });
  });

  describe('Range', () => {
    it('should return values approximately in [-1, 1]', () => {
      // Sample many points
      const samples = 100;
      const results: number[] = [];

      for (let i = 0; i < samples; i++) {
        const x = Math.random() * 100 - 50;
        const y = Math.random() * 100 - 50;
        const z = Math.random() * 100 - 50;
        const seed = Math.random() * 1000;
        results.push(noise3([x, y, z, seed]));
      }

      // Check that most values are in [-1, 1]
      // (Simplex noise can occasionally exceed these bounds by a small margin)
      const inRange = results.filter(v => v >= -1.5 && v <= 1.5);
      expect(inRange.length).toBe(samples);

      // Check that we get some variation (not all zeros)
      const nonZero = results.filter(v => Math.abs(v) > 0.01);
      expect(nonZero.length).toBeGreaterThan(samples / 2);
    });

    it('should produce values with reasonable distribution', () => {
      // Sample around origin (use non-integer coordinates to avoid lattice points)
      const samples = 50;
      const results: number[] = [];

      for (let i = 0; i < samples; i++) {
        const x = i * 0.1 + 0.37; // Offset to avoid integer lattice points
        const y = i * 0.1 + 0.53;
        const z = i * 0.1 + 0.71;
        results.push(noise3([x, y, z, 0]));
      }

      // Compute min/max
      const min = Math.min(...results);
      const max = Math.max(...results);

      // Should have reasonable spread
      expect(max - min).toBeGreaterThan(0.5);
    });
  });

  describe('Spatial coherence', () => {
    it('should produce smooth gradients (nearby inputs → nearby outputs)', () => {
      const baseX = 5.0;
      const baseY = 3.0;
      const baseZ = 7.0;
      const seed = 42;

      const base = noise3([baseX, baseY, baseZ, seed]);

      // Small offset should produce similar value
      const offset = 0.01;
      const nearbyX = noise3([baseX + offset, baseY, baseZ, seed]);
      const nearbyY = noise3([baseX, baseY + offset, baseZ, seed]);
      const nearbyZ = noise3([baseX, baseY, baseZ + offset, seed]);

      // Difference should be small for small offset
      expect(Math.abs(nearbyX - base)).toBeLessThan(0.1);
      expect(Math.abs(nearbyY - base)).toBeLessThan(0.1);
      expect(Math.abs(nearbyZ - base)).toBeLessThan(0.1);
    });

    it('should produce continuous variation along a line', () => {
      const results: number[] = [];
      const seed = 0;

      // Sample along x-axis (use non-integer offsets)
      for (let i = 0; i < 10; i++) {
        results.push(noise3([i * 0.5 + 0.123, 0.456, 0.789, seed]));
      }

      // Check that adjacent values don't jump too much
      for (let i = 1; i < results.length; i++) {
        const diff = Math.abs(results[i] - results[i - 1]);
        expect(diff).toBeLessThan(0.7); // Reasonable continuity
      }
    });
  });

  describe('Seed variation', () => {
    it('should produce different outputs for different seeds', () => {
      // Use non-integer coordinates (simplex noise returns 0 at integer lattice points)
      const x = 1.5, y = 2.3, z = 3.7;

      const result1 = noise3([x, y, z, 0]);
      const result2 = noise3([x, y, z, 1]);
      const result3 = noise3([x, y, z, 100]);

      // Different seeds should produce different values
      expect(result1).not.toBe(result2);
      expect(result2).not.toBe(result3);
      expect(result1).not.toBe(result3);
    });

    it('should produce distinct patterns for different seeds', () => {
      // Use non-integer coordinates
      const positions = [
        [0.5, 0.5, 0.5],
        [1.5, 1.5, 1.5],
        [2.5, 2.5, 2.5],
        [3.5, 3.5, 3.5],
      ];

      const pattern1 = positions.map(([x, y, z]) => noise3([x, y, z, 0]));
      const pattern2 = positions.map(([x, y, z]) => noise3([x, y, z, 999]));

      // Patterns should be different
      let diffCount = 0;
      for (let i = 0; i < pattern1.length; i++) {
        if (Math.abs(pattern1[i] - pattern2[i]) > 0.01) {
          diffCount++;
        }
      }

      expect(diffCount).toBeGreaterThanOrEqual(2); // Most values should differ
    });
  });

  describe('Edge cases', () => {
    it('should handle zero coordinates', () => {
      const result = noise3([0, 0, 0, 0]);
      expect(Number.isFinite(result)).toBe(true);
    });

    it('should handle negative coordinates', () => {
      const result = noise3([-10, -20, -30, 0]);
      expect(Number.isFinite(result)).toBe(true);
    });

    it('should handle fractional coordinates', () => {
      const result = noise3([0.123, 0.456, 0.789, 0.1]);
      expect(Number.isFinite(result)).toBe(true);
    });
  });
});
