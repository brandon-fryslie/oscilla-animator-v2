/**
 * FieldStatsAccumulator Tests
 *
 * Tests:
 * - Stride 1 and stride 4 accumulation
 * - allTimeMin/Max only expand
 * - EMA convergence
 * - Ring buffer wrap
 * - Percentile accuracy
 * - Reset clears everything
 */

import { describe, it, expect } from 'vitest';
import { FieldStatsAccumulator } from './FieldStatsAccumulator';
import type { Stride } from './types';

describe('FieldStatsAccumulator', () => {
  describe('stride 1 (scalar float)', () => {
    it('computes correct stats for a single frame', () => {
      const acc = new FieldStatsAccumulator(1 as Stride);
      acc.update(new Float32Array([0.25, 0.5, 0.75, 1.0]), 4);

      const stats = acc.getAccumulatedStats();
      expect(stats.count).toBe(4);
      expect(stats.stride).toBe(1);
      expect(stats.min[0]).toBe(0.25);
      expect(stats.max[0]).toBe(1.0);
      expect(stats.mean[0]).toBeCloseTo(0.625); // First frame seeds EMA directly
    });

    it('allTimeMin/Max only expand, never shrink', () => {
      const acc = new FieldStatsAccumulator(1 as Stride);

      // Frame 1: range [0.2, 0.8]
      acc.update(new Float32Array([0.2, 0.5, 0.8]), 3);
      expect(acc.getAccumulatedStats().min[0]).toBeCloseTo(0.2);
      expect(acc.getAccumulatedStats().max[0]).toBeCloseTo(0.8);

      // Frame 2: narrower range [0.4, 0.6] — min/max should NOT shrink
      acc.update(new Float32Array([0.4, 0.5, 0.6]), 3);
      expect(acc.getAccumulatedStats().min[0]).toBeCloseTo(0.2); // Still 0.2
      expect(acc.getAccumulatedStats().max[0]).toBeCloseTo(0.8); // Still 0.8

      // Frame 3: wider range [0.0, 1.0] — min/max should expand
      acc.update(new Float32Array([0.0, 0.5, 1.0]), 3);
      expect(acc.getAccumulatedStats().min[0]).toBeCloseTo(0.0);
      expect(acc.getAccumulatedStats().max[0]).toBeCloseTo(1.0);
    });

    it('EMA converges toward consistent value', () => {
      const acc = new FieldStatsAccumulator(1 as Stride);

      // Push many frames of constant value
      for (let i = 0; i < 500; i++) {
        acc.update(new Float32Array([5.0]), 1);
      }

      expect(acc.getAccumulatedStats().mean[0]).toBeCloseTo(5.0, 2);
    });

    it('EMA barely moves on a spike', () => {
      const acc = new FieldStatsAccumulator(1 as Stride);

      // Seed with 100 frames of 1.0
      for (let i = 0; i < 100; i++) {
        acc.update(new Float32Array([1.0]), 1);
      }
      const beforeSpike = acc.getAccumulatedStats().mean[0];

      // Single spike to 1000.0
      acc.update(new Float32Array([1000.0]), 1);
      const afterSpike = acc.getAccumulatedStats().mean[0];

      // Should barely move (alpha ~0.000385)
      expect(afterSpike).toBeGreaterThan(beforeSpike);
      expect(afterSpike).toBeLessThan(2.0);
    });
  });

  describe('stride 4 (color RGBA)', () => {
    it('computes per-component stats', () => {
      const acc = new FieldStatsAccumulator(4 as Stride);

      // 2 lanes of RGBA
      const buffer = new Float32Array([
        0.1, 0.3, 0.5, 1.0, // lane 0
        0.9, 0.7, 0.5, 0.5, // lane 1
      ]);
      acc.update(buffer, 2);

      const stats = acc.getAccumulatedStats();
      expect(stats.count).toBe(2);
      expect(stats.stride).toBe(4);

      // R: min=0.1, max=0.9, mean=0.5
      expect(stats.min[0]).toBeCloseTo(0.1);
      expect(stats.max[0]).toBeCloseTo(0.9);
      expect(stats.mean[0]).toBeCloseTo(0.5);

      // G: min=0.3, max=0.7, mean=0.5
      expect(stats.min[1]).toBeCloseTo(0.3);
      expect(stats.max[1]).toBeCloseTo(0.7);
      expect(stats.mean[1]).toBeCloseTo(0.5);

      // B: min=0.5, max=0.5, mean=0.5
      expect(stats.min[2]).toBeCloseTo(0.5);
      expect(stats.max[2]).toBeCloseTo(0.5);

      // A: min=0.5, max=1.0
      expect(stats.min[3]).toBeCloseTo(0.5);
      expect(stats.max[3]).toBeCloseTo(1.0);
    });
  });

  describe('percentiles', () => {
    it('computes p25 and p75 correctly', () => {
      const acc = new FieldStatsAccumulator(1 as Stride);

      // 100 evenly spaced values [0, 0.01, 0.02, ..., 0.99]
      const buf = new Float32Array(100);
      for (let i = 0; i < 100; i++) buf[i] = i * 0.01;
      acc.update(buf, 100);

      const history = acc.getHistory();
      const snap = history.snapshots[0];
      expect(snap.p25[0]).toBeCloseTo(0.25, 1);
      expect(snap.p75[0]).toBeCloseTo(0.75, 1);
    });
  });

  describe('ring buffer', () => {
    it('wraps after capacity frames', () => {
      const acc = new FieldStatsAccumulator(1 as Stride);

      // Push 300 frames (capacity is 256)
      for (let i = 0; i < 300; i++) {
        acc.update(new Float32Array([i]), 1);
      }

      const history = acc.getHistory();
      expect(history.writeIndex).toBe(300);
      expect(history.filled).toBe(true);
      expect(history.capacity).toBe(256);
    });

    it('does not mark filled before capacity', () => {
      const acc = new FieldStatsAccumulator(1 as Stride);

      for (let i = 0; i < 100; i++) {
        acc.update(new Float32Array([i]), 1);
      }

      const history = acc.getHistory();
      expect(history.writeIndex).toBe(100);
      expect(history.filled).toBe(false);
    });
  });

  describe('reset', () => {
    it('clears all accumulated state', () => {
      const acc = new FieldStatsAccumulator(1 as Stride);

      // Accumulate some data
      acc.update(new Float32Array([0.1, 0.9]), 2);
      acc.update(new Float32Array([0.2, 0.8]), 2);

      // Verify data exists
      expect(acc.getAccumulatedStats().count).toBe(2);
      expect(acc.getHistory().writeIndex).toBe(2);

      // Reset
      acc.reset();

      // All state should be cleared
      const stats = acc.getAccumulatedStats();
      expect(stats.count).toBe(0);
      expect(stats.min[0]).toBe(Infinity); // Back to initial
      expect(stats.max[0]).toBe(-Infinity);
      expect(stats.mean[0]).toBe(0);

      const history = acc.getHistory();
      expect(history.writeIndex).toBe(0);
      expect(history.filled).toBe(false);
    });
  });

  describe('empty buffer', () => {
    it('handles zero-count update', () => {
      const acc = new FieldStatsAccumulator(1 as Stride);
      acc.update(new Float32Array(0), 0);

      const stats = acc.getAccumulatedStats();
      expect(stats.count).toBe(0);

      const history = acc.getHistory();
      expect(history.writeIndex).toBe(1); // Still pushes empty snapshot
    });
  });
});
