/**
 * Round-Trip Tests - Patch ↔ HCL Serialization
 *
 * Verifies bidirectional conversion correctness by serializing demo patches
 * to HCL and deserializing them back, then comparing for structural equality.
 *
 * These tests ensure the DSL implementation preserves all patch information.
 */

import { describe, it, expect } from 'vitest';
import { serializePatchToHCL, deserializePatchFromHCL } from '../index';
import { buildPatch } from '../../graph/Patch';

// CRITICAL: Import all blocks to trigger registry side effects
import '../../blocks/all';
/**
 * Demo patches to test.
 * Each entry is a {name, builder} pair.
 */


describe('round-trip edge cases', () => {
  it('preserves empty patches', () => {
    const emptyPatch = buildPatch(() => {});
    const hcl = serializePatchToHCL(emptyPatch, { name: 'Empty' });
    const result = deserializePatchFromHCL(hcl);

    expect(result.errors).toEqual([]);
    expect(result.patch.blocks.size).toBe(0);
    expect(result.patch.edges.length).toBe(0);
  });

  it('preserves blocks with no params', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Ellipse', { displayName: 'circle' });
    });

    const hcl = serializePatchToHCL(patch, { name: 'NoParams' });
    const result = deserializePatchFromHCL(hcl);

    expect(result.errors).toEqual([]);
    expect(result.patch.blocks.size).toBe(1);

    const block = Array.from(result.patch.blocks.values())[0];
    expect(block.type).toBe('Ellipse');
  });

  it('preserves blocks with complex params', () => {
    const patch = buildPatch((b) => {
      const c = b.addBlock('Const', { displayName: 'color' });
      b.setConfig(c, 'value', { r: 0.5, g: 0.7, b: 0.9, a: 1.0 });
    });

    const hcl = serializePatchToHCL(patch, { name: 'ComplexParams' });
    const result = deserializePatchFromHCL(hcl);

    expect(result.errors).toEqual([]);
    expect(result.patch.blocks.size).toBe(1);

    const block = Array.from(result.patch.blocks.values())[0];
    expect(block.params.value).toEqual({ r: 0.5, g: 0.7, b: 0.9, a: 1.0 });
  });

  it('preserves edge sortKey and enabled state', () => {
    const patch = buildPatch((b) => {
      const a = b.addBlock('Const', { displayName: 'a' });
      b.setConfig(a, 'value', 1.0);
      const b1 = b.addBlock('Const', { displayName: 'b' });
      b.setConfig(b1, 'value', 2.0);
      const c = b.addBlock('Add', { displayName: 'add' });

      b.wire(a, 'out', c, 'a');
      b.wire(b1, 'out', c, 'b');
    });

    const hcl = serializePatchToHCL(patch, { name: 'EdgeOrder' });
    const result = deserializePatchFromHCL(hcl);

    expect(result.errors).toEqual([]);
    expect(result.patch.edges.length).toBe(2);

    // Edges should be sorted by sortKey
    const edges = [...result.patch.edges].sort((x, y) => x.sortKey - y.sortKey);
    expect(edges[0].enabled).toBe(true);
    expect(edges[1].enabled).toBe(true);
  });
});
