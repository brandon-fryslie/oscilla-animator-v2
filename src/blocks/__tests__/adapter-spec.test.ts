/**
 * Adapter Registry Tests
 *
 * Verifies that findAdapter() correctly identifies type conversion adapters
 * per spec §B4.1, and rejects disallowed conversions per §B4.2.
 */

import { describe, it, expect } from 'vitest';
import { findAdapter, needsAdapter, extractPattern } from '../adapter-spec';
import {
  canonicalType,
  unitPhase01,
  unitScalar,
  unitRadians,
  unitDegrees,
  unitNorm01,
  unitMs,
  unitSeconds,
} from '../../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR,  CAMERA_PROJECTION } from '../../core/canonical-types';

// Ensure adapter blocks are registered
import '../../blocks/adapter-blocks';

describe('Adapter Registry', () => {
  describe('findAdapter - unit conversion adapters (§B4.1)', () => {
    it('Phase → Scalar: returns Adapter_PhaseToScalar01', () => {
      const from = canonicalType(FLOAT, unitPhase01());
      const to = canonicalType(FLOAT, unitScalar());
      const adapter = findAdapter(from, to);
      expect(adapter).not.toBeNull();
      expect(adapter!.blockType).toBe('Adapter_PhaseToScalar01');
    });

    it('Scalar → Phase: returns Adapter_ScalarToPhase01', () => {
      const from = canonicalType(FLOAT, unitScalar());
      const to = canonicalType(FLOAT, unitPhase01());
      const adapter = findAdapter(from, to);
      expect(adapter).not.toBeNull();
      expect(adapter!.blockType).toBe('Adapter_ScalarToPhase01');
    });

    it('Phase → Radians: returns Adapter_PhaseToRadians', () => {
      const from = canonicalType(FLOAT, unitPhase01());
      const to = canonicalType(FLOAT, unitRadians());
      const adapter = findAdapter(from, to);
      expect(adapter).not.toBeNull();
      expect(adapter!.blockType).toBe('Adapter_PhaseToRadians');
    });

    it('Radians → Phase: returns Adapter_RadiansToPhase01', () => {
      const from = canonicalType(FLOAT, unitRadians());
      const to = canonicalType(FLOAT, unitPhase01());
      const adapter = findAdapter(from, to);
      expect(adapter).not.toBeNull();
      expect(adapter!.blockType).toBe('Adapter_RadiansToPhase01');
    });

    it('Degrees → Radians: returns Adapter_DegreesToRadians', () => {
      const from = canonicalType(FLOAT, unitDegrees());
      const to = canonicalType(FLOAT, unitRadians());
      const adapter = findAdapter(from, to);
      expect(adapter).not.toBeNull();
      expect(adapter!.blockType).toBe('Adapter_DegreesToRadians');
    });

    it('Radians → Degrees: returns Adapter_RadiansToDegrees', () => {
      const from = canonicalType(FLOAT, unitRadians());
      const to = canonicalType(FLOAT, unitDegrees());
      const adapter = findAdapter(from, to);
      expect(adapter).not.toBeNull();
      expect(adapter!.blockType).toBe('Adapter_RadiansToDegrees');
    });

    it('Ms → Seconds: returns Adapter_MsToSeconds', () => {
      const from = canonicalType(INT, unitMs());
      const to = canonicalType(FLOAT, unitSeconds());
      const adapter = findAdapter(from, to);
      expect(adapter).not.toBeNull();
      expect(adapter!.blockType).toBe('Adapter_MsToSeconds');
    });

    it('Seconds → Ms: returns Adapter_SecondsToMs', () => {
      const from = canonicalType(FLOAT, unitSeconds());
      const to = canonicalType(INT, unitMs());
      const adapter = findAdapter(from, to);
      expect(adapter).not.toBeNull();
      expect(adapter!.blockType).toBe('Adapter_SecondsToMs');
    });

    it('Scalar → Norm01: returns Adapter_ScalarToNorm01Clamp', () => {
      const from = canonicalType(FLOAT, unitScalar());
      const to = canonicalType(FLOAT, unitNorm01());
      const adapter = findAdapter(from, to);
      expect(adapter).not.toBeNull();
      expect(adapter!.blockType).toBe('Adapter_ScalarToNorm01Clamp');
    });

    it('Norm01 → Scalar: returns Adapter_Norm01ToScalar', () => {
      const from = canonicalType(FLOAT, unitNorm01());
      const to = canonicalType(FLOAT, unitScalar());
      const adapter = findAdapter(from, to);
      expect(adapter).not.toBeNull();
      expect(adapter!.blockType).toBe('Adapter_Norm01ToScalar');
    });
  });

  describe('findAdapter - compatible types (no adapter needed)', () => {
    it('returns null when types are identical (phase01 → phase01)', () => {
      const from = canonicalType(FLOAT, unitPhase01());
      const to = canonicalType(FLOAT, unitPhase01());
      expect(findAdapter(from, to)).toBeNull();
    });

    it('returns null when types are identical (scalar → scalar)', () => {
      const from = canonicalType(FLOAT, unitScalar());
      const to = canonicalType(FLOAT, unitScalar());
      expect(findAdapter(from, to)).toBeNull();
    });

    it('returns null when types are identical (radians → radians)', () => {
      const from = canonicalType(FLOAT, unitRadians());
      const to = canonicalType(FLOAT, unitRadians());
      expect(findAdapter(from, to)).toBeNull();
    });
  });

  describe('findAdapter - disallowed conversions (§B4.2)', () => {
    it('returns null for Phase01 → Norm01 (semantic ambiguity)', () => {
      const from = canonicalType(FLOAT, unitPhase01());
      const to = canonicalType(FLOAT, unitNorm01());
      // Spec explicitly disallows this — must go phase01→scalar→norm01
      expect(findAdapter(from, to)).toBeNull();
    });

    it('returns null for Norm01 → Phase01 (no direct path)', () => {
      const from = canonicalType(FLOAT, unitNorm01());
      const to = canonicalType(FLOAT, unitPhase01());
      expect(findAdapter(from, to)).toBeNull();
    });

    it('returns null for Degrees → Phase01 (no direct adapter)', () => {
      const from = canonicalType(FLOAT, unitDegrees());
      const to = canonicalType(FLOAT, unitPhase01());
      // Must go degrees→radians→phase01 (two-hop)
      expect(findAdapter(from, to)).toBeNull();
    });

    it('returns null for incompatible payload types without adapter', () => {
      const from = canonicalType(FLOAT, unitScalar());
      const to = canonicalType(INT, unitScalar());
      // No float→int adapter for scalar (only seconds→ms has payload change)
      expect(findAdapter(from, to)).toBeNull();
    });
  });

  describe('findAdapter - adapter port IDs', () => {
    it('all adapters use standard in/out port naming', () => {
      const conversions = [
        { from: canonicalType(FLOAT, unitPhase01()), to: canonicalType(FLOAT, unitScalar()) },
        { from: canonicalType(FLOAT, unitScalar()), to: canonicalType(FLOAT, unitPhase01()) },
        { from: canonicalType(FLOAT, unitPhase01()), to: canonicalType(FLOAT, unitRadians()) },
        { from: canonicalType(FLOAT, unitRadians()), to: canonicalType(FLOAT, unitPhase01()) },
        { from: canonicalType(FLOAT, unitDegrees()), to: canonicalType(FLOAT, unitRadians()) },
        { from: canonicalType(FLOAT, unitRadians()), to: canonicalType(FLOAT, unitDegrees()) },
        { from: canonicalType(INT, unitMs()), to: canonicalType(FLOAT, unitSeconds()) },
        { from: canonicalType(FLOAT, unitSeconds()), to: canonicalType(INT, unitMs()) },
        { from: canonicalType(FLOAT, unitScalar()), to: canonicalType(FLOAT, unitNorm01()) },
        { from: canonicalType(FLOAT, unitNorm01()), to: canonicalType(FLOAT, unitScalar()) },
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
      const from = canonicalType(FLOAT, unitPhase01());
      const to = canonicalType(FLOAT, unitRadians());
      expect(needsAdapter(from, to)).toBe(true);
    });

    it('returns false for matching types', () => {
      const from = canonicalType(FLOAT, unitScalar());
      const to = canonicalType(FLOAT, unitScalar());
      expect(needsAdapter(from, to)).toBe(false);
    });

    it('returns false for mismatched types with no available adapter', () => {
      const from = canonicalType(FLOAT, unitPhase01());
      const to = canonicalType(FLOAT, unitNorm01());
      expect(needsAdapter(from, to)).toBe(false);
    });
  });

  describe('extractPattern', () => {
    it('extracts payload, unit, extent', () => {
      const type = canonicalType(FLOAT, unitPhase01());
      const pattern = extractPattern(type);
      expect(pattern.payload).toBe(FLOAT);
      expect(pattern.unit).toEqual({ kind: 'angle', unit: 'phase01' });
      expect(pattern.extent).toEqual(type.extent);
    });
  });
});
