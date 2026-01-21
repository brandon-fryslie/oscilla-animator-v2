/**
 * Tests for combine-utils.ts
 *
 * Validates combine mode restrictions for different payload types.
 */

import { describe, it, expect } from 'vitest';
import { validateCombineMode } from '../combine-utils';

describe('validateCombineMode', () => {
  describe('numeric payloads (float, int, vec2)', () => {
    const numericPayloads = ['float', 'int', 'vec2'] as const;
    const allModes = ['sum', 'average', 'max', 'min', 'last', 'first'] as const;

    for (const payload of numericPayloads) {
      for (const mode of allModes) {
        it(`allows ${mode} for ${payload}`, () => {
          const result = validateCombineMode(mode, 'signal', payload);
          expect(result.valid).toBe(true);
        });
      }
    }
  });

  describe('color payload', () => {
    it('allows last for color', () => {
      expect(validateCombineMode('last', 'signal', 'color').valid).toBe(true);
    });

    it('allows first for color', () => {
      expect(validateCombineMode('first', 'signal', 'color').valid).toBe(true);
    });

    it('allows layer for color', () => {
      expect(validateCombineMode('layer', 'signal', 'color').valid).toBe(true);
    });

    it('rejects sum for color', () => {
      const result = validateCombineMode('sum', 'signal', 'color');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Color domain');
    });

    it('rejects average for color', () => {
      const result = validateCombineMode('average', 'signal', 'color');
      expect(result.valid).toBe(false);
    });
  });

  describe('shape payload', () => {
    it('allows last for shape', () => {
      expect(validateCombineMode('last', 'signal', 'shape').valid).toBe(true);
    });

    it('allows first for shape', () => {
      expect(validateCombineMode('first', 'signal', 'shape').valid).toBe(true);
    });

    it('allows layer for shape', () => {
      expect(validateCombineMode('layer', 'signal', 'shape').valid).toBe(true);
    });

    it('rejects sum for shape', () => {
      const result = validateCombineMode('sum', 'signal', 'shape');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Shape domain');
    });

    it('rejects average for shape', () => {
      const result = validateCombineMode('average', 'signal', 'shape');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Shape domain');
    });

    it('rejects mul for shape', () => {
      const result = validateCombineMode('mul' as any, 'signal', 'shape');
      expect(result.valid).toBe(false);
    });

    it('rejects min for shape', () => {
      const result = validateCombineMode('min', 'signal', 'shape');
      expect(result.valid).toBe(false);
    });

    it('rejects max for shape', () => {
      const result = validateCombineMode('max', 'signal', 'shape');
      expect(result.valid).toBe(false);
    });
  });

  describe('bool payload', () => {
    it('allows last for bool', () => {
      expect(validateCombineMode('last', 'signal', 'bool').valid).toBe(true);
    });

    it('allows first for bool', () => {
      expect(validateCombineMode('first', 'signal', 'bool').valid).toBe(true);
    });

    it('rejects sum for bool', () => {
      const result = validateCombineMode('sum', 'signal', 'bool');
      expect(result.valid).toBe(false);
    });
  });

  describe('world restrictions', () => {
    it('rejects non-last/first for config world', () => {
      const result = validateCombineMode('sum', 'config', 'float');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Config inputs');
    });

    it('rejects non-last/first for scalar world', () => {
      const result = validateCombineMode('sum', 'scalar', 'float');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Scalar inputs');
    });
  });
});
