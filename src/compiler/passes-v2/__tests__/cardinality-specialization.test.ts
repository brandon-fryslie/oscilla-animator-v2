/**
 * Cardinality Specialization Tests
 *
 * Tests for compile-time cardinality specialization logic.
 */

import { describe, it, expect } from 'vitest';

// Import the specialization functions (these are internal, but we can test via the module)
// For now, we test indirectly via the compilation pipeline

import { pass2TypeGraph } from '../pass2-types';
import type { NormalizedPatch } from '../../ir/patches';
import { signalType, signalTypeField } from '../../../core/canonical-types';
import { isCardinalityGeneric } from '../../../blocks/registry';

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
      const patch: NormalizedPatch = {
        blocks: [
          { id: 'time', type: 'InfiniteTimeRoot', params: {}, position: { x: 0, y: 0 } },
          { id: 'const1', type: 'Const', params: { value: 1, payloadType: 'float' }, position: { x: 0, y: 0 } },
          { id: 'const2', type: 'Const', params: { value: 2, payloadType: 'float' }, position: { x: 0, y: 0 } },
          { id: 'add', type: 'Add', params: {}, position: { x: 0, y: 0 } },
        ],
        edges: [
          { fromBlock: 1, fromPort: 'out', toBlock: 3, toPort: 'a' },
          { fromBlock: 2, fromPort: 'out', toBlock: 3, toPort: 'b' },
        ],
        timeRoot: 0,
        revision: 1,
      };

      // Should not throw
      expect(() => pass2TypeGraph(patch)).not.toThrow();
    });

    it('rejects invalid port connections', () => {
      // This tests that the type checker correctly rejects invalid connections
      const patch: NormalizedPatch = {
        blocks: [
          { id: 'time', type: 'InfiniteTimeRoot', params: {}, position: { x: 0, y: 0 } },
          { id: 'const', type: 'Const', params: { value: 1, payloadType: 'float' }, position: { x: 0, y: 0 } },
          // FieldAdd expects Field inputs, not Signal
          { id: 'fieldAdd', type: 'FieldAdd', params: {}, position: { x: 0, y: 0 } },
        ],
        edges: [
          // Trying to connect to non-existent port - should fail
          { fromBlock: 1, fromPort: 'out', toBlock: 2, toPort: 'a' },
        ],
        timeRoot: 0,
        revision: 1,
      };

      // Should throw due to port/type issues
      expect(() => pass2TypeGraph(patch)).toThrow();
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
