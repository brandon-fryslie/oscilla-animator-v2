/**
 * Tests for Pass 0: Payload Type Resolution
 *
 * Tests the inference rules for payload-generic blocks:
 * 1. Generic ports can infer from non-generic ports (concrete types)
 * 2. Two generic ports cannot infer from each other
 * 3. Forward resolution: generic output → non-generic target input
 * 4. Backward resolution: non-generic source output → generic input
 */

import { describe, it, expect } from 'vitest';
import { pass0PayloadResolution } from '../pass0-payload-resolution';
import type { NormalizedPatch, BlockIndex } from '../../ir/patches';
import type { Block } from '../../../graph/Patch';

// Import block registrations
import '../../../blocks/primitive-blocks';
import '../../../blocks/array-blocks';
import '../../../blocks/field-blocks';
import '../../../blocks/field-operations-blocks';
import '../../../blocks/signal-blocks';
import '../../../blocks/color-blocks';

/**
 * Helper to create a minimal normalized patch for testing
 */
function createNormalizedPatch(
  blocks: Block[],
  edges: Array<{ fromBlock: number; fromPort: string; toBlock: number; toPort: string }>
): NormalizedPatch {
  return {
    blocks,
    edges: edges.map(e => ({
      fromBlock: e.fromBlock as BlockIndex,
      fromPort: e.fromPort,
      toBlock: e.toBlock as BlockIndex,
      toPort: e.toPort,
    })),
    blockIndex: new Map(blocks.map((b, i) => [b.id, i as BlockIndex])),
  };
}

