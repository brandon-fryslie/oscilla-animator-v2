/**
 * SelectionStore Tests
 *
 * Verify SelectionStore derives state from PatchStore without duplication.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PatchStore } from '../PatchStore';
import { SelectionStore } from '../SelectionStore';
import type { Endpoint } from '../../graph/Patch';
import { portId } from '../../types';
import { EventHub } from '../../events/EventHub';
import type { EditorEvent } from '../../events/types';

// Import blocks to trigger registration
import '../../blocks/all';


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
      const portRef = { blockId: id, portId: portId('frequency') };

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
      selectionStore.hoverPort({ blockId, portId: portId('out') });

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

  describe('event-based selection cleanup', () => {
    it('should clear block selection when BlockRemoved event fires via handleBlockRemoved', () => {
      const blockId = patchStore.addBlock('Oscillator');
      selectionStore.selectBlock(blockId);

      expect(selectionStore.selectedBlockId).toBe(blockId);

      // Simulate BlockRemoved event handler
      selectionStore.handleBlockRemoved(blockId);

      expect(selectionStore.selectedBlockId).toBe(null);
    });

    it('should clear edge selection when EdgeRemoved event fires via handleEdgeRemoved', () => {
      const blockId = patchStore.addBlock('Oscillator');
      const targetId = patchStore.addBlock('Add');

      const from: Endpoint = { kind: 'port', blockId, slotId: 'out' };
      const to: Endpoint = { kind: 'port', blockId: targetId, slotId: 'in' };
      const edgeId = patchStore.addEdge(from, to);

      selectionStore.selectEdge(edgeId);
      expect(selectionStore.selectedEdgeId).toBe(edgeId);

      // Simulate EdgeRemoved event handler
      selectionStore.handleEdgeRemoved(edgeId);

      expect(selectionStore.selectedEdgeId).toBe(null);
    });

    it('should clear hover state when BlockRemoved event fires', () => {
      const blockId = patchStore.addBlock('Oscillator');
      selectionStore.hoverBlock(blockId);

      expect(selectionStore.hoveredBlockId).toBe(blockId);

      selectionStore.handleBlockRemoved(blockId);

      expect(selectionStore.hoveredBlockId).toBe(null);
    });

    it('should clear port selection when parent block is removed', () => {
      const blockId = patchStore.addBlock('Oscillator');
      selectionStore.selectPort(blockId, portId('out'));

      expect(selectionStore.selectedPort?.blockId).toBe(blockId);

      selectionStore.handleBlockRemoved(blockId);

      expect(selectionStore.selectedPort).toBe(null);
    });

    it('should not affect selection if different block is removed', () => {
      const blockId1 = patchStore.addBlock('Oscillator');
      const blockId2 = patchStore.addBlock('Add');

      selectionStore.selectBlock(blockId1);
      expect(selectionStore.selectedBlockId).toBe(blockId1);

      selectionStore.handleBlockRemoved(blockId2);

      expect(selectionStore.selectedBlockId).toBe(blockId1);
    });
  });

  describe('event emission', () => {
    let eventHub: EventHub;
    let capturedEvents: EditorEvent[];

    beforeEach(() => {
      eventHub = new EventHub();
      capturedEvents = [];

      // Capture all events
      eventHub.on('SelectionChanged', (event) => capturedEvents.push(event));
      eventHub.on('HoverChanged', (event) => capturedEvents.push(event));

      // Wire up EventHub
      let revision = 0;
      selectionStore.setEventHub(eventHub, 'test-patch', () => ++revision);
    });

    describe('SelectionChanged events', () => {
      it('should emit SelectionChanged when selecting a block', () => {
        const blockId = patchStore.addBlock('Oscillator');

        selectionStore.selectBlock(blockId);

        expect(capturedEvents).toHaveLength(1);
        expect(capturedEvents[0]).toMatchObject({
          type: 'SelectionChanged',
          patchId: 'test-patch',
          patchRevision: 1,
          selection: { type: 'block', blockId },
          previousSelection: { type: 'none' },
        });
      });

      it('should emit SelectionChanged when selecting an edge', () => {
        const blockId = patchStore.addBlock('Oscillator');
        const targetId = patchStore.addBlock('Add');

        const from: Endpoint = { kind: 'port', blockId, slotId: 'out' };
        const to: Endpoint = { kind: 'port', blockId: targetId, slotId: 'in' };
        const edgeId = patchStore.addEdge(from, to);

        selectionStore.selectEdge(edgeId);

        expect(capturedEvents).toHaveLength(1);
        expect(capturedEvents[0]).toMatchObject({
          type: 'SelectionChanged',
          patchId: 'test-patch',
          patchRevision: 1,
          selection: { type: 'edge', edgeId },
          previousSelection: { type: 'none' },
        });
      });

      it('should emit SelectionChanged when selecting a port', () => {
        const blockId = patchStore.addBlock('Oscillator');
        const portKey = portId('phase');

        selectionStore.selectPort(blockId, portKey);

        expect(capturedEvents).toHaveLength(1);
        expect(capturedEvents[0]).toMatchObject({
          type: 'SelectionChanged',
          patchId: 'test-patch',
          patchRevision: 1,
          selection: { type: 'port', blockId, portKey },
          previousSelection: { type: 'none' },
        });
      });

      it('should include previousSelection when changing selection', () => {
        const blockId1 = patchStore.addBlock('Oscillator');
        const blockId2 = patchStore.addBlock('Add');

        selectionStore.selectBlock(blockId1);
        capturedEvents = []; // Clear first event

        selectionStore.selectBlock(blockId2);

        expect(capturedEvents).toHaveLength(1);
        expect(capturedEvents[0]).toMatchObject({
          type: 'SelectionChanged',
          selection: { type: 'block', blockId: blockId2 },
          previousSelection: { type: 'block', blockId: blockId1 },
        });
      });

      it('should emit SelectionChanged when clearing selection', () => {
        const blockId = patchStore.addBlock('Oscillator');
        selectionStore.selectBlock(blockId);
        capturedEvents = [];

        selectionStore.clearSelection();

        expect(capturedEvents).toHaveLength(1);
        expect(capturedEvents[0]).toMatchObject({
          type: 'SelectionChanged',
          selection: { type: 'none' },
          previousSelection: { type: 'block', blockId },
        });
      });
    });

    describe('HoverChanged events', () => {
      it('should emit HoverChanged when hovering a block', () => {
        const blockId = patchStore.addBlock('Oscillator');

        selectionStore.hoverBlock(blockId);

        expect(capturedEvents).toHaveLength(1);
        expect(capturedEvents[0]).toMatchObject({
          type: 'HoverChanged',
          patchId: 'test-patch',
          patchRevision: 1,
          hovered: { type: 'block', blockId },
        });
      });

      it('should emit HoverChanged with null when clearing block hover', () => {
        const blockId = patchStore.addBlock('Oscillator');
        selectionStore.hoverBlock(blockId);
        capturedEvents = [];

        selectionStore.hoverBlock(null);

        expect(capturedEvents).toHaveLength(1);
        expect(capturedEvents[0]).toMatchObject({
          type: 'HoverChanged',
          hovered: null,
        });
      });

      it('should emit HoverChanged when hovering a port', () => {
        const blockId = patchStore.addBlock('Oscillator');
        const portKey = portId('phase');

        selectionStore.hoverPort({ blockId, portId: portKey });

        expect(capturedEvents).toHaveLength(1);
        const event = capturedEvents[0];
        expect(event.type).toBe('HoverChanged');
        if (event.type === 'HoverChanged') {
          expect(event.hovered).toMatchObject({
            type: 'port',
            blockId,
            portKey,
            isInput: true, // phase is an input port
          });
        }
      });

      it('should emit HoverChanged with null when clearing port hover', () => {
        const blockId = patchStore.addBlock('Oscillator');
        const portKey = portId('phase');
        selectionStore.hoverPort({ blockId, portId: portKey });
        capturedEvents = [];

        selectionStore.hoverPort(null);

        expect(capturedEvents).toHaveLength(1);
        expect(capturedEvents[0]).toMatchObject({
          type: 'HoverChanged',
          hovered: null,
        });
      });

      it('should prioritize port hover over block hover in event', () => {
        const blockId = patchStore.addBlock('Oscillator');
        const portKey = portId('phase');

        // Hover both block and port (port should take precedence)
        selectionStore.hoverBlock(blockId);
        capturedEvents = [];
        selectionStore.hoverPort({ blockId, portId: portKey });

        expect(capturedEvents).toHaveLength(1);
        const event = capturedEvents[0];
        expect(event.type).toBe('HoverChanged');
        if (event.type === 'HoverChanged') {
          expect(event.hovered?.type).toBe('port');
        }
      });
    });

    describe('no events without EventHub', () => {
      it('should not throw when EventHub is not set', () => {
        const store = new SelectionStore(patchStore);
        const blockId = patchStore.addBlock('Oscillator');

        expect(() => store.selectBlock(blockId)).not.toThrow();
        expect(() => store.hoverBlock(blockId)).not.toThrow();
      });
    });
  });
});
