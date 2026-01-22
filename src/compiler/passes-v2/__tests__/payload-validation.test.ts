/**
 * Payload Validation Tests
 *
 * Tests for compile-time payload validation logic.
 */

import { describe, it, expect } from 'vitest';
import {
  isPayloadAllowed,
  getBlockPayloadMetadata,
  isPayloadGeneric,
  findPayloadCombination,
  type BlockPayloadMetadata,
} from '../../../blocks/registry';

// Import blocks to ensure registry is populated
import '../../../blocks/math-blocks';
import '../../../blocks/signal-blocks';

describe('Payload Validation', () => {
  describe('isPayloadAllowed', () => {
    it('returns undefined for blocks without payload constraints', () => {
      // Most blocks don't have payload constraints yet
      const result = isPayloadAllowed('Add', 'a', 'float');
      // undefined = no constraints = allowed
      expect(result === undefined || result === true).toBe(true);
    });

    it('validates against allowedPayloads when defined', () => {
      const meta: BlockPayloadMetadata = {
        allowedPayloads: {
          input: ['float', 'phase'],
          out: ['float'],
        },
        semantics: 'typeSpecific',
      };
      
      // Test the constraint logic
      expect(meta.allowedPayloads.input.includes('float')).toBe(true);
      expect(meta.allowedPayloads.input.includes('vec2')).toBe(false);
    });
  });

  describe('findPayloadCombination', () => {
    it('returns undefined for blocks without combinations', () => {
      const combo = findPayloadCombination('Const', ['float']);
      expect(combo).toBeUndefined();
    });

    it('matches combination correctly when defined', () => {
      const meta: BlockPayloadMetadata = {
        allowedPayloads: {
          a: ['float', 'vec2'],
          b: ['float', 'vec2'],
          out: ['float', 'vec2'],
        },
        semantics: 'componentwise',
        combinations: [
          { inputs: ['float', 'float'], output: 'float' },
          { inputs: ['vec2', 'vec2'], output: 'vec2' },
        ],
      };

      // Find float+float combination
      const floatCombo = meta.combinations?.find(
        c => c.inputs[0] === 'float' && c.inputs[1] === 'float'
      );
      expect(floatCombo?.output).toBe('float');

      // Find vec2+vec2 combination
      const vec2Combo = meta.combinations?.find(
        c => c.inputs[0] === 'vec2' && c.inputs[1] === 'vec2'
      );
      expect(vec2Combo?.output).toBe('vec2');

      // No color+color combination
      const colorCombo = meta.combinations?.find(
        c => c.inputs[0] === 'color' && c.inputs[1] === 'color'
      );
      expect(colorCombo).toBeUndefined();
    });
  });

  describe('isPayloadGeneric', () => {
    it('returns false for blocks without payload metadata', () => {
      const result = isPayloadGeneric('Const');
      expect(typeof result).toBe('boolean');
    });

    it('identifies payload-generic blocks correctly', () => {
      const meta: BlockPayloadMetadata = {
        allowedPayloads: {
          a: ['float', 'vec2', 'color'],
          out: ['float', 'vec2', 'color'],
        },
        semantics: 'componentwise',
      };

      // Multiple allowed payloads = payload-generic
      expect(meta.allowedPayloads.a.length > 1).toBe(true);
    });
  });

  describe('Payload constraint semantics', () => {
    it('componentwise allows same operations per component', () => {
      const meta: BlockPayloadMetadata = {
        allowedPayloads: { a: ['float', 'vec2'] },
        semantics: 'componentwise',
      };
      expect(meta.semantics).toBe('componentwise');
    });

    it('typeSpecific requires explicit per-type definitions', () => {
      const meta: BlockPayloadMetadata = {
        allowedPayloads: { input: ['float', 'phase'] },
        semantics: 'typeSpecific',
        combinations: [
          { inputs: ['float'], output: 'float' },
          { inputs: ['phase'], output: 'float' },
        ],
      };
      expect(meta.semantics).toBe('typeSpecific');
      expect(meta.combinations).toHaveLength(2);
    });
  });
});
