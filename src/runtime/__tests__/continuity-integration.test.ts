/**
 * Integration tests for Continuity System
 *
 * Tests the complete continuity pipeline:
 * 1. Domain identity generation (DomainIdentity)
 * 2. Domain change detection and mapping (ContinuityMapping)
 * 3. State management (ContinuityState)
 * 4. Gauge and slew application (ContinuityApply)
 *
 * Per spec topics/11-continuity-system.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createStableDomainInstance,
  createUnstableDomainInstance,
  extendElementIds,
} from '../DomainIdentity';
import {
  buildMappingById,
  buildMappingByPosition,
  detectDomainChange,
} from '../ContinuityMapping';
import {
  createContinuityState,
  getOrCreateTargetState,
  computeStableTargetId,
} from '../ContinuityState';
import {
  applyAdditiveGauge,
  initializeGaugeOnDomainChange,
  applySlewFilter,
  initializeSlewWithMapping,
  finalizeContinuityFrame,
  applyContinuity,
  smoothstep,
  lerp,
} from '../ContinuityApply';
import { createRuntimeState } from '../RuntimeState';
import type { DomainInstance } from '../../compiler/ir/types';
import type { ContinuityState, MappingState } from '../ContinuityState';

describe('Continuity Integration', () => {
  describe('Scenario: Count change 10→11 with stable identity', () => {
    it('preserves effective values for elements 0-9, new element 10 starts at base', () => {
      // Phase 1: Initial state with 10 elements
      const domain10 = createStableDomainInstance(10);
      expect(domain10.count).toBe(10);
      expect(domain10.identityMode).toBe('stable');
      expect(domain10.elementId.length).toBe(10);

      // Simulate some effective values after continuity has been running
      const effectiveValues10 = new Float32Array([
        100, 110, 120, 130, 140, 150, 160, 170, 180, 190,
      ]);

      // Phase 2: Domain changes to 11 elements
      const domain11 = createStableDomainInstance(11);
      expect(domain11.count).toBe(11);
      expect(domain11.elementId[10]).toBe(10); // New element gets ID 10

      // Build mapping
      const mapping = buildMappingById(domain10, domain11);
      expect(mapping.kind).toBe('byId');

      if (mapping.kind === 'byId') {
        // Elements 0-9 map to themselves
        for (let i = 0; i < 10; i++) {
          expect(mapping.newToOld[i]).toBe(i);
        }
        // Element 10 is new (unmapped)
        expect(mapping.newToOld[10]).toBe(-1);
      }

      // New base values (would come from recalculation)
      const newBase11 = new Float32Array([
        10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
      ]);

      // Initialize gauge to preserve effective values
      const gaugeBuffer = new Float32Array(11);
      initializeGaugeOnDomainChange(effectiveValues10, newBase11, gaugeBuffer, mapping, 11);

      // Apply gauge to get effective values
      const newEffective11 = new Float32Array(11);
      applyAdditiveGauge(newBase11, gaugeBuffer, newEffective11, 11);

      // Verify continuity: elements 0-9 should have same effective value
      for (let i = 0; i < 10; i++) {
        expect(newEffective11[i]).toBeCloseTo(effectiveValues10[i]);
      }

      // New element 10 should start at its base value (no jump)
      expect(newEffective11[10]).toBe(newBase11[10]);
    });
  });

  describe('Scenario: Count change 11→10 with stable identity', () => {
    it('preserves effective values for elements 0-9, element 10 is removed', () => {
      // Initial state with 11 elements
      const domain11 = createStableDomainInstance(11);
      const effectiveValues11 = new Float32Array([
        100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200,
      ]);

      // Domain shrinks to 10 elements
      const domain10 = createStableDomainInstance(10);

      // Build mapping
      const mapping = buildMappingById(domain11, domain10);
      expect(mapping.kind).toBe('byId');

      if (mapping.kind === 'byId') {
        // All 10 elements map to themselves
        for (let i = 0; i < 10; i++) {
          expect(mapping.newToOld[i]).toBe(i);
        }
      }

      // New base values
      const newBase10 = new Float32Array([5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);

      // Initialize gauge
      const gaugeBuffer = new Float32Array(10);
      initializeGaugeOnDomainChange(effectiveValues11, newBase10, gaugeBuffer, mapping, 10);

      // Apply gauge
      const newEffective10 = new Float32Array(10);
      applyAdditiveGauge(newBase10, gaugeBuffer, newEffective10, 10);

      // All 10 elements should preserve their effective values
      for (let i = 0; i < 10; i++) {
        expect(newEffective10[i]).toBeCloseTo(effectiveValues11[i]);
      }
    });
  });

  describe('Scenario: Slew filter smooths value transitions', () => {
    it('gradually approaches target over multiple frames', () => {
      const target = new Float32Array([100]);
      const slewBuffer = new Float32Array([0]); // Start at 0
      const output = new Float32Array(1);
      const tauMs = 100; // 100ms time constant

      // Simulate 10 frames at 16ms each (≈ 60fps)
      const dtMs = 16;
      const values: number[] = [];

      for (let frame = 0; frame < 10; frame++) {
        applySlewFilter(target, slewBuffer, output, tauMs, dtMs, 1);
        values.push(output[0]);
      }

      // Should monotonically increase
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThan(values[i - 1]);
      }

      // After 160ms (1.6 time constants), should be ~80% of the way
      // e^(-1.6) ≈ 0.202, so should be ~79.8
      expect(values[9]).toBeGreaterThan(70);
      expect(values[9]).toBeLessThan(90);
    });

    it('handles instant target changes smoothly', () => {
      const target = new Float32Array([100]);
      const slewBuffer = new Float32Array([50]);
      const output = new Float32Array(1);
      const tauMs = 50;
      const dtMs = 16;

      // Slew toward 100
      applySlewFilter(target, slewBuffer, output, tauMs, dtMs, 1);
      const val1 = output[0];
      expect(val1).toBeGreaterThan(50);

      // Instant target change to 0
      target[0] = 0;
      applySlewFilter(target, slewBuffer, output, tauMs, dtMs, 1);
      const val2 = output[0];

      // Should still be smoothly transitioning (not instant)
      expect(val2).toBeLessThan(val1);
      expect(val2).toBeGreaterThan(0);
    });
  });

  describe('Scenario: RuntimeState integration', () => {
    it('creates runtime state with continuity', () => {
      const state = createRuntimeState(100);

      expect(state.continuity).toBeDefined();
      expect(state.continuity.targets.size).toBe(0);
      expect(state.continuity.mappings.size).toBe(0);
      expect(state.continuity.domainChangeThisFrame).toBe(false);
    });

    it('manages target state correctly', () => {
      const state = createRuntimeState(100);
      const targetId = computeStableTargetId('position', 'instance_0', 'x');

      // Get or create target state
      const targetState = getOrCreateTargetState(state.continuity, targetId, 10);

      expect(targetState.count).toBe(10);
      expect(targetState.gaugeBuffer.length).toBe(10);
      expect(targetState.slewBuffer.length).toBe(10);

      // Same target ID returns same state
      const targetState2 = getOrCreateTargetState(state.continuity, targetId, 10);
      expect(targetState2).toBe(targetState);
    });

    it('finalizes frame correctly', () => {
      const state = createRuntimeState(100);
      state.time = { 
        tAbsMs: 100, 
        tMs: 100, 
        dt: 16, 
        phaseA: 0, 
        phaseB: 0, 
        pulse: 0,
        palette: { r: 0.5, g: 0, b: 0, a: 1.0 },
        energy: 0.5,
      };
      state.continuity.domainChangeThisFrame = true;

      finalizeContinuityFrame(state);

      expect(state.continuity.lastTModelMs).toBe(100);
      expect(state.continuity.domainChangeThisFrame).toBe(false);
    });
  });

  describe('Scenario: Domain change detection', () => {
    let prevDomains: Map<string, DomainInstance>;

    beforeEach(() => {
      prevDomains = new Map();
    });

    it('detects new domain (first appearance)', () => {
      const domain = createStableDomainInstance(10);
      const result = detectDomainChange('inst1', domain, prevDomains);

      expect(result.changed).toBe(true);
      expect(result.mapping).toBeNull(); // No previous to map from
    });

    it('detects no change for identical domain', () => {
      const domain = createStableDomainInstance(10);
      prevDomains.set('inst1', domain);

      const result = detectDomainChange('inst1', domain, prevDomains);

      expect(result.changed).toBe(false);
      expect(result.mapping?.kind).toBe('identity');
    });

    it('detects count change and provides mapping', () => {
      const old = createStableDomainInstance(10);
      prevDomains.set('inst1', old);

      const new_ = createStableDomainInstance(15);
      const result = detectDomainChange('inst1', new_, prevDomains);

      expect(result.changed).toBe(true);
      expect(result.mapping?.kind).toBe('byId');
    });
  });

  describe('Scenario: Position-based mapping fallback', () => {
    it('maps elements by nearest position when no stable IDs', () => {
      // Old domain: 2 elements at (0,0) and (1,1)
      const oldPosHints = new Float32Array([0, 0, 1, 1]);
      const oldDomain: DomainInstance = {
        count: 2,
        elementId: new Uint32Array(0),
        identityMode: 'none',
        posHintXY: oldPosHints,
      };

      // New domain: 2 elements at slightly different positions
      const newPosHints = new Float32Array([0.05, 0.05, 0.95, 0.95]);
      const newDomain: DomainInstance = {
        count: 2,
        elementId: new Uint32Array(0),
        identityMode: 'none',
        posHintXY: newPosHints,
      };

      const mapping = buildMappingByPosition(oldDomain, newDomain, 0.2);

      expect(mapping.kind).toBe('byPosition');
      if (mapping.kind === 'byPosition') {
        expect(mapping.newToOld[0]).toBe(0); // (0.05,0.05) → (0,0)
        expect(mapping.newToOld[1]).toBe(1); // (0.95,0.95) → (1,1)
      }
    });
  });

  describe('Scenario: Complete gauge+slew pipeline (project policy)', () => {
    it('applies project policy: gauge then slew', () => {
      // Initial effective position
      const oldEffective = new Float32Array([100, 200]);

      // Domain change: same count, different base values
      const newBase = new Float32Array([50, 150]);
      const mapping: MappingState = { kind: 'identity', count: 2 };

      // Initialize gauge to preserve effective values
      const gaugeBuffer = new Float32Array(2);
      initializeGaugeOnDomainChange(oldEffective, newBase, gaugeBuffer, mapping, 2);

      // gaugeBuffer should be [50, 50] so that 50+50=100, 150+50=200
      expect(gaugeBuffer[0]).toBeCloseTo(50);
      expect(gaugeBuffer[1]).toBeCloseTo(50);

      // Initialize slew buffer with current effective values
      const slewBuffer = new Float32Array(2);
      const currentEffective = new Float32Array(2);
      applyAdditiveGauge(newBase, gaugeBuffer, currentEffective, 2);
      initializeSlewWithMapping(slewBuffer, currentEffective, slewBuffer, null, 2);

      // Now slew has been initialized to [100, 200]

      // Apply slew filter (simulating a few frames)
      // First, apply gauge to get gauged values
      const gaugedValues = new Float32Array(2);
      applyAdditiveGauge(newBase, gaugeBuffer, gaugedValues, 2);

      // Then slew toward gauged values (should already be there if just initialized)
      slewBuffer.set(gaugedValues);
      const output = new Float32Array(2);
      applySlewFilter(gaugedValues, slewBuffer, output, 120, 16, 2);

      // Output should be the effective values (100, 200)
      expect(output[0]).toBeCloseTo(100, 0);
      expect(output[1]).toBeCloseTo(200, 0);
    });
  });

  describe('Scenario: Stable target ID computation', () => {
    it('produces consistent IDs across recompiles', () => {
      // Same inputs should always produce same ID
      const id1 = computeStableTargetId('position', 'instance_0', 'x');
      const id2 = computeStableTargetId('position', 'instance_0', 'x');
      expect(id1).toBe(id2);

      // Different inputs produce different IDs
      const id3 = computeStableTargetId('position', 'instance_0', 'y');
      expect(id1).not.toBe(id3);

      const id4 = computeStableTargetId('opacity', 'instance_0', 'x');
      expect(id1).not.toBe(id4);
    });
  });

  describe('Scenario: Extend element IDs (growing domain)', () => {
    it('preserves existing IDs when extending', () => {
      const existing = new Uint32Array([0, 1, 2, 3, 4]);
      const extended = extendElementIds(existing, 8);

      // First 5 should be unchanged
      expect(extended[0]).toBe(0);
      expect(extended[1]).toBe(1);
      expect(extended[2]).toBe(2);
      expect(extended[3]).toBe(3);
      expect(extended[4]).toBe(4);

      // New elements get sequential IDs
      expect(extended[5]).toBe(5);
      expect(extended[6]).toBe(6);
      expect(extended[7]).toBe(7);
    });
  });

  describe('Scenario: Crossfade policy (spec §3.7)', () => {
    it('blends old and new buffers linearly over time window', () => {
      // Setup: Create runtime state with continuity
      const continuity = createContinuityState();
      const state = {
        time: { tMs: 0 },
        continuity,
        values: { objects: new Map() },
      } as any;

      // Create target state
      const targetState = getOrCreateTargetState(continuity, 'custom:inst:x' as any, 3);

      // Simulate old effective values in slew buffer
      targetState.slewBuffer.set([10, 20, 30]);

      // New base values (what we're transitioning to)
      const baseBuffer = new Float32Array([100, 200, 300]);
      const outputBuffer = new Float32Array(3);

      // Store in mock slot
      state.values.objects.set(0, baseBuffer);
      state.values.objects.set(1, outputBuffer);

      // Trigger domain change
      continuity.domainChangeThisFrame = true;

      // Create crossfade step
      const step = {
        kind: 'continuityApply',
        targetKey: 'custom:inst:x',
        instanceId: 'inst',
        policy: { kind: 'crossfade', windowMs: 100, curve: 'linear' },
        baseSlot: 0,
        outputSlot: 1,
        semantic: 'custom',
      } as any;

      // First frame: domain change triggers crossfade start
      applyContinuity(step, state, (slot: any) => state.values.objects.get(slot));

      // At t=0, w=0, output should be old values
      expect(outputBuffer[0]).toBeCloseTo(10, 2);
      expect(outputBuffer[1]).toBeCloseTo(20, 2);
      expect(outputBuffer[2]).toBeCloseTo(30, 2);

      // Clear domain change flag
      continuity.domainChangeThisFrame = false;

      // Advance time to 50ms (halfway through 100ms window)
      state.time.tMs = 50;
      applyContinuity(step, state, (slot: any) => state.values.objects.get(slot));

      // At t=50ms, w=0.5 (linear), output should be midpoint
      expect(outputBuffer[0]).toBeCloseTo(55, 2); // lerp(10, 100, 0.5)
      expect(outputBuffer[1]).toBeCloseTo(110, 2); // lerp(20, 200, 0.5)
      expect(outputBuffer[2]).toBeCloseTo(165, 2); // lerp(30, 300, 0.5)

      // Advance time to 100ms (end of window)
      state.time.tMs = 100;
      applyContinuity(step, state, (slot: any) => state.values.objects.get(slot));

      // At t=100ms, w=1.0, output should be new base values
      expect(outputBuffer[0]).toBeCloseTo(100, 2);
      expect(outputBuffer[1]).toBeCloseTo(200, 2);
      expect(outputBuffer[2]).toBeCloseTo(300, 2);
    });

    it('uses smoothstep curve when specified', () => {
      const continuity = createContinuityState();
      const state = {
        time: { tMs: 0 },
        continuity,
        values: { objects: new Map() },
      } as any;

      const targetState = getOrCreateTargetState(continuity, 'custom:inst:y' as any, 1);
      targetState.slewBuffer.set([0]);

      const baseBuffer = new Float32Array([100]);
      const outputBuffer = new Float32Array(1);
      state.values.objects.set(0, baseBuffer);
      state.values.objects.set(1, outputBuffer);

      continuity.domainChangeThisFrame = true;

      const step = {
        kind: 'continuityApply',
        targetKey: 'custom:inst:y',
        instanceId: 'inst',
        policy: { kind: 'crossfade', windowMs: 100, curve: 'smoothstep' },
        baseSlot: 0,
        outputSlot: 1,
        semantic: 'custom',
      } as any;

      // First frame at t=0 - triggers crossfade start
      applyContinuity(step, state, (slot: any) => state.values.objects.get(slot));
      // At t=0, w=0, output = old value = 0
      expect(outputBuffer[0]).toBeCloseTo(0, 2);

      continuity.domainChangeThisFrame = false;

      // At t=50ms, smoothstep(0.5) = 0.5
      state.time.tMs = 50;
      applyContinuity(step, state, (slot: any) => state.values.objects.get(slot));

      // smoothstep(0.5) = 0.5, so output = lerp(0, 100, 0.5) = 50
      expect(outputBuffer[0]).toBeCloseTo(50, 2);

      // At t=25ms from start, smoothstep(0.25) = 0.15625
      state.time.tMs = 25;
      applyContinuity(step, state, (slot: any) => state.values.objects.get(slot));
      // lerp(0, 100, 0.15625) = 15.625
      expect(outputBuffer[0]).toBeCloseTo(15.625, 2);

      // At t=75ms from start, smoothstep(0.75) = 0.84375
      state.time.tMs = 75;
      applyContinuity(step, state, (slot: any) => state.values.objects.get(slot));
      // lerp(0, 100, 0.84375) = 84.375
      expect(outputBuffer[0]).toBeCloseTo(84.375, 2);
    });

    it('handles crossfade when no previous state exists', () => {
      const continuity = createContinuityState();
      const state = {
        time: { tMs: 0 },
        continuity,
        values: { objects: new Map() },
      } as any;

      // No previous target state - first time seeing this target
      const baseBuffer = new Float32Array([100, 200, 300]);
      const outputBuffer = new Float32Array(3);
      state.values.objects.set(0, baseBuffer);
      state.values.objects.set(1, outputBuffer);

      continuity.domainChangeThisFrame = true;

      const step = {
        kind: 'continuityApply',
        targetKey: 'custom:new:z',
        instanceId: 'new',
        policy: { kind: 'crossfade', windowMs: 100, curve: 'linear' },
        baseSlot: 0,
        outputSlot: 1,
        semantic: 'custom',
      } as any;

      // First frame - no old buffer means instant transition to base
      applyContinuity(step, state, (slot: any) => state.values.objects.get(slot));

      // With no previous state, crossfade old buffer is initialized from base
      // So at t=0, w=0, output = lerp(base, base, 0) = base
      expect(outputBuffer[0]).toBeCloseTo(100, 2);
      expect(outputBuffer[1]).toBeCloseTo(200, 2);
      expect(outputBuffer[2]).toBeCloseTo(300, 2);
    });
  });
});
