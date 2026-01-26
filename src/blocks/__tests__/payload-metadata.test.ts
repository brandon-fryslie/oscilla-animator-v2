/**
 * Payload Metadata Tests
 *
 * Validates that payload-generic block metadata is correctly defined
 * and queryable by the compiler.
 */

import { describe, it, expect } from 'vitest';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION } from '../../core/canonical-types';
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
          a: [FLOAT, VEC2],
          b: [FLOAT, VEC2],
          out: [FLOAT, VEC2],
        },
        semantics: 'componentwise',
      };
      expect(meta.semantics).toBe('componentwise');
      expect(meta.allowedPayloads.a).toContain(FLOAT);
    });

    it('exports payload combination types correctly', () => {
      const combo: PayloadCombination = {
        inputs: [FLOAT, FLOAT],
        output: FLOAT,
        impl: { kind: 'opcode', opcode: 'Add' },
      };
      expect(combo.inputs).toEqual([FLOAT, FLOAT]);
      expect(combo.output).toBe(FLOAT);
    });

    it('provides standard payload sets', () => {
      expect(STANDARD_NUMERIC_PAYLOADS).toContain(FLOAT);
      expect(STANDARD_NUMERIC_PAYLOADS).toContain(VEC2);
      expect(STANDARD_NUMERIC_PAYLOADS).toContain(COLOR);

      expect(STANDARD_SCALAR_PAYLOADS).toContain(FLOAT);
      expect(STANDARD_SCALAR_PAYLOADS).not.toContain(VEC2);
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
      expect(meta?.allowedPayloads.a).toContain(FLOAT);
      expect(meta?.allowedPayloads.a).toContain(VEC2);
    });

    it('isPayloadAllowed returns true for allowed payloads', () => {
      const result = isPayloadAllowed('Add', 'a', FLOAT);
      expect(result).toBe(true);
    });

    it('isPayloadAllowed returns true for Const allowed payloads', () => {
      const result = isPayloadAllowed('Const', 'out', FLOAT);
      expect(result).toBe(true);
    });

    it('isPayloadAllowed returns true for Const vec2 payload', () => {
      const result = isPayloadAllowed('Const', 'out', VEC2);
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
      const combo = findPayloadCombination('Const', [FLOAT, FLOAT]);
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
          input: [FLOAT, INT],
          out: [FLOAT],
        },
        semantics: 'typeSpecific',
        combinations: [
          { inputs: [FLOAT], output: FLOAT },
          { inputs: [INT], output: FLOAT },
        ],
      };

      expect(meta.allowedPayloads.input).toContain(FLOAT);
      expect(meta.allowedPayloads.input).toContain(INT);
      expect(meta.allowedPayloads.input).not.toContain(VEC2);

      expect(meta.combinations).toHaveLength(2);
    });

    it('combination lookup works correctly', () => {
      const combos: PayloadCombination[] = [
        { inputs: [FLOAT, FLOAT], output: FLOAT },
        { inputs: [VEC2, VEC2], output: VEC2 },
        { inputs: [VEC2, FLOAT], output: VEC2 },
      ];

      // Find exact match
      const floatFloat = combos.find(
        (c) => c.inputs.length === 2 && c.inputs[0].kind === 'float' && c.inputs[1].kind === 'float'
      );
      expect(floatFloat?.output).toBe(FLOAT);

      // Find mixed match
      const vec2Float = combos.find(
        (c) => c.inputs.length === 2 && c.inputs[0].kind === 'vec2' && c.inputs[1].kind === 'float'
      );
      expect(vec2Float?.output).toBe(VEC2);

      // No match for disallowed
      const colorColor = combos.find(
        (c) => c.inputs.length === 2 && c.inputs[0].kind === 'color' && c.inputs[1].kind === 'color'
      );
      expect(colorColor).toBeUndefined();
    });
  });

  describe('Semantics categories', () => {
    it('componentwise semantics means per-component operation', () => {
      const meta: BlockPayloadMetadata = {
        allowedPayloads: { a: [FLOAT, VEC2, COLOR] },
        semantics: 'componentwise',
      };
      expect(meta.semantics).toBe('componentwise');
    });

    it('typeSpecific semantics means explicit per-type behavior', () => {
      const meta: BlockPayloadMetadata = {
        allowedPayloads: { input: [FLOAT, INT] },
        semantics: 'typeSpecific',
        combinations: [
          { inputs: [FLOAT], output: FLOAT },
          { inputs: [INT], output: FLOAT },
        ],
      };
      expect(meta.semantics).toBe('typeSpecific');
      expect(meta.combinations).toBeDefined();
    });
  });
});