describe('Pass 0: Payload Resolution', () => {
  describe('Backward resolution (source output → generic input)', () => {
    it('infers payload from non-generic source (Ellipse.shape → Array.element)', () => {
      // Ellipse outputs shape (non-generic, always 'shape')
      // Array.element is generic (accepts any payload)
      // Should infer Array's payloadType = 'shape'
      const blocks: Block[] = [
        { id: 'ellipse', type: 'Ellipse', params: {}, position: { x: 0, y: 0 } },
        { id: 'array', type: 'Array', params: { count: 10 }, position: { x: 100, y: 0 } },
      ];
      const edges = [
        { fromBlock: 0, fromPort: 'shape', toBlock: 1, toPort: 'element' },
      ];

      const normalized = createNormalizedPatch(blocks, edges);
      const result = pass0PayloadResolution(normalized);

      const arrayBlock = result.blocks.find(b => b.id === 'array');
      expect(arrayBlock?.params.payloadType).toBe('shape');
    });

    it('infers payload from non-generic source (Const.out → Broadcast.signal)', () => {
      // Const outputs float (when payloadType is float)
      // Broadcast.signal is generic
      // Should infer Broadcast's payloadType from Const
      const blocks: Block[] = [
        { id: 'const', type: 'Const', params: { value: 1.0, payloadType: 'float' }, position: { x: 0, y: 0 } },
        { id: 'broadcast', type: 'Broadcast', params: {}, position: { x: 100, y: 0 } },
      ];
      const edges = [
        { fromBlock: 0, fromPort: 'out', toBlock: 1, toPort: 'signal' },
      ];

      const normalized = createNormalizedPatch(blocks, edges);
      const result = pass0PayloadResolution(normalized);

      const broadcastBlock = result.blocks.find(b => b.id === 'broadcast');
      expect(broadcastBlock?.params.payloadType).toBe('float');
    });
  });

  describe('Forward resolution (generic output → non-generic target)', () => {
    it('infers payload from non-generic target input (Const.out → Add.a)', () => {
      // Const is generic, Add.a expects float
      // Should infer Const's payloadType = 'float'
      const blocks: Block[] = [
        { id: 'const', type: 'Const', params: { value: 1.0 }, position: { x: 0, y: 0 } },
        { id: 'add', type: 'Add', params: {}, position: { x: 100, y: 0 } },
      ];
      const edges = [
        { fromBlock: 0, fromPort: 'out', toBlock: 1, toPort: 'a' },
      ];

      const normalized = createNormalizedPatch(blocks, edges);
      const result = pass0PayloadResolution(normalized);

      const constBlock = result.blocks.find(b => b.id === 'const');
      expect(constBlock?.params.payloadType).toBe('float');
    });
  });

  describe('Non-generic ports should not affect inference', () => {
    it('Array.t (always float) connecting to FieldGoldenAngle should NOT change Array payloadType', () => {
      // Array has:
      //   - element input (generic)
      //   - elements output (generic)
      //   - t output (always float, NOT generic)
      //   - index output (always int, NOT generic)
      //
      // When Array.t → FieldGoldenAngle.id01 (float), this should NOT
      // cause Array's payloadType to become 'float' because 't' is not
      // a generic port.
      //
      // If Ellipse.shape → Array.element, payloadType should be 'shape'
      const blocks: Block[] = [
        { id: 'ellipse', type: 'Ellipse', params: {}, position: { x: 0, y: 0 } },
        { id: 'array', type: 'Array', params: { count: 10 }, position: { x: 100, y: 0 } },
        { id: 'golden', type: 'FieldGoldenAngle', params: { turns: 50 }, position: { x: 200, y: 0 } },
      ];
      const edges = [
        { fromBlock: 0, fromPort: 'shape', toBlock: 1, toPort: 'element' },
        { fromBlock: 1, fromPort: 't', toBlock: 2, toPort: 'id01' },
      ];

      const normalized = createNormalizedPatch(blocks, edges);
      const result = pass0PayloadResolution(normalized);

      const arrayBlock = result.blocks.find(b => b.id === 'array');
      // Should be 'shape' from Ellipse, NOT 'float' from FieldGoldenAngle
      expect(arrayBlock?.params.payloadType).toBe('shape');
    });

    it('Array.index (always int) connecting downstream should NOT change Array payloadType', () => {
      const blocks: Block[] = [
        { id: 'ellipse', type: 'Ellipse', params: {}, position: { x: 0, y: 0 } },
        { id: 'array', type: 'Array', params: { count: 10 }, position: { x: 100, y: 0 } },
      ];
      const edges = [
        { fromBlock: 0, fromPort: 'shape', toBlock: 1, toPort: 'element' },
        // Note: no edge from array.index, but if there were one to an int-expecting
        // port, it should not affect payloadType
      ];

      const normalized = createNormalizedPatch(blocks, edges);
      const result = pass0PayloadResolution(normalized);

      const arrayBlock = result.blocks.find(b => b.id === 'array');
      expect(arrayBlock?.params.payloadType).toBe('shape');
    });
  });

  describe('Already resolved payloadType is preserved', () => {
    it('does not override existing payloadType', () => {
      const blocks: Block[] = [
        { id: 'const', type: 'Const', params: { value: 1.0, payloadType: 'vec2' }, position: { x: 0, y: 0 } },
        { id: 'add', type: 'Add', params: {}, position: { x: 100, y: 0 } },
      ];
      const edges = [
        { fromBlock: 0, fromPort: 'out', toBlock: 1, toPort: 'a' },
      ];

      const normalized = createNormalizedPatch(blocks, edges);
      const result = pass0PayloadResolution(normalized);

      const constBlock = result.blocks.find(b => b.id === 'const');
      // Should remain 'vec2', not change to 'float' from Add.a
      expect(constBlock?.params.payloadType).toBe('vec2');
    });
  });

  describe('No inference when no edges to generic ports', () => {
    it('leaves payloadType undefined when generic block has no relevant edges', () => {
      const blocks: Block[] = [
        { id: 'const', type: 'Const', params: { value: 1.0 }, position: { x: 0, y: 0 } },
        // No edges
      ];

      const normalized = createNormalizedPatch(blocks, []);
      const result = pass0PayloadResolution(normalized);

      const constBlock = result.blocks.find(b => b.id === 'const');
      // Should remain undefined - no inference possible
      expect(constBlock?.params.payloadType).toBeUndefined();
    });
  });
});
