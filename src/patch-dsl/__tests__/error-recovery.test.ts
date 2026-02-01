/**
 * Error Recovery Tests
 *
 * Verifies that the deserializer handles malformed HCL gracefully,
 * producing partial patches and collecting errors without throwing exceptions.
 */

import { describe, it, expect } from 'vitest';
import { deserializePatchFromHCL } from '../index';
import '../../blocks/all';

describe('error recovery', () => {
  it('handles unresolvable block reference', () => {
    const hcl = `
      patch "Test" {
        block "Const" "a" {
          value = 1.0
        }
        connect {
          from = a.out
          to = nonexistent.in
        }
      }
    `;
    const result = deserializePatchFromHCL(hcl);

    // Should collect error, not throw
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('Unresolved');

    // Block 'a' should exist
    expect(result.patch.blocks.size).toBe(1);

    // Edge should be skipped (unresolvable reference)
    expect(result.patch.edges.length).toBe(0);
  });

  it('renames duplicate block names', () => {
    const hcl = `
      patch "Test" {
        block "Const" "foo" {
          value = 1.0
        }
        block "Const" "foo" {
          value = 2.0
        }
      }
    `;
    const result = deserializePatchFromHCL(hcl);

    // Should collect warning, not error
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].message).toContain('Duplicate');

    // Both blocks should exist
    expect(result.patch.blocks.size).toBe(2);

    // One should be renamed
    const displayNames = Array.from(result.patch.blocks.values()).map(b => b.displayName);
    expect(displayNames).toContain('foo');
    expect(displayNames).toContain('foo_2');
  });

  it('preserves unknown block type', () => {
    const hcl = `
      patch "Test" {
        block "UnknownBlockType" "foo" {
          someParam = 42
        }
      }
    `;
    const result = deserializePatchFromHCL(hcl);

    // Should collect warning for unknown type
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].message).toContain('Unknown');

    // Block should still be created
    expect(result.patch.blocks.size).toBe(1);
    const block = Array.from(result.patch.blocks.values())[0];
    expect(block.type).toBe('UnknownBlockType');
    expect(block.params.someParam).toBe(42);
  });

  it('handles missing block labels', () => {
    const hcl = `
      patch "Test" {
        block "Const" {}
      }
    `;
    const result = deserializePatchFromHCL(hcl);

    // Should collect error for missing displayName
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('Block must have type and displayName');

    // No blocks should be created (invalid block declaration)
    expect(result.patch.blocks.size).toBe(0);
  });

  it('handles malformed connect block', () => {
    const hcl = `
      patch "Test" {
        block "Const" "a" {
          value = 1.0
        }
        connect {
          from = a.out
        }
      }
    `;
    const result = deserializePatchFromHCL(hcl);

    // Should collect error for missing 'to' attribute
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('to');

    // Block should exist
    expect(result.patch.blocks.size).toBe(1);

    // Edge should be skipped
    expect(result.patch.edges.length).toBe(0);
  });

  it('handles empty HCL', () => {
    const hcl = '';
    const result = deserializePatchFromHCL(hcl);

    // Should have parsing error (no patch block)
    expect(result.errors.length).toBeGreaterThan(0);

    // Should produce empty patch
    expect(result.patch.blocks.size).toBe(0);
    expect(result.patch.edges.length).toBe(0);
  });

  it('recovers from syntax error in block body', () => {
    const hcl = `
      patch "Test" {
        block "Const" "a" {
          value = { invalid
        }
        block "Const" "b" {
          value = 2.0
        }
      }
    `;
    const result = deserializePatchFromHCL(hcl);

    // Should collect parsing errors
    expect(result.errors.length).toBeGreaterThan(0);

    // Should still parse what it can (partial recovery)
    // Note: actual recovery behavior depends on parser implementation
  });

  it('handles invalid attribute values', () => {
    const hcl = `
      patch "Test" {
        block "Const" "a" {
          value = "not a number"
        }
      }
    `;
    const result = deserializePatchFromHCL(hcl);

    // Should NOT error (Const accepts any value type)
    // This is valid HCL, just semantically odd
    expect(result.patch.blocks.size).toBe(1);
  });
});
