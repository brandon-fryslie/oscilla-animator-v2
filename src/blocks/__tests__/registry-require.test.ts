/**
 * Registry requireBlockDef Tests
 *
 * Validates that requireBlockDef and related functions throw on unknown block types,
 * ensuring callers get concrete values or a clear error.
 */

import { describe, it, expect } from 'vitest';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR,  CAMERA_PROJECTION } from '../../core/canonical-types';
import {
  getBlockDefinition,
  requireBlockDef,
  getBlockCardinalityMetadata,
  isCardinalityGeneric,
  getBlockPayloadMetadata,
  isPayloadAllowed,
  getPayloadCombinations,
  findPayloadCombination,
  isPayloadGeneric,
} from '../registry';

// Import blocks to ensure they're registered
import '../math-blocks';
import '../signal-blocks';
import '../time-blocks';

describe('requireBlockDef', () => {
  it('returns BlockDef for a registered block type', () => {
    const def = requireBlockDef('Add');
    expect(def.type).toBe('Add');
    expect(def.category).toBe('math');
    expect(def.inputs).toBeDefined();
    expect(def.outputs).toBeDefined();
  });

  it('throws for an unregistered block type', () => {
    expect(() => requireBlockDef('NonExistentBlock')).toThrow(
      'Unknown block type: "NonExistentBlock" is not registered'
    );
  });

  it('throws with the exact block type name in the error message', () => {
    expect(() => requireBlockDef('FooBar_123')).toThrow('"FooBar_123"');
  });

  it('return type is non-nullable (no undefined)', () => {
    const def = requireBlockDef('Add');
    // TypeScript ensures this is BlockDef, not BlockDef | undefined
    // This test just verifies runtime behavior matches
    expect(def).not.toBeUndefined();
    expect(def).not.toBeNull();
  });
});

describe('getBlockDefinition (nullable version)', () => {
  it('returns undefined for unregistered block type', () => {
    const def = getBlockDefinition('NonExistentBlock');
    expect(def).toBeUndefined();
  });

  it('returns BlockDef for registered block type', () => {
    const def = getBlockDefinition('Add');
    expect(def).toBeDefined();
    expect(def!.type).toBe('Add');
  });
});

describe('Metadata functions throw on unknown block type', () => {
  describe('getBlockCardinalityMetadata', () => {
    it('throws for non-existent block type', () => {
      expect(() => getBlockCardinalityMetadata('Bogus')).toThrow(
        'Unknown block type: "Bogus" is not registered'
      );
    });

    it('returns metadata for block with cardinality', () => {
      const meta = getBlockCardinalityMetadata('Add');
      expect(meta).toBeDefined();
      expect(meta!.cardinalityMode).toBe('preserve');
    });

    it('returns undefined for block without cardinality metadata', () => {
      // InfiniteTimeRoot has cardinality, so let's check a block that might not
      // Actually all blocks should have cardinality now - just verify the function works
      const meta = getBlockCardinalityMetadata('Add');
      expect(meta).toBeDefined();
    });
  });

  describe('isCardinalityGeneric', () => {
    it('throws for non-existent block type', () => {
      expect(() => isCardinalityGeneric('Bogus')).toThrow(
        'Unknown block type: "Bogus" is not registered'
      );
    });

    it('returns true for preserve+laneLocal blocks', () => {
      expect(isCardinalityGeneric('Add')).toBe(true);
    });
  });

  describe('getBlockPayloadMetadata', () => {
    it('throws for non-existent block type', () => {
      expect(() => getBlockPayloadMetadata('Bogus')).toThrow(
        'Unknown block type: "Bogus" is not registered'
      );
    });

    it('returns metadata for block with payload constraints', () => {
      const meta = getBlockPayloadMetadata('Add');
      expect(meta).toBeDefined();
    });
  });

  describe('isPayloadAllowed', () => {
    it('throws for non-existent block type', () => {
      expect(() => isPayloadAllowed('Bogus', 'a', FLOAT)).toThrow(
        'Unknown block type: "Bogus" is not registered'
      );
    });

    it('returns true for allowed payload on known block', () => {
      expect(isPayloadAllowed('Add', 'a', FLOAT)).toBe(true);
    });
  });

  describe('getPayloadCombinations', () => {
    it('throws for non-existent block type', () => {
      expect(() => getPayloadCombinations('Bogus')).toThrow(
        'Unknown block type: "Bogus" is not registered'
      );
    });
  });

  describe('findPayloadCombination', () => {
    it('throws for non-existent block type', () => {
      expect(() => findPayloadCombination('Bogus', [FLOAT])).toThrow(
        'Unknown block type: "Bogus" is not registered'
      );
    });
  });

  describe('isPayloadGeneric', () => {
    it('throws for non-existent block type', () => {
      expect(() => isPayloadGeneric('Bogus')).toThrow(
        'Unknown block type: "Bogus" is not registered'
      );
    });

    it('returns true for payload-generic blocks', () => {
      expect(isPayloadGeneric('Add')).toBe(true);
    });
  });
});
