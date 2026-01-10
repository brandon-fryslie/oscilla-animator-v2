/**
 * SelectionStore Tests
 *
 * Verify SelectionStore derives state from PatchStore without duplication.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PatchStore } from '../PatchStore';
import { SelectionStore } from '../SelectionStore';
import type { Endpoint } from '../../graph/Patch';

describe('SelectionStore', () => {
  let patchStore: PatchStore;
  let selectionStore: SelectionStore;

  beforeEach(() => {
    patchStore = new PatchStore();
    selectionStore = new SelectionStore(patchStore);
  });

  describe('block selection', () => {
    it('should select a block by ID', () => {
      const id = patchStore.addBlock('Oscillator');

      selectionStore.selectBlock(id);

      expect(selectionStore.selectedBlockId).toBe(id);
      expect(selectionStore.selectedBlock).toBeDefined();
      expect(selectionStore.selectedBlock?.id).toBe(id);
    });

    it('should clear edge selection when selecting block', () => {
      const blockId = patchStore.addBlock('Source');
      const targetId = patchStore.addBlock('Target');

      const from: Endpoint = { kind: 'port', blockId, slotId: 'out' };
      const to: Endpoint = { kind: 'port', blockId: targetId, slotId: 'in' };
      const edgeId = patchStore.addEdge(from, to);

      selectionStore.selectEdge(edgeId);
      expect(selectionStore.selectedEdgeId).toBe(edgeId);

      selectionStore.selectBlock(blockId);
      expect(selectionStore.selectedBlockId).toBe(blockId);
      expect(selectionStore.selectedEdgeId).toBe(null);
    });

    it('should return undefined if selected block was deleted', () => {
      const id = patchStore.addBlock('Oscillator');
      selectionStore.selectBlock(id);

      expect(selectionStore.selectedBlock).toBeDefined();

      patchStore.removeBlock(id);

      // Selection ID still set, but derived block is undefined
      expect(selectionStore.selectedBlockId).toBe(id);
      expect(selectionStore.selectedBlock).toBeUndefined();
    });
  });

  describe('edge selection', () => {
    it('should select an edge by ID', () => {
      const id1 = patchStore.addBlock('Source');
      const id2 = patchStore.addBlock('Target');

      const from: Endpoint = { kind: 'port', blockId: id1, slotId: 'out' };
      const to: Endpoint = { kind: 'port', blockId: id2, slotId: 'in' };
      const edgeId = patchStore.addEdge(from, to);

      selectionStore.selectEdge(edgeId);

      expect(selectionStore.selectedEdgeId).toBe(edgeId);
      expect(selectionStore.selectedEdge).toBeDefined();
      expect(selectionStore.selectedEdge?.id).toBe(edgeId);
    });

    it('should clear block selection when selecting edge', () => {
      const blockId = patchStore.addBlock('Block');

      const id1 = patchStore.addBlock('Source');
      const id2 = patchStore.addBlock('Target');

      const from: Endpoint = { kind: 'port', blockId: id1, slotId: 'out' };
      const to: Endpoint = { kind: 'port', blockId: id2, slotId: 'in' };
      const edgeId = patchStore.addEdge(from, to);

      selectionStore.selectBlock(blockId);
      expect(selectionStore.selectedBlockId).toBe(blockId);

      selectionStore.selectEdge(edgeId);
      expect(selectionStore.selectedEdgeId).toBe(edgeId);
      expect(selectionStore.selectedBlockId).toBe(null);
    });

    it('should return undefined if selected edge was deleted', () => {
      const id1 = patchStore.addBlock('Source');
      const id2 = patchStore.addBlock('Target');

      const from: Endpoint = { kind: 'port', blockId: id1, slotId: 'out' };
      const to: Endpoint = { kind: 'port', blockId: id2, slotId: 'in' };
      const edgeId = patchStore.addEdge(from, to);

      selectionStore.selectEdge(edgeId);
      expect(selectionStore.selectedEdge).toBeDefined();

      patchStore.removeEdge(edgeId);

      // Selection ID still set, but derived edge is undefined
      expect(selectionStore.selectedEdgeId).toBe(edgeId);
      expect(selectionStore.selectedEdge).toBeUndefined();
    });
  });

  describe('hover state', () => {
    it('should set hovered block', () => {
      const id = patchStore.addBlock('Oscillator');

      selectionStore.hoverBlock(id);

      expect(selectionStore.hoveredBlockId).toBe(id);
      expect(selectionStore.hoveredBlock).toBeDefined();
      expect(selectionStore.hoveredBlock?.id).toBe(id);
    });

    it('should set hovered port', () => {
      const id = patchStore.addBlock('Oscillator');
      const portRef = { blockId: id, portId: 'frequency' as any };

      selectionStore.hoverPort(portRef);

      expect(selectionStore.hoveredPortRef).toEqual(portRef);
    });

    it('should return undefined if hovered block was deleted', () => {
      const id = patchStore.addBlock('Oscillator');
      selectionStore.hoverBlock(id);

      expect(selectionStore.hoveredBlock).toBeDefined();

      patchStore.removeBlock(id);

      expect(selectionStore.hoveredBlockId).toBe(id);
      expect(selectionStore.hoveredBlock).toBeUndefined();
    });
  });

  describe('clearSelection', () => {
    it('should clear all selection state', () => {
      const blockId = patchStore.addBlock('Block');
      const id1 = patchStore.addBlock('Source');
      const id2 = patchStore.addBlock('Target');

      const from: Endpoint = { kind: 'port', blockId: id1, slotId: 'out' };
      const to: Endpoint = { kind: 'port', blockId: id2, slotId: 'in' };
      const edgeId = patchStore.addEdge(from, to);

      selectionStore.selectBlock(blockId);
      selectionStore.hoverBlock(blockId);
      selectionStore.hoverPort({ blockId, portId: 'out' as any });

      selectionStore.clearSelection();

      expect(selectionStore.selectedBlockId).toBe(null);
      expect(selectionStore.selectedEdgeId).toBe(null);
      expect(selectionStore.hoveredBlockId).toBe(null);
      expect(selectionStore.hoveredPortRef).toBe(null);
    });
  });

  describe('derivation from PatchStore', () => {
    it('should derive selectedBlock from PatchStore', () => {
      const id = patchStore.addBlock('Oscillator', { frequency: 440 });
      selectionStore.selectBlock(id);

      // Verify we're getting the same object reference from PatchStore
      expect(selectionStore.selectedBlock).toBe(patchStore.blocks.get(id));
    });

    it('should reactively update when block params change', () => {
      const id = patchStore.addBlock('Oscillator', { frequency: 440 });
      selectionStore.selectBlock(id);

      expect(selectionStore.selectedBlock?.params.frequency).toBe(440);

      patchStore.updateBlockParams(id, { frequency: 880 });

      expect(selectionStore.selectedBlock?.params.frequency).toBe(880);
    });
  });
});
