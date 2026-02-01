/**
 * CompositeStoreAdapter Tests
 *
 * Verify that CompositeStoreAdapter correctly wraps CompositeEditorStore
 * and preserves MobX reactivity.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { reaction } from 'mobx';
import { CompositeEditorStore } from '../../../stores/CompositeEditorStore';
import { CompositeStoreAdapter } from '../CompositeStoreAdapter';
import type { InternalEdge } from '../../../blocks/composite-types';

// Import blocks to trigger registration
import '../../../blocks/all';


describe('CompositeStoreAdapter', () => {
  let store: CompositeEditorStore;
  let adapter: CompositeStoreAdapter;

  beforeEach(() => {
    store = new CompositeEditorStore();
    adapter = new CompositeStoreAdapter(store);
  });

  describe('blocks getter', () => {
    it('exposes internal blocks from CompositeEditorStore', () => {
      store.addBlock('Const', { x: 0, y: 0 });
      expect(adapter.blocks.size).toBe(1);

      const block = Array.from(adapter.blocks.values())[0];
      expect(block.type).toBe('Const');
    });

    it('transforms InternalBlockState to BlockLike format', () => {
      const id = store.addBlock('Oscillator', { x: 100, y: 200 });
      const blockLike = adapter.blocks.get(id);

      expect(blockLike).toBeDefined();
      expect(blockLike?.id).toBe(id);
      expect(blockLike?.type).toBe('Oscillator');
      expect(blockLike?.displayName).toBe('Oscillator'); // Uses block def label
      expect(blockLike?.params).toEqual({});
      expect(blockLike?.inputPorts).toBeInstanceOf(Map);
      expect(blockLike?.outputPorts).toBeInstanceOf(Map);
    });

    it('uses displayName if set on internal block', () => {
      const id = store.addBlock('Const', { x: 0, y: 0 });
      // Manually update internal block to set displayName
      const block = store.internalBlocks.get(id);
      if (block) {
        store.internalBlocks.set(id, { ...block, displayName: 'Custom Name' });
      }

      const blockLike = adapter.blocks.get(id);
      expect(blockLike?.displayName).toBe('Custom Name');
    });

    it('derives ports from block definition', () => {
      const id = store.addBlock('Add', { x: 0, y: 0 });
      const blockLike = adapter.blocks.get(id);

      expect(blockLike?.inputPorts.has('a')).toBe(true);
      expect(blockLike?.inputPorts.has('b')).toBe(true);
      expect(blockLike?.outputPorts.has('out')).toBe(true);
    });

    it('is MobX-observable', async () => {
      let callCount = 0;

      // MobX reaction fires when blocks changes
      const promise = new Promise<void>((resolve) => {
        const dispose = reaction(
          () => adapter.blocks.size,
          (size) => {
            callCount++;
            if (callCount === 1) {
              expect(size).toBe(1);
              dispose();
              resolve();
            }
          }
        );
      });

      // Trigger change via CompositeEditorStore
      store.addBlock('Const', { x: 0, y: 0 });

      await promise;
    });
  });

  describe('edges getter', () => {
    it('exposes internal edges from CompositeEditorStore', () => {
      const id1 = store.addBlock('Const', { x: 0, y: 0 });
      const id2 = store.addBlock('Add', { x: 100, y: 0 });

      const edge: InternalEdge = {
        fromBlock: id1,
        fromPort: 'out',
        toBlock: id2,
        toPort: 'a',
      };
      store.addEdge(edge);

      expect(adapter.edges.length).toBe(1);
    });

    it('transforms InternalEdge to EdgeLike with synthetic ID', () => {
      const id1 = store.addBlock('Const', { x: 0, y: 0 });
      const id2 = store.addBlock('Add', { x: 100, y: 0 });

      const edge: InternalEdge = {
        fromBlock: id1,
        fromPort: 'out',
        toBlock: id2,
        toPort: 'a',
      };
      store.addEdge(edge);

      const edgeLike = adapter.edges[0];
      expect(edgeLike.sourceBlockId).toBe(id1);
      expect(edgeLike.sourcePortId).toBe('out');
      expect(edgeLike.targetBlockId).toBe(id2);
      expect(edgeLike.targetPortId).toBe('a');
      // ID should be deterministic
      expect(edgeLike.id).toBe(`edge-${id1}-out-${id2}-a`);
    });

    it('is MobX-observable', async () => {
      const id1 = store.addBlock('Const', { x: 0, y: 0 });
      const id2 = store.addBlock('Add', { x: 100, y: 0 });

      let callCount = 0;

      // MobX reaction fires when edges changes
      const promise = new Promise<void>((resolve) => {
        const dispose = reaction(
          () => adapter.edges.length,
          (length) => {
            callCount++;
            if (callCount === 1) {
              expect(length).toBe(1);
              dispose();
              resolve();
            }
          }
        );
      });

      // Trigger change via CompositeEditorStore
      const edge: InternalEdge = {
        fromBlock: id1,
        fromPort: 'out',
        toBlock: id2,
        toPort: 'a',
      };
      store.addEdge(edge);

      await promise;
    });
  });

  describe('addBlock', () => {
    it('adds block via CompositeEditorStore with position', () => {
      const id = adapter.addBlock('Const', { x: 100, y: 200 });

      // Block added to store
      expect(store.internalBlocks.has(id)).toBe(true);

      // Position stored inline
      const block = store.internalBlocks.get(id);
      expect(block?.position).toEqual({ x: 100, y: 200 });
    });
  });

  describe('removeBlock', () => {
    it('removes block from CompositeEditorStore', () => {
      const id = adapter.addBlock('Const', { x: 100, y: 200 });

      adapter.removeBlock(id);

      expect(store.internalBlocks.has(id)).toBe(false);
    });

    it('removes connected edges automatically', () => {
      const id1 = adapter.addBlock('Const', { x: 0, y: 0 });
      const id2 = adapter.addBlock('Add', { x: 100, y: 0 });

      adapter.addEdge(id1, 'out', id2, 'a');
      expect(adapter.edges.length).toBe(1);

      adapter.removeBlock(id1);
      expect(adapter.edges.length).toBe(0);
    });
  });

  describe('getBlockPosition / setBlockPosition', () => {
    it('reads position from InternalBlockState', () => {
      const id = adapter.addBlock('Const', { x: 50, y: 75 });

      expect(adapter.getBlockPosition(id)).toEqual({ x: 50, y: 75 });
    });

    it('updates position via CompositeEditorStore', () => {
      const id = adapter.addBlock('Const', { x: 0, y: 0 });

      adapter.setBlockPosition(id, { x: 100, y: 150 });

      expect(adapter.getBlockPosition(id)).toEqual({ x: 100, y: 150 });
      const block = store.internalBlocks.get(id);
      expect(block?.position).toEqual({ x: 100, y: 150 });
    });
  });

  describe('addEdge', () => {
    it('adds edge via CompositeEditorStore', () => {
      const id1 = store.addBlock('Const', { x: 0, y: 0 });
      const id2 = store.addBlock('Add', { x: 100, y: 0 });

      const edgeId = adapter.addEdge(id1, 'out', id2, 'a');

      expect(store.internalEdges.length).toBe(1);
      expect(edgeId).toBe(`edge-${id1}-out-${id2}-a`);
    });
  });

  describe('removeEdge', () => {
    it('removes edge via CompositeEditorStore using synthetic ID', () => {
      const id1 = store.addBlock('Const', { x: 0, y: 0 });
      const id2 = store.addBlock('Add', { x: 100, y: 0 });

      const edgeId = adapter.addEdge(id1, 'out', id2, 'a');
      expect(store.internalEdges.length).toBe(1);

      adapter.removeEdge(edgeId);
      expect(store.internalEdges.length).toBe(0);
    });

    it('handles invalid edge IDs gracefully', () => {
      // Should not throw
      adapter.removeEdge('invalid-id');
      adapter.removeEdge('edge-only-three-parts');
    });
  });

  describe('optional operations', () => {
    it('does not implement updateBlockParams (composite restriction)', () => {
      // Type assertion to check the property doesn't exist
      const anyAdapter = adapter as any;
      expect(anyAdapter.updateBlockParams).toBeUndefined();
    });

    it('does not implement updateBlockDisplayName (composite restriction)', () => {
      const anyAdapter = adapter as any;
      expect(anyAdapter.updateBlockDisplayName).toBeUndefined();
    });

    it('does not implement updateInputPort (composite restriction)', () => {
      const anyAdapter = adapter as any;
      expect(anyAdapter.updateInputPort).toBeUndefined();
    });

    it('does not implement updateInputPortCombineMode (composite restriction)', () => {
      const anyAdapter = adapter as any;
      expect(anyAdapter.updateInputPortCombineMode).toBeUndefined();
    });
  });
});
