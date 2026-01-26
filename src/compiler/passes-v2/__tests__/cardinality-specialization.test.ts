/**
 * Cardinality Specialization Tests
 *
 * Tests for compile-time cardinality specialization logic.
 */

import { describe, it, expect } from 'vitest';

// Import the specialization functions (these are internal, but we can test via the module)
// For now, we test indirectly via the compilation pipeline

import { compile } from '../../compile';
import { signalType, signalTypeField } from '../../../core/canonical-types';
import { isCardinalityGeneric } from '../../../blocks/registry';
import { buildPatch } from '../../../graph/Patch';

// Import blocks to ensure registry is populated
import '../../../blocks/math-blocks';
import '../../../blocks/signal-blocks';
import '../../../blocks/time-blocks';
import '../../../blocks/field-blocks';
import '../../../blocks/render-blocks';
import '../../../blocks/array-blocks';

describe('Cardinality Specialization', () => {
  describe('Type compatibility', () => {
    it('allows Signal+Signal connections for preserve blocks', () => {
      // This is already handled by existing type checking
      // Just verify the compilation path works
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
        const const1 = b.addBlock('Const', { value: 1 });
        const const2 = b.addBlock('Const', { value: 2 });
        const add = b.addBlock('Add', {});
        b.wire(const1, 'out', add, 'a');
        b.wire(const2, 'out', add, 'b');
      });

      // Should compile successfully
      const result = compile(patch);
      expect(result.kind).toBe('ok');
    });

    it('rejects unknown block types', () => {
      // This tests that the compiler correctly rejects unknown block types
      // Use the buildPatch API but create an invalid block manually
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
        b.addBlock('Const', { value: 1 });
      });

      // Add an invalid block manually
      patch.blocks.set('invalid', {
        id: 'invalid',
        type: 'NonExistentBlockType',
        params: {},
        displayName: null,
        domainId: null,
        role: { kind: 'user', meta: {} },
        inputPorts: new Map(),
        outputPorts: new Map(),
      });

      // Should fail to compile due to unknown block type
      const result = compile(patch);
      expect(result.kind).toBe('error');
    });
  });

  describe('Cardinality metadata query', () => {
    it('isCardinalityGeneric returns true for Add', () => {
      expect(isCardinalityGeneric('Add')).toBe(true);
    });

    it('isCardinalityGeneric returns false for signalOnly blocks', () => {
      expect(isCardinalityGeneric('InfiniteTimeRoot')).toBe(false);
    });

    it('isCardinalityGeneric returns false for fieldOnly blocks', () => {
      expect(isCardinalityGeneric('RenderInstances2D')).toBe(false);
    });

    it('isCardinalityGeneric returns false for transform blocks', () => {
      expect(isCardinalityGeneric('Array')).toBe(false);
    });
  });
});
