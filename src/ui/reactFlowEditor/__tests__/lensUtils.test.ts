/**
 * Lens Utilities Tests
 *
 * Tests for lens management helper functions.
 */

import { describe, it, expect } from 'vitest';
import {
  getAvailableLensTypes,
  getLensLabel,
  canApplyLens,
  findCompatibleLenses
} from '../lensUtils';
import {
  canonicalType,
  unitPhase01,
  unitScalar,
  unitRadians,
  unitDegrees,
  unitNorm01,
  FLOAT,
} from '../../../core/canonical-types';

// Ensure adapter blocks are registered
import '../../../blocks/all';

describe('lensUtils', () => {
  describe('getAvailableLensTypes', () => {
    it('returns adapter blocks from registry', () => {
      const types = getAvailableLensTypes();

      // Should have multiple adapter blocks registered
      expect(types.length).toBeGreaterThan(0);

      // Each type should have required fields
      for (const t of types) {
        expect(t.blockType).toBeTruthy();
        expect(t.label).toBeTruthy();
        expect(t.inputType).toBeTruthy();
        expect(t.outputType).toBeTruthy();
        expect(t.description).toBeDefined(); // Can be empty string
      }
    });

    it('returns types sorted by label', () => {
      const types = getAvailableLensTypes();

      // Check that labels are in ascending order
      for (let i = 1; i < types.length; i++) {
        const prevLabel = types[i - 1].label;
        const currLabel = types[i].label;
        expect(prevLabel.localeCompare(currLabel)).toBeLessThanOrEqual(0);
      }
    });

    it('includes known adapter types', () => {
      const types = getAvailableLensTypes();
      const blockTypes = types.map(t => t.blockType);

      // Check for some known adapters
      expect(blockTypes).toContain('Adapter_PhaseToScalar01');
      expect(blockTypes).toContain('Adapter_DegreesToRadians');
      expect(blockTypes).toContain('Adapter_RadiansToDegrees');
    });
  });

  describe('getLensLabel', () => {
    it('returns registry label for known type', () => {
      const label = getLensLabel('Adapter_PhaseToScalar01');

      // Should return the human-readable label from the registry
      expect(label).toBeTruthy();
      expect(label.length).toBeGreaterThan(0);
      // Should not be the raw block type
      expect(label).not.toBe('Adapter_PhaseToScalar01');
    });

    it('formats unknown type by removing Adapter_ prefix and adding spaces', () => {
      const label = getLensLabel('Adapter_FooBar');

      // Should strip Adapter_ and add spaces before capitals
      expect(label).toBe('Foo Bar');
    });

    it('handles type without Adapter_ prefix', () => {
      const label = getLensLabel('SomeCustomType');

      // Should add spaces before capitals
      expect(label).toBe('Some Custom Type');
    });
  });

  describe('canApplyLens', () => {
    it('returns true when types match exactly', () => {
      const sourceType = canonicalType(FLOAT, unitPhase01());
      const lensInputType = canonicalType(FLOAT, unitPhase01());
      const lensOutputType = canonicalType(FLOAT, unitScalar());
      const targetType = canonicalType(FLOAT, unitScalar());

      const result = canApplyLens(sourceType, lensInputType, lensOutputType, targetType);

      expect(result).toBe(true);
    });

    it('returns false when source payload differs from lens input', () => {
      const sourceType = canonicalType(FLOAT, unitPhase01());
      const lensInputType = canonicalType(FLOAT, unitRadians()); // Mismatch
      const lensOutputType = canonicalType(FLOAT, unitScalar());
      const targetType = canonicalType(FLOAT, unitScalar());

      const result = canApplyLens(sourceType, lensInputType, lensOutputType, targetType);

      // Should fail because source unit (phase01) doesn't match lens input unit (radians)
      expect(result).toBe(false);
    });

    it('returns false when lens output differs from target', () => {
      const sourceType = canonicalType(FLOAT, unitPhase01());
      const lensInputType = canonicalType(FLOAT, unitPhase01());
      const lensOutputType = canonicalType(FLOAT, unitRadians()); // Mismatch
      const targetType = canonicalType(FLOAT, unitScalar());

      const result = canApplyLens(sourceType, lensInputType, lensOutputType, targetType);

      // Should fail because lens output (radians) doesn't match target (scalar)
      expect(result).toBe(false);
    });

    it('handles matching with no units (scalar payload)', () => {
      const sourceType = canonicalType(FLOAT);
      const lensInputType = canonicalType(FLOAT);
      const lensOutputType = canonicalType(FLOAT);
      const targetType = canonicalType(FLOAT);

      const result = canApplyLens(sourceType, lensInputType, lensOutputType, targetType);

      expect(result).toBe(true);
    });
  });

  describe('findCompatibleLenses', () => {
    it('returns empty array when no lenses match', () => {
      // Create types that no adapter will match
      const sourceType = canonicalType(FLOAT, unitPhase01());
      const targetType = canonicalType(FLOAT, unitPhase01()); // Same type, no adapter needed

      const lenses = findCompatibleLenses(sourceType, targetType);

      // No adapter needed for same type
      expect(lenses.length).toBe(0);
    });

    it('returns matching lenses for phase → scalar conversion', () => {
      const sourceType = canonicalType(FLOAT, unitPhase01());
      const targetType = canonicalType(FLOAT, unitScalar());

      const lenses = findCompatibleLenses(sourceType, targetType);

      // Should find the phase→scalar adapter
      expect(lenses.length).toBeGreaterThan(0);
      const hasPhaseToScalar = lenses.some(l => l.blockType === 'Adapter_PhaseToScalar01');
      expect(hasPhaseToScalar).toBe(true);
    });

    it('returns matching lenses for radians ↔ degrees conversion', () => {
      const sourceType = canonicalType(FLOAT, unitRadians());
      const targetType = canonicalType(FLOAT, unitDegrees());

      const lenses = findCompatibleLenses(sourceType, targetType);

      // Should find the radians→degrees adapter
      expect(lenses.length).toBeGreaterThan(0);
      const hasRadiansToDegrees = lenses.some(l => l.blockType === 'Adapter_RadiansToDegrees');
      expect(hasRadiansToDegrees).toBe(true);
    });

    it('does not return incompatible lenses', () => {
      const sourceType = canonicalType(FLOAT, unitPhase01());
      const targetType = canonicalType(FLOAT, unitDegrees());

      const lenses = findCompatibleLenses(sourceType, targetType);

      // Should NOT find radians→degrees (source is phase01, not radians)
      const hasRadiansToDegrees = lenses.some(l => l.blockType === 'Adapter_RadiansToDegrees');
      expect(hasRadiansToDegrees).toBe(false);
    });
  });
});
