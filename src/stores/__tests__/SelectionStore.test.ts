/**
 * SelectionStore Tests
 *
 * Verify SelectionStore derives state from PatchStore without duplication.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PatchStore } from '../PatchStore';
import { SelectionStore } from '../SelectionStore';
import type { Endpoint } from '../../graph/Patch';

// Import blocks to ensure they're registered
import '../../blocks/signal-blocks';
import '../../blocks/math-blocks';

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
      const blockId = patchStore.addBlock('Oscillator');
      const targetId = patchStore.addBlock('Add');

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
      const id1 = patchStore.addBlock('Oscillator');
      const id2 = patchStore.addBlock('Add');

      const from: Endpoint = { kind: 'port', blockId: id1, slotId: 'out' };
      const to: Endpoint = { kind: 'port', blockId: id2, slotId: 'in' };
      const edgeId = patchStore.addEdge(from, to);

      selectionStore.selectEdge(edgeId);

      expect(selectionStore.selectedEdgeId).toBe(edgeId);
      expect(selectionStore.selectedEdge).toBeDefined();
      expect(selectionStore.selectedEdge?.id).toBe(edgeId);
    });

    it('should clear block selection when selecting edge', () => {
      const blockId = patchStore.addBlock('Oscillator');

      const id1 = patchStore.addBlock('Oscillator');
      const id2 = patchStore.addBlock('Add');

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
      const id1 = patchStore.addBlock('Oscillator');
      const id2 = patchStore.addBlock('Add');

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
      const blockId = patchStore.addBlock('Oscillator');
      const id1 = patchStore.addBlock('Oscillator');
      const id2 = patchStore.addBlock('Add');

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

  describe('emphasis patterns - related blocks and edges', () => {
    it('should compute relatedBlockIds for upstream connections', () => {
      // Create: sourceA -> target, sourceB -> target
      const sourceA = patchStore.addBlock('Oscillator');
      const sourceB = patchStore.addBlock('Oscillator');
      const target = patchStore.addBlock('Add');

      const fromA: Endpoint = { kind: 'port', blockId: sourceA, slotId: 'out' };
      const fromB: Endpoint = { kind: 'port', blockId: sourceB, slotId: 'out' };
      const toTarget: Endpoint = { kind: 'port', blockId: target, slotId: 'in' };

      patchStore.addEdge(fromA, toTarget);
      patchStore.addEdge(fromB, toTarget);

      // Select target
      selectionStore.selectBlock(target);

      // Should find both upstream sources
      const related = selectionStore.relatedBlockIds;
      expect(related.size).toBe(2);
      expect(related.has(sourceA)).toBe(true);
      expect(related.has(sourceB)).toBe(true);
    });

    it('should compute relatedBlockIds for downstream connections', () => {
      // Create: source -> targetA, source -> targetB
      const source = patchStore.addBlock('Oscillator');
      const targetA = patchStore.addBlock('Add');
      const targetB = patchStore.addBlock('Add');

      const fromSource: Endpoint = { kind: 'port', blockId: source, slotId: 'out' };
      const toA: Endpoint = { kind: 'port', blockId: targetA, slotId: 'in' };
      const toB: Endpoint = { kind: 'port', blockId: targetB, slotId: 'in' };

      patchStore.addEdge(fromSource, toA);
      patchStore.addEdge(fromSource, toB);

      // Select source
      selectionStore.selectBlock(source);

      // Should find both downstream targets
      const related = selectionStore.relatedBlockIds;
      expect(related.size).toBe(2);
      expect(related.has(targetA)).toBe(true);
      expect(related.has(targetB)).toBe(true);
    });

    it('should compute relatedBlockIds for both upstream and downstream', () => {
      // Create: upstream -> middle -> downstream
      const upstream = patchStore.addBlock('Oscillator');
      const middle = patchStore.addBlock('Add');
      const downstream = patchStore.addBlock('Subtract');

      const fromUp: Endpoint = { kind: 'port', blockId: upstream, slotId: 'out' };
      const toMiddle: Endpoint = { kind: 'port', blockId: middle, slotId: 'in' };
      const fromMiddle: Endpoint = { kind: 'port', blockId: middle, slotId: 'out' };
      const toDown: Endpoint = { kind: 'port', blockId: downstream, slotId: 'in' };

      patchStore.addEdge(fromUp, toMiddle);
      patchStore.addEdge(fromMiddle, toDown);

      // Select middle
      selectionStore.selectBlock(middle);

      // Should find both upstream and downstream
      const related = selectionStore.relatedBlockIds;
      expect(related.size).toBe(2);
      expect(related.has(upstream)).toBe(true);
      expect(related.has(downstream)).toBe(true);
    });

    it('should return empty set for relatedBlockIds when no block selected', () => {
      patchStore.addBlock('Oscillator');

      expect(selectionStore.relatedBlockIds.size).toBe(0);
    });

    it('should exclude self-loops from relatedBlockIds', () => {
      // Create a self-loop: block -> block
      const block = patchStore.addBlock('Oscillator');

      const from: Endpoint = { kind: 'port', blockId: block, slotId: 'out' };
      const to: Endpoint = { kind: 'port', blockId: block, slotId: 'in' };

      patchStore.addEdge(from, to);

      selectionStore.selectBlock(block);

      // Self-loops should not be included in related blocks
      expect(selectionStore.relatedBlockIds.size).toBe(0);
    });

    it('should compute relatedEdgeIds', () => {
      // Create: A -> B, B -> C
      const a = patchStore.addBlock('Oscillator');
      const b = patchStore.addBlock('Add');
      const c = patchStore.addBlock('Subtract');

      const fromA: Endpoint = { kind: 'port', blockId: a, slotId: 'out' };
      const toB: Endpoint = { kind: 'port', blockId: b, slotId: 'in' };
      const fromB: Endpoint = { kind: 'port', blockId: b, slotId: 'out' };
      const toC: Endpoint = { kind: 'port', blockId: c, slotId: 'in' };

      const edge1 = patchStore.addEdge(fromA, toB);
      const edge2 = patchStore.addEdge(fromB, toC);

      // Select B
      selectionStore.selectBlock(b);

      // Should find both edges
      const related = selectionStore.relatedEdgeIds;
      expect(related.size).toBe(2);
      expect(related.has(edge1)).toBe(true);
      expect(related.has(edge2)).toBe(true);
    });

    it('should return empty set for relatedEdgeIds when no block selected', () => {
      const a = patchStore.addBlock('Oscillator');
      const b = patchStore.addBlock('Add');

      const from: Endpoint = { kind: 'port', blockId: a, slotId: 'out' };
      const to: Endpoint = { kind: 'port', blockId: b, slotId: 'in' };

      patchStore.addEdge(from, to);

      expect(selectionStore.relatedEdgeIds.size).toBe(0);
    });

    it('should include self-loop edges in relatedEdgeIds', () => {
      // Create a self-loop: block -> block
      const block = patchStore.addBlock('Oscillator');

      const from: Endpoint = { kind: 'port', blockId: block, slotId: 'out' };
      const to: Endpoint = { kind: 'port', blockId: block, slotId: 'in' };

      const edgeId = patchStore.addEdge(from, to);

      selectionStore.selectBlock(block);

      // Self-loop edge SHOULD be included in related edges
      expect(selectionStore.relatedEdgeIds.size).toBe(1);
      expect(selectionStore.relatedEdgeIds.has(edgeId)).toBe(true);
    });

    it('should compute highlightedBlockIds', () => {
      // Create: A -> B -> C
      const a = patchStore.addBlock('Oscillator');
      const b = patchStore.addBlock('Add');
      const c = patchStore.addBlock('Subtract');

      const fromA: Endpoint = { kind: 'port', blockId: a, slotId: 'out' };
      const toB: Endpoint = { kind: 'port', blockId: b, slotId: 'in' };
      const fromB: Endpoint = { kind: 'port', blockId: b, slotId: 'out' };
      const toC: Endpoint = { kind: 'port', blockId: c, slotId: 'in' };

      patchStore.addEdge(fromA, toB);
      patchStore.addEdge(fromB, toC);

      // Select B
      selectionStore.selectBlock(b);

      // Should highlight B (selected) + A and C (related)
      const highlighted = selectionStore.highlightedBlockIds;
      expect(highlighted.size).toBe(3);
      expect(highlighted.has(a)).toBe(true);
      expect(highlighted.has(b)).toBe(true);
      expect(highlighted.has(c)).toBe(true);
    });

    it('should compute highlightedEdgeIds', () => {
      // Create: A -> B, B -> C, C -> D
      const a = patchStore.addBlock('Oscillator');
      const b = patchStore.addBlock('Add');
      const c = patchStore.addBlock('Subtract');
      const d = patchStore.addBlock('Multiply');

      const fromA: Endpoint = { kind: 'port', blockId: a, slotId: 'out' };
      const toB: Endpoint = { kind: 'port', blockId: b, slotId: 'in' };
      const fromB: Endpoint = { kind: 'port', blockId: b, slotId: 'out' };
      const toC: Endpoint = { kind: 'port', blockId: c, slotId: 'in' };
      const fromC: Endpoint = { kind: 'port', blockId: c, slotId: 'out' };
      const toD: Endpoint = { kind: 'port', blockId: d, slotId: 'in' };

      const edge1 = patchStore.addEdge(fromA, toB);
      const edge2 = patchStore.addEdge(fromB, toC);
      const edge3 = patchStore.addEdge(fromC, toD);

      // Select B
      selectionStore.selectBlock(b);

      // Should highlight edges involving B
      const highlighted = selectionStore.highlightedEdgeIds;
      expect(highlighted.size).toBe(2);
      expect(highlighted.has(edge1)).toBe(true);
      expect(highlighted.has(edge2)).toBe(true);
      expect(highlighted.has(edge3)).toBe(false);
    });

    it('should return empty sets for highlighted IDs when no block selected', () => {
      patchStore.addBlock('Oscillator');

      expect(selectionStore.highlightedBlockIds.size).toBe(0);
      expect(selectionStore.highlightedEdgeIds.size).toBe(0);
    });
  });
});
