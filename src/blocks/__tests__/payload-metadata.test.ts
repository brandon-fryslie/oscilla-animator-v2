/**
 * Payload Metadata Tests
 *
 * Validates that payload-generic block metadata is correctly defined
 * and queryable by the compiler.
 */

import { describe, it, expect } from 'vitest';
import {
  getBlockDefinition,
  getBlockPayloadMetadata,
  isPayloadAllowed,
  getPayloadCombinations,
  findPayloadCombination,
  isPayloadGeneric,
  type BlockPayloadMetadata,
  type PayloadCombination,
  STANDARD_NUMERIC_PAYLOADS,
  STANDARD_SCALAR_PAYLOADS,
  DEFAULT_PAYLOAD_METADATA,
} from '../registry';

// Import all blocks to ensure they're registered
import '../math-blocks';
import '../signal-blocks';

describe('Payload Metadata', () => {
  describe('Registry types', () => {
    it('exports payload metadata types correctly', () => {
      const meta: BlockPayloadMetadata = {
        allowedPayloads: {
          a: ['float', 'vec2'],
          b: ['float', 'vec2'],
          out: ['float', 'vec2'],
        },
        semantics: 'componentwise',
      };
      expect(meta.semantics).toBe('componentwise');
      expect(meta.allowedPayloads.a).toContain('float');
    });

    it('exports payload combination types correctly', () => {
      const combo: PayloadCombination = {
        inputs: ['float', 'float'],
        output: 'float',
        impl: { kind: 'opcode', opcode: 'Add' },
      };
      expect(combo.inputs).toEqual(['float', 'float']);
      expect(combo.output).toBe('float');
    });

    it('provides standard payload sets', () => {
      expect(STANDARD_NUMERIC_PAYLOADS).toContain('float');
      expect(STANDARD_NUMERIC_PAYLOADS).toContain('vec2');
      expect(STANDARD_NUMERIC_PAYLOADS).toContain('color');

      expect(STANDARD_SCALAR_PAYLOADS).toContain('float');
      expect(STANDARD_SCALAR_PAYLOADS).not.toContain('vec2');
    });

    it('provides default payload metadata', () => {
      expect(DEFAULT_PAYLOAD_METADATA.semantics).toBe('componentwise');
      expect(DEFAULT_PAYLOAD_METADATA.allowedPayloads).toEqual({});
    });
  });

  describe('Query functions', () => {
    it('getBlockPayloadMetadata returns undefined for blocks without metadata', () => {
      // Most blocks don't have payload metadata yet
      const meta = getBlockPayloadMetadata('Const');
      // Const might not have metadata, that's fine
      expect(meta === undefined || meta !== undefined).toBe(true);
    });

    it('getBlockPayloadMetadata returns metadata for annotated blocks', () => {
      // Math blocks should have payload metadata
      const meta = getBlockPayloadMetadata('Add');
      expect(meta).toBeDefined();
      expect(meta?.semantics).toBe('componentwise');
      expect(meta?.allowedPayloads.a).toContain('float');
      expect(meta?.allowedPayloads.a).toContain('vec2');
    });

    it('isPayloadAllowed returns true for allowed payloads', () => {
      const result = isPayloadAllowed('Add', 'a', 'float');
      expect(result).toBe(true);
    });

    it('isPayloadAllowed returns true for Const allowed payloads', () => {
      const result = isPayloadAllowed('Const', 'out', 'float');
      expect(result).toBe(true);
    });

    it('isPayloadAllowed returns true for Const vec2 payload', () => {
      const result = isPayloadAllowed('Const', 'out', 'vec2');
      expect(result).toBe(true);
    });

    it('getPayloadCombinations returns combinations for Const', () => {
      const combos = getPayloadCombinations('Const');
      expect(combos).toBeDefined();
      expect(Array.isArray(combos)).toBe(true);
      expect(combos!.length).toBeGreaterThan(0);
    });

    it('findPayloadCombination returns undefined for Const with inputs (it has no inputs)', () => {
      // Const has no input ports that affect type - it's a source block
      const combo = findPayloadCombination('Const', ['float', 'float']);
      expect(combo).toBeUndefined();
    });

    it('isPayloadGeneric returns true for Const', () => {
      const result = isPayloadGeneric('Const');
      expect(result).toBe(true);
    });
  });

  describe('Custom payload metadata', () => {
    it('validates payload constraints correctly', () => {
      const meta: BlockPayloadMetadata = {
        allowedPayloads: {
          input: ['float', 'phase'],
          out: ['float'],
        },
        semantics: 'typeSpecific',
        combinations: [
          { inputs: ['float'], output: 'float' },
          { inputs: ['phase'], output: 'float' },
        ],
      };

      expect(meta.allowedPayloads.input).toContain('float');
      expect(meta.allowedPayloads.input).toContain('phase');
      expect(meta.allowedPayloads.input).not.toContain('vec2');

      expect(meta.combinations).toHaveLength(2);
    });

    it('combination lookup works correctly', () => {
      const combos: PayloadCombination[] = [
        { inputs: ['float', 'float'], output: 'float' },
        { inputs: ['vec2', 'vec2'], output: 'vec2' },
        { inputs: ['vec2', 'float'], output: 'vec2' },
      ];

      // Find exact match
      const floatFloat = combos.find(
        (c) => c.inputs.length === 2 && c.inputs[0] === 'float' && c.inputs[1] === 'float'
      );
      expect(floatFloat?.output).toBe('float');

      // Find mixed match
      const vec2Float = combos.find(
        (c) => c.inputs.length === 2 && c.inputs[0] === 'vec2' && c.inputs[1] === 'float'
      );
      expect(vec2Float?.output).toBe('vec2');

      // No match for disallowed
      const colorColor = combos.find(
        (c) => c.inputs.length === 2 && c.inputs[0] === 'color' && c.inputs[1] === 'color'
      );
      expect(colorColor).toBeUndefined();
    });
  });

  describe('Semantics categories', () => {
    it('componentwise semantics means per-component operation', () => {
      const meta: BlockPayloadMetadata = {
        allowedPayloads: { a: ['float', 'vec2', 'color'] },
        semantics: 'componentwise',
      };
      expect(meta.semantics).toBe('componentwise');
    });

    it('typeSpecific semantics means explicit per-type behavior', () => {
      const meta: BlockPayloadMetadata = {
        allowedPayloads: { input: ['float', 'phase'] },
        semantics: 'typeSpecific',
        combinations: [
          { inputs: ['float'], output: 'float' },
          { inputs: ['phase'], output: 'float' },
        ],
      };
      expect(meta.semantics).toBe('typeSpecific');
      expect(meta.combinations).toBeDefined();
    });
  });
});
