/**
 * Canonical Name Utilities Tests
 *
 * Tests the single source of truth for canonical name normalization.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeCanonicalName,
  detectCanonicalNameCollisions,
  validateDisplayNameUniqueness,
  isValidDisplayName,
  generateLensId,
  generateLensIdByIndex,
} from '../canonical-name';
import { buildPatch } from '../../graph/Patch';

// Import blocks to register them
import '../../blocks/math-blocks';

// =============================================================================
// normalizeCanonicalName Tests
// =============================================================================

describe('normalizeCanonicalName', () => {
  describe('basic normalization', () => {
    it('strips special characters', () => {
      expect(normalizeCanonicalName('My Circle!')).toBe('my_circle');
      expect(normalizeCanonicalName('Block@Name')).toBe('blockname');
      expect(normalizeCanonicalName('Test#123')).toBe('test123');
    });

    it('replaces spaces with underscores', () => {
      expect(normalizeCanonicalName('My Block')).toBe('my_block');
      expect(normalizeCanonicalName('A B C')).toBe('a_b_c');
    });

    it('converts to lowercase', () => {
      expect(normalizeCanonicalName('MyBlock')).toBe('myblock');
      expect(normalizeCanonicalName('UPPERCASE')).toBe('uppercase');
    });

    it('combines all rules correctly', () => {
      expect(normalizeCanonicalName('My Circle!')).toBe('my_circle');
      expect(normalizeCanonicalName("My Block! (it's a great block-o)")).toBe(
        'my_block_its_a_great_block-o'
      );
    });
  });

  describe('special character stripping', () => {
    it('strips all defined special characters', () => {
      // Stripped: ! @ # $ & ( ) [ ] { } | " ' + = * ^ % < > ? .
      const specials = '!@#$&()[]{}|"\'+*^%<>?.';
      expect(normalizeCanonicalName(`test${specials}name`)).toBe('testname');
    });

    it('preserves hyphens and underscores', () => {
      expect(normalizeCanonicalName('my-block')).toBe('my-block');
      expect(normalizeCanonicalName('my_block')).toBe('my_block');
      expect(normalizeCanonicalName('block-1_test')).toBe('block-1_test');
    });

    it('handles consecutive special chars', () => {
      expect(normalizeCanonicalName('a!!!b')).toBe('ab');
      expect(normalizeCanonicalName('x@#&y')).toBe('xy');
    });
  });

  describe('whitespace handling', () => {
    it('replaces multiple spaces with single underscore', () => {
      expect(normalizeCanonicalName('My   Block')).toBe('my_block');
      expect(normalizeCanonicalName('A    B    C')).toBe('a_b_c');
    });

    it('handles tabs and other whitespace', () => {
      expect(normalizeCanonicalName('My\tBlock')).toBe('my_block');
      expect(normalizeCanonicalName('My\nBlock')).toBe('my_block');
    });

    it('handles leading and trailing whitespace', () => {
      expect(normalizeCanonicalName('  MyBlock  ')).toBe('_myblock_');
      expect(normalizeCanonicalName('\tTest\t')).toBe('_test_');
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      expect(normalizeCanonicalName('')).toBe('');
    });

    it('handles only special chars', () => {
      expect(normalizeCanonicalName('!!!')).toBe('');
      expect(normalizeCanonicalName('@#$')).toBe('');
    });

    it('handles only spaces', () => {
      expect(normalizeCanonicalName('   ')).toBe('_');
    });

    it('handles numbers', () => {
      expect(normalizeCanonicalName('Block123')).toBe('block123');
      expect(normalizeCanonicalName('123Block')).toBe('123block');
    });

    it('handles unicode characters', () => {
      expect(normalizeCanonicalName('Café')).toBe('café');
      expect(normalizeCanonicalName('日本語')).toBe('日本語');
    });
  });

  describe('collision examples', () => {
    it('detects case-insensitive collisions', () => {
      const names = ['My Block', 'my block', 'MY BLOCK'];
      const normalized = names.map(normalizeCanonicalName);
      expect(normalized[0]).toBe(normalized[1]);
      expect(normalized[1]).toBe(normalized[2]);
    });

    it('detects special char collisions', () => {
      const names = ['My Block!', 'My Block?', 'My Block'];
      const normalized = names.map(normalizeCanonicalName);
      expect(normalized[0]).toBe(normalized[1]);
      expect(normalized[1]).toBe(normalized[2]);
    });

    it('detects whitespace collisions', () => {
      const names = ['Circle 1', 'Circle  1', 'Circle   1'];
      const normalized = names.map(normalizeCanonicalName);
      expect(normalized[0]).toBe(normalized[1]);
      expect(normalized[1]).toBe(normalized[2]);
    });
  });
});

// =============================================================================
// detectCanonicalNameCollisions Tests
// =============================================================================

describe('detectCanonicalNameCollisions', () => {
  it('detects no collisions when all names are unique', () => {
    const names = ['Circle', 'Square', 'Triangle'];
    const result = detectCanonicalNameCollisions(names);
    expect(result.collisions).toEqual([]);
  });

  it('detects exact collisions', () => {
    const names = ['My Block', 'my block'];
    const result = detectCanonicalNameCollisions(names);
    expect(result.collisions).toContain('my_block');
    expect(result.collisions.length).toBe(1);
  });

  it('detects multiple collision groups', () => {
    const names = ['Block A', 'block a', 'Circle', 'circle!'];
    const result = detectCanonicalNameCollisions(names);
    expect(result.collisions).toContain('block_a');
    expect(result.collisions).toContain('circle');
    expect(result.collisions.length).toBe(2);
  });

  it('handles three-way collisions', () => {
    const names = ['Test', 'TEST', 'test!'];
    const result = detectCanonicalNameCollisions(names);
    expect(result.collisions).toContain('test');
    expect(result.collisions.length).toBe(1);
  });

  it('handles empty array', () => {
    const result = detectCanonicalNameCollisions([]);
    expect(result.collisions).toEqual([]);
  });

  it('handles single name', () => {
    const result = detectCanonicalNameCollisions(['Single']);
    expect(result.collisions).toEqual([]);
  });

  it('ignores empty string results', () => {
    const names = ['Valid Name', '!!!', '@@@'];
    const result = detectCanonicalNameCollisions(names);
    // Empty strings from normalization create a collision
    expect(result.collisions).toContain('');
  });
});

// =============================================================================
// validateDisplayNameUniqueness Tests
// =============================================================================

describe('validateDisplayNameUniqueness', () => {
  it('returns null when all displayNames are unique', () => {
    const patch = buildPatch(b => {
      b.addBlock('Add', {}, { displayName: 'Circle' });
      b.addBlock('Add', {}, { displayName: 'Square' });
      b.addBlock('Add', {}, { displayName: 'Triangle' });
    });

    const error = validateDisplayNameUniqueness(patch);
    expect(error).toBeNull();
  });

  it('prevents case-insensitive collisions at creation time', () => {
    // addBlock now throws when creating a block with a colliding displayName
    expect(() => {
      buildPatch(b => {
        b.addBlock('Add', {}, { displayName: 'My Block' });
        b.addBlock('Add', {}, { displayName: 'my block' });
      });
    }).toThrow(/conflicts with existing block/);
  });

  it('prevents special character collisions at creation time', () => {
    // addBlock now throws when creating a block with a colliding displayName
    expect(() => {
      buildPatch(b => {
        b.addBlock('Add', {}, { displayName: 'Circle!' });
        b.addBlock('Add', {}, { displayName: 'Circle?' });
      });
    }).toThrow(/conflicts with existing block/);
  });

  it('generates unique displayNames when not provided', () => {
    const patch = buildPatch(b => {
      b.addBlock('Add', {});
      b.addBlock('Add', {});
      b.addBlock('Add', {}, { displayName: 'Valid' });
    });

    const error = validateDisplayNameUniqueness(patch);
    // All displayNames should be unique (auto-generated + explicit)
    expect(error).toBeNull();
  });

  it('auto-generates displayName when empty string provided', () => {
    const patch = buildPatch(b => {
      b.addBlock('Add', {}, { displayName: '' });
      b.addBlock('Add', {}, { displayName: '  ' });
      b.addBlock('Add', {}, { displayName: 'Valid' });
    });

    const error = validateDisplayNameUniqueness(patch);
    expect(error).toBeNull();
  });

  it('prevents multiple collisions at creation time', () => {
    // addBlock now throws on the first collision attempt
    expect(() => {
      buildPatch(b => {
        b.addBlock('Add', {}, { displayName: 'My Block' });
        b.addBlock('Add', {}, { displayName: 'my block' }); // This will throw
      });
    }).toThrow(/conflicts with existing block/);
  });

  it('prevents collisions across multiple groups at creation time', () => {
    // addBlock now throws on the first collision attempt
    expect(() => {
      buildPatch(b => {
        b.addBlock('Add', {}, { displayName: 'Block A' });
        b.addBlock('Add', {}, { displayName: 'block a' }); // This will throw
      });
    }).toThrow(/conflicts with existing block/);
  });
});

// =============================================================================
// isValidDisplayName Tests
// =============================================================================

describe('isValidDisplayName', () => {
  it('accepts non-empty strings', () => {
    expect(isValidDisplayName('Valid')).toBe(true);
    expect(isValidDisplayName('My Block')).toBe(true);
    expect(isValidDisplayName('123')).toBe(true);
    expect(isValidDisplayName('!!!')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidDisplayName('')).toBe(false);
  });

  it('rejects null', () => {
    expect(isValidDisplayName(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidDisplayName(undefined)).toBe(false);
  });

  it('rejects numbers', () => {
    expect(isValidDisplayName(123)).toBe(false);
  });

  it('rejects objects', () => {
    expect(isValidDisplayName({})).toBe(false);
    expect(isValidDisplayName([])).toBe(false);
  });
});

// =============================================================================
// Lens ID Generation Tests
// =============================================================================

describe('generateLensId', () => {
  it('generates deterministic IDs from source address', () => {
    const sourceAddress = 'v1:blocks.const_1.outputs.value';
    const id1 = generateLensId(sourceAddress);
    const id2 = generateLensId(sourceAddress);
    expect(id1).toBe(id2);
  });

  it('generates different IDs for different source addresses', () => {
    const id1 = generateLensId('v1:blocks.const_1.outputs.value');
    const id2 = generateLensId('v1:blocks.const_2.outputs.value');
    expect(id1).not.toBe(id2);
  });

  it('generates IDs with lens_ prefix', () => {
    const id = generateLensId('v1:blocks.const_1.outputs.value');
    expect(id).toMatch(/^lens_/);
  });

  it('generates short, readable IDs', () => {
    const id = generateLensId('v1:blocks.const_1.outputs.value');
    // lens_ prefix (8 chars) + hash (6 chars) = 14 chars max
    expect(id.length).toBeLessThanOrEqual(14);
  });

  it('handles empty string', () => {
    const id = generateLensId('');
    expect(id).toMatch(/^lens_/);
  });

  it('handles long source addresses', () => {
    const longAddress = 'v1:blocks.very_long_block_name_with_many_words.outputs.complex_output_port';
    const id = generateLensId(longAddress);
    expect(id).toMatch(/^lens_/);
    expect(id.length).toBeLessThanOrEqual(14);
  });
});

describe('generateLensIdByIndex', () => {
  it('generates IDs with lens_ prefix and index', () => {
    expect(generateLensIdByIndex('x', 0)).toBe('lens_0');
    expect(generateLensIdByIndex('x', 1)).toBe('lens_1');
    expect(generateLensIdByIndex('x', 99)).toBe('lens_99');
  });

  it('generates deterministic IDs', () => {
    const id1 = generateLensIdByIndex('port', 5);
    const id2 = generateLensIdByIndex('port', 5);
    expect(id1).toBe(id2);
  });

  it('generates different IDs for different indices', () => {
    const id1 = generateLensIdByIndex('port', 0);
    const id2 = generateLensIdByIndex('port', 1);
    expect(id1).not.toBe(id2);
  });
});
