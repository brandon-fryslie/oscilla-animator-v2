/**
 * Tests for combine-utils.ts
 *
 * Validates combine mode restrictions for different payload types.
 */

import { describe, it, expect } from 'vitest';
import { validateCombineMode, NUMERIC_PAYLOADS } from '../combine-utils';

describe('validateCombineMode', () => {
  describe('numeric payloads (float, int, vec2, vec3, vec4)', () => {
    const numericPayloads = NUMERIC_PAYLOADS;
    const allModes = ['sum', 'average', 'max', 'min', 'mul', 'last', 'first'] as const;

    for (const payload of numericPayloads) {
      for (const mode of allModes) {
        it(`allows ${mode} for ${payload}`, () => {
          const result = validateCombineMode(mode, 'one', payload);
          expect(result.valid).toBe(true);
        });
      }
    }

    it('rejects non-numeric combine modes for numeric payloads', () => {
      const result = validateCombineMode('layer', 'one', 'float');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Numeric payload');
    });
  });

  describe('color payload', () => {
    it('allows last for color', () => {
      expect(validateCombineMode('last', 'one', 'color').valid).toBe(true);
    });

    it('allows first for color', () => {
      expect(validateCombineMode('first', 'one', 'color').valid).toBe(true);
    });

    it('allows layer for color', () => {
      expect(validateCombineMode('layer', 'one', 'color').valid).toBe(true);
    });

    it('rejects sum for color', () => {
      const result = validateCombineMode('sum', 'one', 'color');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Color domain');
    });

    it('rejects average for color', () => {
      const result = validateCombineMode('average', 'one', 'color');
      expect(result.valid).toBe(false);
    });
  });

  describe('shape payload', () => {
    it('allows last for shape', () => {
      expect(validateCombineMode('last', 'one', 'shape').valid).toBe(true);
    });

    it('allows first for shape', () => {
      expect(validateCombineMode('first', 'one', 'shape').valid).toBe(true);
    });

    it('rejects layer for legacy shape payload alias', () => {
      const result = validateCombineMode('layer', 'one', 'shape');
      expect(result.valid).toBe(false);
    });

    it('rejects sum for shape', () => {
      const result = validateCombineMode('sum', 'one', 'shape');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('only supports combineMode "last" or "first"');
    });

    it('rejects average for shape', () => {
      const result = validateCombineMode('average', 'one', 'shape');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('only supports combineMode "last" or "first"');
    });

    it('rejects mul for shape', () => {
      const result = validateCombineMode('mul' as any, 'one', 'shape');
      expect(result.valid).toBe(false);
    });

    it('rejects min for shape', () => {
      const result = validateCombineMode('min', 'one', 'shape');
      expect(result.valid).toBe(false);
    });

    it('rejects max for shape', () => {
      const result = validateCombineMode('max', 'one', 'shape');
      expect(result.valid).toBe(false);
    });
  });

  describe('bool payload', () => {
    it('allows last for bool', () => {
      expect(validateCombineMode('last', 'one', 'bool').valid).toBe(true);
    });

    it('allows first for bool', () => {
      expect(validateCombineMode('first', 'one', 'bool').valid).toBe(true);
    });

    it('rejects sum for bool', () => {
      const result = validateCombineMode('sum', 'one', 'bool');
      expect(result.valid).toBe(false);
    });
  });

  describe('collect/array modes', () => {
    it('allows collect for any payload', () => {
      expect(validateCombineMode('collect', 'one', 'float').valid).toBe(true);
    });

    it('allows array for any payload', () => {
      expect(validateCombineMode('array', 'one', 'float').valid).toBe(true);
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
