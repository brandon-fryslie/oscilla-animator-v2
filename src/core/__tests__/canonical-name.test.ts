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

  it('detects case-insensitive collisions', () => {
    const patch = buildPatch(b => {
      b.addBlock('Add', {}, { displayName: 'My Block' });
      b.addBlock('Add', {}, { displayName: 'my block' });
    });

    const error = validateDisplayNameUniqueness(patch);
    expect(error).not.toBeNull();
    expect(error?.kind).toBe('DISPLAYNAME_COLLISION');
    expect(error?.message).toContain('my_block');
  });

  it('detects special character collisions', () => {
    const patch = buildPatch(b => {
      b.addBlock('Add', {}, { displayName: 'Circle!' });
      b.addBlock('Add', {}, { displayName: 'Circle?' });
    });

    const error = validateDisplayNameUniqueness(patch);
    expect(error).not.toBeNull();
    expect(error?.kind).toBe('DISPLAYNAME_COLLISION');
    expect(error?.message).toContain('circle');
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

  it('provides detailed error message with all colliding names', () => {
    const patch = buildPatch(b => {
      b.addBlock('Add', {}, { displayName: 'My Block' });
      b.addBlock('Add', {}, { displayName: 'my block' });
      b.addBlock('Add', {}, { displayName: 'MY BLOCK!' });
    });

    const error = validateDisplayNameUniqueness(patch);
    expect(error).not.toBeNull();
    expect(error?.message).toContain('My Block');
    expect(error?.message).toContain('my block');
    expect(error?.message).toContain('MY BLOCK!');
  });

  it('handles multiple collision groups', () => {
    const patch = buildPatch(b => {
      b.addBlock('Add', {}, { displayName: 'Block A' });
      b.addBlock('Add', {}, { displayName: 'block a' });
      b.addBlock('Add', {}, { displayName: 'Circle' });
      b.addBlock('Add', {}, { displayName: 'circle!' });
    });

    const error = validateDisplayNameUniqueness(patch);
    expect(error).not.toBeNull();
    expect(error?.message).toContain('block_a');
    expect(error?.message).toContain('circle');
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
