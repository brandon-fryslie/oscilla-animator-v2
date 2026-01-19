/**
 * Unit tests for Continuity Apply module
 *
 * Tests gauge and slew filter implementations per spec topics/11-continuity-system.md §2.5, §4.1
 */

import { describe, it, expect } from 'vitest';
import {
  applyAdditiveGauge,
  initializeGaugeOnDomainChange,
  applySlewFilter,
  initializeSlewBuffer,
  initializeSlewWithMapping,
} from '../ContinuityApply';
import type { MappingState } from '../ContinuityState';

describe('ContinuityApply', () => {
  describe('applyAdditiveGauge', () => {
    it('computes x_eff = x_base + Δ', () => {
      const base = new Float32Array([1, 2, 3, 4, 5]);
      const gauge = new Float32Array([0.1, 0.2, -0.3, 0, 1]);
      const output = new Float32Array(5);

      applyAdditiveGauge(base, gauge, output, 5);

      expect(output[0]).toBeCloseTo(1.1);
      expect(output[1]).toBeCloseTo(2.2);
      expect(output[2]).toBeCloseTo(2.7);
      expect(output[3]).toBeCloseTo(4.0);
      expect(output[4]).toBeCloseTo(6.0);
    });

    it('supports in-place operation (output === base)', () => {
      const buffer = new Float32Array([1, 2, 3]);
      const gauge = new Float32Array([0.5, -0.5, 0]);

      applyAdditiveGauge(buffer, gauge, buffer, 3);

      expect(buffer[0]).toBeCloseTo(1.5);
      expect(buffer[1]).toBeCloseTo(1.5);
      expect(buffer[2]).toBeCloseTo(3.0);
    });

    it('handles zero gauge (passthrough)', () => {
      const base = new Float32Array([10, 20, 30]);
      const gauge = new Float32Array([0, 0, 0]);
      const output = new Float32Array(3);

      applyAdditiveGauge(base, gauge, output, 3);

      expect(output[0]).toBe(10);
      expect(output[1]).toBe(20);
      expect(output[2]).toBe(30);
    });

    it('handles empty arrays', () => {
      const base = new Float32Array(0);
      const gauge = new Float32Array(0);
      const output = new Float32Array(0);

      // Should not throw
      applyAdditiveGauge(base, gauge, output, 0);
      expect(output.length).toBe(0);
    });
  });

  describe('initializeGaugeOnDomainChange', () => {
    it('fills with zeros when no previous state', () => {
      const newBase = new Float32Array([1, 2, 3]);
      const gaugeBuffer = new Float32Array(3);

      initializeGaugeOnDomainChange(null, newBase, gaugeBuffer, null, 3);

      expect(gaugeBuffer[0]).toBe(0);
      expect(gaugeBuffer[1]).toBe(0);
      expect(gaugeBuffer[2]).toBe(0);
    });

    it('fills with zeros when no mapping', () => {
      const oldEffective = new Float32Array([5, 6, 7]);
      const newBase = new Float32Array([1, 2, 3]);
      const gaugeBuffer = new Float32Array(3);

      initializeGaugeOnDomainChange(oldEffective, newBase, gaugeBuffer, null, 3);

      expect(gaugeBuffer[0]).toBe(0);
      expect(gaugeBuffer[1]).toBe(0);
      expect(gaugeBuffer[2]).toBe(0);
    });

    it('preserves effective values with identity mapping', () => {
      // Old effective = [5, 10, 15]
      // New base = [1, 2, 3]
      // Gauge should be [4, 8, 12] so that base + gauge = effective
      const oldEffective = new Float32Array([5, 10, 15]);
      const newBase = new Float32Array([1, 2, 3]);
      const gaugeBuffer = new Float32Array(3);
      const mapping: MappingState = { kind: 'identity', count: 3 };

      initializeGaugeOnDomainChange(oldEffective, newBase, gaugeBuffer, mapping, 3);

      expect(gaugeBuffer[0]).toBeCloseTo(4);
      expect(gaugeBuffer[1]).toBeCloseTo(8);
      expect(gaugeBuffer[2]).toBeCloseTo(12);

      // Verify: base + gauge = oldEffective (continuity preserved)
      expect(newBase[0] + gaugeBuffer[0]).toBeCloseTo(oldEffective[0]);
      expect(newBase[1] + gaugeBuffer[1]).toBeCloseTo(oldEffective[1]);
      expect(newBase[2] + gaugeBuffer[2]).toBeCloseTo(oldEffective[2]);
    });

    it('handles mapped elements with byId mapping', () => {
      // Old: 3 elements with effective values [100, 200, 300]
      // New: 4 elements, first 3 map to old 0,1,2, element 3 is new
      const oldEffective = new Float32Array([100, 200, 300]);
      const newBase = new Float32Array([10, 20, 30, 40]);
      const gaugeBuffer = new Float32Array(4);
      const mapping: MappingState = {
        kind: 'byId',
        newToOld: new Int32Array([0, 1, 2, -1]),
      };

      initializeGaugeOnDomainChange(oldEffective, newBase, gaugeBuffer, mapping, 4);

      // Mapped elements: gauge = oldEffective - newBase
      expect(gaugeBuffer[0]).toBeCloseTo(90); // 100 - 10
      expect(gaugeBuffer[1]).toBeCloseTo(180); // 200 - 20
      expect(gaugeBuffer[2]).toBeCloseTo(270); // 300 - 30
      // New element: gauge = 0 (starts at base)
      expect(gaugeBuffer[3]).toBe(0);
    });

    it('handles byPosition mapping', () => {
      const oldEffective = new Float32Array([50, 60]);
      const newBase = new Float32Array([5, 6, 7]);
      const gaugeBuffer = new Float32Array(3);
      const mapping: MappingState = {
        kind: 'byPosition',
        newToOld: new Int32Array([1, 0, -1]), // Swapped positions
      };

      initializeGaugeOnDomainChange(oldEffective, newBase, gaugeBuffer, mapping, 3);

      // new[0] maps to old[1], new[1] maps to old[0]
      expect(gaugeBuffer[0]).toBeCloseTo(60 - 5); // oldEffective[1] - newBase[0]
      expect(gaugeBuffer[1]).toBeCloseTo(50 - 6); // oldEffective[0] - newBase[1]
      expect(gaugeBuffer[2]).toBe(0); // Unmapped
    });
  });

  describe('applySlewFilter', () => {
    it('moves toward target over time', () => {
      const target = new Float32Array([10, 20, 30]);
      const slew = new Float32Array([0, 0, 0]);
      const output = new Float32Array(3);

      // Apply with τ=100ms, dt=100ms
      // α = 1 - e^(-1) ≈ 0.632
      applySlewFilter(target, slew, output, 100, 100, 3);

      // After one τ, should be ~63.2% of the way
      expect(output[0]).toBeCloseTo(10 * 0.6321, 1);
      expect(output[1]).toBeCloseTo(20 * 0.6321, 1);
      expect(output[2]).toBeCloseTo(30 * 0.6321, 1);
    });

    it('reaches target after many time constants', () => {
      const target = new Float32Array([100]);
      const slew = new Float32Array([0]);
      const output = new Float32Array(1);

      // Apply with τ=10ms, dt=100ms (10 time constants)
      // α = 1 - e^(-10) ≈ 0.99995
      applySlewFilter(target, slew, output, 10, 100, 1);

      expect(output[0]).toBeCloseTo(100, 2); // Essentially at target
    });

    it('stays at target when already there', () => {
      const target = new Float32Array([5, 10, 15]);
      const slew = new Float32Array([5, 10, 15]);
      const output = new Float32Array(3);

      applySlewFilter(target, slew, output, 100, 16, 3);

      expect(output[0]).toBeCloseTo(5);
      expect(output[1]).toBeCloseTo(10);
      expect(output[2]).toBeCloseTo(15);
    });

    it('updates slew buffer in place', () => {
      const target = new Float32Array([10]);
      const slew = new Float32Array([0]);
      const output = new Float32Array(1);

      applySlewFilter(target, slew, output, 100, 50, 1);

      // Slew buffer should be updated
      expect(slew[0]).toBe(output[0]);
      expect(slew[0]).toBeGreaterThan(0);
      expect(slew[0]).toBeLessThan(10);
    });

    it('handles zero dt (no change)', () => {
      const target = new Float32Array([100]);
      const slew = new Float32Array([50]);
      const output = new Float32Array(1);

      applySlewFilter(target, slew, output, 100, 0, 1);

      // With dt=0, α=0, so no change
      expect(output[0]).toBe(50);
    });

    it('frame-rate independent (same result for different dt subdivisions)', () => {
      // Test: 2 frames of 50ms vs 1 frame of 100ms should give same result
      const target = new Float32Array([100]);
      const slew1 = new Float32Array([0]);
      const slew2 = new Float32Array([0]);
      const output1 = new Float32Array(1);
      const output2 = new Float32Array(1);

      // One 100ms step
      applySlewFilter(target, slew1, output1, 100, 100, 1);

      // Two 50ms steps
      applySlewFilter(target, slew2, output2, 100, 50, 1);
      applySlewFilter(target, slew2, output2, 100, 50, 1);

      expect(output1[0]).toBeCloseTo(output2[0], 4);
    });
  });

  describe('initializeSlewBuffer', () => {
    it('copies current values to slew buffer', () => {
      const current = new Float32Array([1, 2, 3, 4, 5]);
      const slew = new Float32Array(5);

      initializeSlewBuffer(current, slew, 5);

      expect(slew[0]).toBe(1);
      expect(slew[1]).toBe(2);
      expect(slew[2]).toBe(3);
      expect(slew[3]).toBe(4);
      expect(slew[4]).toBe(5);
    });

    it('handles empty arrays', () => {
      const current = new Float32Array(0);
      const slew = new Float32Array(0);

      // Should not throw
      initializeSlewBuffer(current, slew, 0);
    });
  });

  describe('initializeSlewWithMapping', () => {
    it('initializes from base when no previous slew state', () => {
      const newBase = new Float32Array([10, 20, 30]);
      const slewBuffer = new Float32Array(3);

      initializeSlewWithMapping(null, newBase, slewBuffer, null, 3);

      expect(slewBuffer[0]).toBe(10);
      expect(slewBuffer[1]).toBe(20);
      expect(slewBuffer[2]).toBe(30);
    });

    it('transfers slew state with identity mapping', () => {
      const oldSlew = new Float32Array([5, 10, 15]);
      const newBase = new Float32Array([1, 2, 3]);
      const slewBuffer = new Float32Array(3);
      const mapping: MappingState = { kind: 'identity', count: 3 };

      initializeSlewWithMapping(oldSlew, newBase, slewBuffer, mapping, 3);

      expect(slewBuffer[0]).toBe(5);
      expect(slewBuffer[1]).toBe(10);
      expect(slewBuffer[2]).toBe(15);
    });

    it('transfers slew state with byId mapping', () => {
      const oldSlew = new Float32Array([100, 200]);
      const newBase = new Float32Array([1, 2, 3]);
      const slewBuffer = new Float32Array(3);
      const mapping: MappingState = {
        kind: 'byId',
        newToOld: new Int32Array([1, 0, -1]),
      };

      initializeSlewWithMapping(oldSlew, newBase, slewBuffer, mapping, 3);

      // new[0] from old[1], new[1] from old[0], new[2] unmapped
      expect(slewBuffer[0]).toBe(200);
      expect(slewBuffer[1]).toBe(100);
      expect(slewBuffer[2]).toBe(3); // Falls back to newBase
    });

    it('handles growing domain (new elements start at base)', () => {
      const oldSlew = new Float32Array([50, 60]);
      const newBase = new Float32Array([1, 2, 3, 4]);
      const slewBuffer = new Float32Array(4);
      const mapping: MappingState = {
        kind: 'byId',
        newToOld: new Int32Array([0, 1, -1, -1]),
      };

      initializeSlewWithMapping(oldSlew, newBase, slewBuffer, mapping, 4);

      expect(slewBuffer[0]).toBe(50);
      expect(slewBuffer[1]).toBe(60);
      expect(slewBuffer[2]).toBe(3);
      expect(slewBuffer[3]).toBe(4);
    });
  });

  describe('mathematical guarantees', () => {
    it('gauge preserves effective value: x_eff_old === x_eff_new', () => {
      // This is the core continuity guarantee (spec §2.5)
      const oldEffective = new Float32Array([100, 200, 300]);
      const newBase = new Float32Array([50, 150, 250]);
      const gaugeBuffer = new Float32Array(3);
      const mapping: MappingState = { kind: 'identity', count: 3 };

      // Initialize gauge on domain change
      initializeGaugeOnDomainChange(oldEffective, newBase, gaugeBuffer, mapping, 3);

      // Apply gauge to get effective
      const newEffective = new Float32Array(3);
      applyAdditiveGauge(newBase, gaugeBuffer, newEffective, 3);

      // x_eff_new should equal x_eff_old (continuity preserved)
      for (let i = 0; i < 3; i++) {
        expect(newEffective[i]).toBeCloseTo(oldEffective[i]);
      }
    });

    it('slew decays exponentially: y(t) = y_0 * e^(-t/τ) + target * (1 - e^(-t/τ))', () => {
      // This verifies the exponential decay formula (spec §4.1)
      const target = new Float32Array([100]);
      const y0 = 0;
      const tau = 100;
      const dt = 200; // 2 time constants

      const slew = new Float32Array([y0]);
      const output = new Float32Array(1);

      applySlewFilter(target, slew, output, tau, dt, 1);

      // Expected: y(2τ) = target * (1 - e^(-2)) = 100 * (1 - 0.1353) ≈ 86.47
      const expected = 100 * (1 - Math.exp(-2));
      expect(output[0]).toBeCloseTo(expected, 2);
    });

    it('slew from non-zero starting point', () => {
      const target = new Float32Array([100]);
      const y0 = 50;
      const tau = 100;
      const dt = 100; // 1 time constant

      const slew = new Float32Array([y0]);
      const output = new Float32Array(1);

      applySlewFilter(target, slew, output, tau, dt, 1);

      // y(τ) = y0 + α * (target - y0)
      // α = 1 - e^(-1) ≈ 0.632
      // y(τ) = 50 + 0.632 * (100 - 50) = 50 + 31.6 ≈ 81.6
      const alpha = 1 - Math.exp(-1);
      const expected = y0 + alpha * (100 - y0);
      expect(output[0]).toBeCloseTo(expected, 2);
    });
  });
});
