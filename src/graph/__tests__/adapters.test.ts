/**
 * Adapter Registry Tests
 *
 * Verifies that findAdapter() correctly identifies type conversion adapters
 * per spec §B4.1, and rejects disallowed conversions per §B4.2.
 */

import { describe, it, expect } from 'vitest';
import { findAdapter, needsAdapter, extractSignature } from '../adapters';
import {
  signalType,
  unitPhase01,
  unitScalar,
  unitRadians,
  unitDegrees,
  unitNorm01,
  unitMs,
  unitSeconds,
} from '../../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION } from '../../core/canonical-types';

// Ensure adapter blocks are registered
import '../../blocks/adapter-blocks';

describe('Adapter Registry', () => {
  describe('findAdapter - unit conversion adapters (§B4.1)', () => {
    it('Phase → Scalar: returns Adapter_PhaseToScalar01', () => {
      const from = signalType(FLOAT, unitPhase01());
      const to = signalType(FLOAT, unitScalar());
      const adapter = findAdapter(from, to);
      expect(adapter).not.toBeNull();
      expect(adapter!.blockType).toBe('Adapter_PhaseToScalar01');
    });

    it('Scalar → Phase: returns Adapter_ScalarToPhase01', () => {
      const from = signalType(FLOAT, unitScalar());
      const to = signalType(FLOAT, unitPhase01());
      const adapter = findAdapter(from, to);
      expect(adapter).not.toBeNull();
      expect(adapter!.blockType).toBe('Adapter_ScalarToPhase01');
    });

    it('Phase → Radians: returns Adapter_PhaseToRadians', () => {
      const from = signalType(FLOAT, unitPhase01());
      const to = signalType(FLOAT, unitRadians());
      const adapter = findAdapter(from, to);
      expect(adapter).not.toBeNull();
      expect(adapter!.blockType).toBe('Adapter_PhaseToRadians');
    });

    it('Radians → Phase: returns Adapter_RadiansToPhase01', () => {
      const from = signalType(FLOAT, unitRadians());
      const to = signalType(FLOAT, unitPhase01());
      const adapter = findAdapter(from, to);
      expect(adapter).not.toBeNull();
      expect(adapter!.blockType).toBe('Adapter_RadiansToPhase01');
    });

    it('Degrees → Radians: returns Adapter_DegreesToRadians', () => {
      const from = signalType(FLOAT, unitDegrees());
      const to = signalType(FLOAT, unitRadians());
      const adapter = findAdapter(from, to);
      expect(adapter).not.toBeNull();
      expect(adapter!.blockType).toBe('Adapter_DegreesToRadians');
    });

    it('Radians → Degrees: returns Adapter_RadiansToDegrees', () => {
      const from = signalType(FLOAT, unitRadians());
      const to = signalType(FLOAT, unitDegrees());
      const adapter = findAdapter(from, to);
      expect(adapter).not.toBeNull();
      expect(adapter!.blockType).toBe('Adapter_RadiansToDegrees');
    });

    it('Ms → Seconds: returns Adapter_MsToSeconds', () => {
      const from = signalType(INT, unitMs());
      const to = signalType(FLOAT, unitSeconds());
      const adapter = findAdapter(from, to);
      expect(adapter).not.toBeNull();
      expect(adapter!.blockType).toBe('Adapter_MsToSeconds');
    });

    it('Seconds → Ms: returns Adapter_SecondsToMs', () => {
      const from = signalType(FLOAT, unitSeconds());
      const to = signalType(INT, unitMs());
      const adapter = findAdapter(from, to);
      expect(adapter).not.toBeNull();
      expect(adapter!.blockType).toBe('Adapter_SecondsToMs');
    });

    it('Scalar → Norm01: returns Adapter_ScalarToNorm01Clamp', () => {
      const from = signalType(FLOAT, unitScalar());
      const to = signalType(FLOAT, unitNorm01());
      const adapter = findAdapter(from, to);
      expect(adapter).not.toBeNull();
      expect(adapter!.blockType).toBe('Adapter_ScalarToNorm01Clamp');
    });

    it('Norm01 → Scalar: returns Adapter_Norm01ToScalar', () => {
      const from = signalType(FLOAT, unitNorm01());
      const to = signalType(FLOAT, unitScalar());
      const adapter = findAdapter(from, to);
      expect(adapter).not.toBeNull();
      expect(adapter!.blockType).toBe('Adapter_Norm01ToScalar');
    });
  });

  describe('findAdapter - compatible types (no adapter needed)', () => {
    it('returns null when types are identical (phase01 → phase01)', () => {
      const from = signalType(FLOAT, unitPhase01());
      const to = signalType(FLOAT, unitPhase01());
      expect(findAdapter(from, to)).toBeNull();
    });

    it('returns null when types are identical (scalar → scalar)', () => {
      const from = signalType(FLOAT, unitScalar());
      const to = signalType(FLOAT, unitScalar());
      expect(findAdapter(from, to)).toBeNull();
    });

    it('returns null when types are identical (radians → radians)', () => {
      const from = signalType(FLOAT, unitRadians());
      const to = signalType(FLOAT, unitRadians());
      expect(findAdapter(from, to)).toBeNull();
    });
  });

  describe('findAdapter - disallowed conversions (§B4.2)', () => {
    it('returns null for Phase01 → Norm01 (semantic ambiguity)', () => {
      const from = signalType(FLOAT, unitPhase01());
      const to = signalType(FLOAT, unitNorm01());
      // Spec explicitly disallows this — must go phase01→scalar→norm01
      expect(findAdapter(from, to)).toBeNull();
    });

    it('returns null for Norm01 → Phase01 (no direct path)', () => {
      const from = signalType(FLOAT, unitNorm01());
      const to = signalType(FLOAT, unitPhase01());
      expect(findAdapter(from, to)).toBeNull();
    });

    it('returns null for Degrees → Phase01 (no direct adapter)', () => {
      const from = signalType(FLOAT, unitDegrees());
      const to = signalType(FLOAT, unitPhase01());
      // Must go degrees→radians→phase01 (two-hop)
      expect(findAdapter(from, to)).toBeNull();
    });

    it('returns null for incompatible payload types without adapter', () => {
      const from = signalType(FLOAT, unitScalar());
      const to = signalType(INT, unitScalar());
      // No float→int adapter for scalar (only seconds→ms has payload change)
      expect(findAdapter(from, to)).toBeNull();
    });
  });

  describe('findAdapter - adapter port IDs', () => {
    it('all adapters use standard in/out port naming', () => {
      const conversions = [
        { from: signalType(FLOAT, unitPhase01()), to: signalType(FLOAT, unitScalar()) },
        { from: signalType(FLOAT, unitScalar()), to: signalType(FLOAT, unitPhase01()) },
        { from: signalType(FLOAT, unitPhase01()), to: signalType(FLOAT, unitRadians()) },
        { from: signalType(FLOAT, unitRadians()), to: signalType(FLOAT, unitPhase01()) },
        { from: signalType(FLOAT, unitDegrees()), to: signalType(FLOAT, unitRadians()) },
        { from: signalType(FLOAT, unitRadians()), to: signalType(FLOAT, unitDegrees()) },
        { from: signalType(INT, unitMs()), to: signalType(FLOAT, unitSeconds()) },
        { from: signalType(FLOAT, unitSeconds()), to: signalType(INT, unitMs()) },
        { from: signalType(FLOAT, unitScalar()), to: signalType(FLOAT, unitNorm01()) },
        { from: signalType(FLOAT, unitNorm01()), to: signalType(FLOAT, unitScalar()) },
      ];

      for (const { from, to } of conversions) {
        const adapter = findAdapter(from, to);
        expect(adapter).not.toBeNull();
        expect(adapter!.inputPortId).toBe('in');
        expect(adapter!.outputPortId).toBe('out');
      }
    });
  });

  describe('needsAdapter', () => {
    it('returns true for mismatched units with available adapter', () => {
      const from = signalType(FLOAT, unitPhase01());
      const to = signalType(FLOAT, unitRadians());
      expect(needsAdapter(from, to)).toBe(true);
    });

    it('returns false for matching types', () => {
      const from = signalType(FLOAT, unitScalar());
      const to = signalType(FLOAT, unitScalar());
      expect(needsAdapter(from, to)).toBe(false);
    });

    it('returns false for mismatched types with no available adapter', () => {
      const from = signalType(FLOAT, unitPhase01());
      const to = signalType(FLOAT, unitNorm01());
      expect(needsAdapter(from, to)).toBe(false);
    });
  });

  describe('extractSignature', () => {
    it('extracts payload, unit, cardinality, temporality', () => {
      const type = signalType(FLOAT, unitPhase01());
      const sig = extractSignature(type);
      expect(sig.payload).toBe(FLOAT);
      expect(sig.unit).toEqual({ kind: 'phase01' });
      expect(sig.cardinality).toBe('one');
      expect(sig.temporality).toBe('continuous');
    });
  });
});
