/**
 * PatchStoreAdapter Tests
 *
 * Verify that PatchStoreAdapter correctly wraps PatchStore + LayoutStore
 * and preserves MobX reactivity.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { reaction } from 'mobx';
import { PatchStore } from '../../../stores/PatchStore';
import { LayoutStore } from '../../../stores/LayoutStore';
import { PatchStoreAdapter } from '../PatchStoreAdapter';

// Import blocks to ensure they're registered
import '../../../blocks/signal-blocks';
import '../../../blocks/math-blocks';

describe('PatchStoreAdapter', () => {
  let patchStore: PatchStore;
  let layoutStore: LayoutStore;
  let adapter: PatchStoreAdapter;

  beforeEach(() => {
    patchStore = new PatchStore();
    layoutStore = new LayoutStore();
    adapter = new PatchStoreAdapter(patchStore, layoutStore);
  });

  describe('blocks getter', () => {
    it('exposes blocks from PatchStore', () => {
      patchStore.addBlock('Const', { value: 1 });
      expect(adapter.blocks.size).toBe(1);

      const block = Array.from(adapter.blocks.values())[0];
      expect(block.type).toBe('Const');
      expect(block.params.value).toBe(1);
    });

    it('transforms Block to BlockLike format', () => {
      const id = patchStore.addBlock('Oscillator', { frequency: 440 });
      const blockLike = adapter.blocks.get(id);

      expect(blockLike).toBeDefined();
      expect(blockLike?.id).toBe(id);
      expect(blockLike?.type).toBe('Oscillator');
      expect(blockLike?.displayName).toBe('Oscillator 1'); // Auto-generated
      // Config defaults (mode: 0) are merged with provided params
      expect(blockLike?.params).toEqual({ mode: 0, frequency: 440 });
      expect(blockLike?.inputPorts).toBeInstanceOf(Map);
      expect(blockLike?.outputPorts).toBeInstanceOf(Map);
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

      // Trigger change via PatchStore
      patchStore.addBlock('Const', { value: 1 });

      await promise;
    });
  });

  describe('edges getter', () => {
    it('exposes edges from PatchStore', () => {
      const id1 = patchStore.addBlock('Const', { value: 1 });
      const id2 = patchStore.addBlock('Add', {});

      patchStore.addEdge(
        { kind: 'port', blockId: id1, slotId: 'out' },
        { kind: 'port', blockId: id2, slotId: 'a' }
      );

      expect(adapter.edges.length).toBe(1);
    });

    it('transforms Edge to EdgeLike format', () => {
      const id1 = patchStore.addBlock('Const', { value: 1 });
      const id2 = patchStore.addBlock('Add', {});

      const edgeId = patchStore.addEdge(
        { kind: 'port', blockId: id1, slotId: 'out' },
        { kind: 'port', blockId: id2, slotId: 'a' }
      );

      const edgeLike = adapter.edges[0];
      expect(edgeLike.id).toBe(edgeId);
      expect(edgeLike.sourceBlockId).toBe(id1);
      expect(edgeLike.sourcePortId).toBe('out');
      expect(edgeLike.targetBlockId).toBe(id2);
      expect(edgeLike.targetPortId).toBe('a');
    });

    it('is MobX-observable', async () => {
      const id1 = patchStore.addBlock('Const', { value: 1 });
      const id2 = patchStore.addBlock('Add', {});

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

      // Trigger change via PatchStore
      patchStore.addEdge(
        { kind: 'port', blockId: id1, slotId: 'out' },
        { kind: 'port', blockId: id2, slotId: 'a' }
      );

      await promise;
    });
  });

  describe('addBlock', () => {
    it('adds block via PatchStore and sets position via LayoutStore', () => {
      const id = adapter.addBlock('Const', { x: 100, y: 200 });

      // Block added to PatchStore
      expect(patchStore.blocks.has(id)).toBe(true);

      // Position set in LayoutStore
      const pos = layoutStore.getPosition(id);
      expect(pos).toEqual({ x: 100, y: 200 });
    });
  });

  describe('removeBlock', () => {
    it('removes block from PatchStore and position from LayoutStore', () => {
      const id = adapter.addBlock('Const', { x: 100, y: 200 });

      adapter.removeBlock(id);

      // Block removed from PatchStore
      expect(patchStore.blocks.has(id)).toBe(false);

      // Position removed from LayoutStore
      expect(layoutStore.getPosition(id)).toBeUndefined();
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
    it('reads and writes positions via LayoutStore', () => {
      const id = patchStore.addBlock('Const', { value: 1 });

      // Initially no position
      expect(adapter.getBlockPosition(id)).toBeUndefined();

      // Set position
      adapter.setBlockPosition(id, { x: 50, y: 75 });
      expect(adapter.getBlockPosition(id)).toEqual({ x: 50, y: 75 });

      // Update position
      adapter.setBlockPosition(id, { x: 100, y: 150 });
      expect(adapter.getBlockPosition(id)).toEqual({ x: 100, y: 150 });
    });
  });

  describe('addEdge', () => {
    it('adds edge via PatchStore', () => {
      const id1 = patchStore.addBlock('Const', { value: 1 });
      const id2 = patchStore.addBlock('Add', {});

      const edgeId = adapter.addEdge(id1, 'out', id2, 'a');

      expect(patchStore.edges.length).toBe(1);
      expect(patchStore.edges[0].id).toBe(edgeId);
    });
  });

  describe('removeEdge', () => {
    it('removes edge via PatchStore', () => {
      const id1 = patchStore.addBlock('Const', { value: 1 });
      const id2 = patchStore.addBlock('Add', {});

      const edgeId = adapter.addEdge(id1, 'out', id2, 'a');
      expect(patchStore.edges.length).toBe(1);

      adapter.removeEdge(edgeId);
      expect(patchStore.edges.length).toBe(0);
    });
  });

  describe('optional operations', () => {
    it('updateBlockParams delegates to PatchStore', () => {
      const id = patchStore.addBlock('Const', { value: 1 });

      adapter.updateBlockParams?.(id, { value: 42 });

      const block = patchStore.blocks.get(id);
      expect(block?.params.value).toBe(42);
    });

    it('updateBlockDisplayName delegates to PatchStore', () => {
      const id = patchStore.addBlock('Const', { value: 1 });

      const result = adapter.updateBlockDisplayName?.(id, 'My Const');

      expect(result?.error).toBeUndefined();
      const block = patchStore.blocks.get(id);
      expect(block?.displayName).toBe('My Const');
    });

    it('updateInputPort delegates to PatchStore', () => {
      const id = patchStore.addBlock('Add', {});

      adapter.updateInputPort?.(id, 'a', { combineMode: 'mul' });

      const block = patchStore.blocks.get(id);
      const port = block?.inputPorts.get('a');
      expect(port?.combineMode).toBe('mul');
    });

    it('updateInputPortCombineMode delegates to PatchStore', () => {
      const id = patchStore.addBlock('Add', {});

      adapter.updateInputPortCombineMode?.(id, 'a', 'sum');

      const block = patchStore.blocks.get(id);
      const port = block?.inputPorts.get('a');
      expect(port?.combineMode).toBe('sum');
    });
  });
});
