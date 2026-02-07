/**
 * Tests for HCL → Patch deserializer
 */

import { describe, it, expect } from 'vitest';
import { deserializePatchFromHCL } from '../deserialize';

// Import blocks to trigger registration
import '../../blocks/all';

describe('deserialize', () => {
  it('deserializes empty patch', () => {
    const hcl = 'patch "Empty" {}';
    const result = deserializePatchFromHCL(hcl);

    expect(result.errors).toHaveLength(0);
    expect(result.patch.blocks.size).toBe(0);
    expect(result.patch.edges.length).toBe(0);
  });

  it('deserializes simple block', () => {
    const hcl = `
      patch "Test" {
        block "Ellipse" "dot" {
          rx = 0.02
          ry = 0.02
        }
      }
    `;
    const result = deserializePatchFromHCL(hcl);

    expect(result.errors).toHaveLength(0);
    expect(result.patch.blocks.size).toBe(1);
    const block = Array.from(result.patch.blocks.values())[0];
    expect(block.type).toBe('Ellipse');
    expect(block.displayName).toBe('dot');
    expect(block.params.rx).toBe(0.02);
    expect(block.params.ry).toBe(0.02);
  });

  it('deserializes edge via outputs', () => {
    const hcl = `
      patch "Test" {
        block "Const" "a" {
          outputs {
            out = b.value
          }
        }
        block "Const" "b" {}
      }
    `;
    const result = deserializePatchFromHCL(hcl);

    expect(result.errors).toHaveLength(0);
    expect(result.patch.edges.length).toBe(1);
    expect(result.patch.edges[0].from.slotId).toBe('out');
    expect(result.patch.edges[0].to.slotId).toBe('value');
  });

  it('throws on unresolvable references in outputs', () => {
    // Important: this should be an error
    const hcl = `
      patch "Test" {
        block "Const" "a" {
          outputs {
            out = nonexistent.in
          }
        }
      }
    `;
    const result = deserializePatchFromHCL(hcl);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.patch.edges.length).toBe(0);  // Edge skipped
  });

  it('warns on duplicate block names and renames', () => {
    // Duplicate names produce a warning and the second block is renamed
    const hcl = `
      patch "Test" {
        block "Const" "foo" {}
        block "Const" "foo" {}
      }
    `;
    const result = deserializePatchFromHCL(hcl);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].message).toContain('Duplicate');
    expect(result.patch.blocks.size).toBe(2);
  });

  it('handles unknown block types', () => {
    const hcl = `
      patch "Test" {
        block "UnknownType" "test" {}
      }
    `;
    const result = deserializePatchFromHCL(hcl);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.patch.blocks.size).toBe(1);
    const block = Array.from(result.patch.blocks.values())[0];
    expect(block.type).toBe('UnknownType');
  });

  it('deserializes edges via inline outputs', () => {
    const hcl = `
      patch "Test" {
        block "Const" "a" {
          outputs {
            out = b.value
          }
        }
        block "Const" "b" {}
      }
    `;
    const result = deserializePatchFromHCL(hcl);

    expect(result.errors).toHaveLength(0);
    expect(result.patch.edges.length).toBe(1);
    expect(result.patch.edges[0].enabled).toBe(true);
  });

  it('deserializes params with arrays', () => {
    const hcl = `
      patch "Test" {
        block "Const" "test" {
          values = [1, 2, 3]
        }
      }
    `;
    const result = deserializePatchFromHCL(hcl);

    expect(result.errors).toHaveLength(0);
    const block = Array.from(result.patch.blocks.values())[0];
    expect(block.params.values).toEqual([1, 2, 3]);
  });

  it('deserializes params with objects', () => {
    const hcl = `
      patch "Test" {
        block "Const" "test" {
          color = { r = 1.0, g = 0.5, b = 0.0, a = 1.0 }
        }
      }
    `;
    const result = deserializePatchFromHCL(hcl);

    expect(result.errors).toHaveLength(0);
    const block = Array.from(result.patch.blocks.values())[0];
    expect(block.params.color).toEqual({ r: 1.0, g: 0.5, b: 0.0, a: 1.0 });
  });

  it('deserializes role attribute', () => {
    const hcl = `
      patch "Test" {
        block "Const" "test" {
          role = "time_root"
        }
      }
    `;
    const result = deserializePatchFromHCL(hcl);

    expect(result.errors).toHaveLength(0);
    const block = Array.from(result.patch.blocks.values())[0];
    expect(block.role.kind).toBe('time_root');
  });

  it('deserializes domain attribute', () => {
    const hcl = `
      patch "Test" {
        block "Const" "test" {
          domain = "circle1"
        }
      }
    `;
    const result = deserializePatchFromHCL(hcl);

    expect(result.errors).toHaveLength(0);
    const block = Array.from(result.patch.blocks.values())[0];
    expect(block.domainId).toBe('circle1');
  });
});
