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

// Import demo patch builders
import { patchSimple } from '../../demo/simple';
import { patchGoldenSpiral } from '../../demo/golden-spiral';
import { patchMouseSpiral } from '../../demo/mouse-spiral';
import { patchDomainTest } from '../../demo/domain-test';
import { patchTileGrid, patchTileGridUV } from '../../demo/tile-grid';
import { patchPerspectiveCamera } from '../../demo/perspective-camera';
import { patchFeedbackSimple } from '../../demo/feedback-simple';
import { patchFeedbackRotation } from '../../demo/feedback-rotation';
import { patchPathFieldDemo } from '../../demo/path-field-demo';
import { patchErrorIsolationDemo } from '../../demo/error-isolation-demo';
import { patchRectMosaic } from '../../demo/rect-mosaic';
// NOTE: patchShapeKaleidoscope is commented out in the source file

/**
 * Demo patches to test.
 * Each entry is a {name, builder} pair.
 */
const DEMO_PATCHES = [
  { name: 'simple', builder: patchSimple },
  { name: 'golden-spiral', builder: patchGoldenSpiral },
  { name: 'mouse-spiral', builder: patchMouseSpiral },
  { name: 'domain-test', builder: patchDomainTest },
  { name: 'tile-grid', builder: patchTileGrid },
  { name: 'tile-grid-uv', builder: patchTileGridUV },
  { name: 'perspective-camera', builder: patchPerspectiveCamera },
  { name: 'feedback-simple', builder: patchFeedbackSimple },
  { name: 'feedback-rotation', builder: patchFeedbackRotation },
  { name: 'path-field-demo', builder: patchPathFieldDemo },
  { name: 'error-isolation-demo', builder: patchErrorIsolationDemo },
  { name: 'rect-mosaic', builder: patchRectMosaic },
  // shape-kaleidoscope is commented out in source
];

describe('round-trip serialization', () => {
  for (const { name, builder } of DEMO_PATCHES) {
    it(`round-trips ${name}`, () => {
      // Build original patch from demo builder
      const patch1 = buildPatch(builder);

      // Serialize to HCL
      const hcl = serializePatchToHCL(patch1, { name });

      // Verify HCL is non-empty
      expect(hcl).toBeTruthy();
      expect(hcl).toContain('patch');

      // Deserialize back to Patch
      const result = deserializePatchFromHCL(hcl);

      // Verify no errors or warnings
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);

      // Verify structural equality by comparing serialized HCL strings
      // This works because serializePatchToHCL is deterministic (sorted blocks/edges)
      // BlockIds will differ, but if serialization is deterministic, HCL should match
      const hcl2 = serializePatchToHCL(result.patch, { name });
      expect(hcl2).toBe(hcl);
    });
  }
});

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
      b.addBlock('Ellipse', {}, { displayName: 'circle' });
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
      b.addBlock('Const', {
        value: { r: 0.5, g: 0.7, b: 0.9, a: 1.0 },
      }, { displayName: 'color' });
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
      const a = b.addBlock('Const', { value: 1.0 }, { displayName: 'a' });
      const b1 = b.addBlock('Const', { value: 2.0 }, { displayName: 'b' });
      const c = b.addBlock('Add', {}, { displayName: 'add' });

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
