/**
 * PatchStore Tests
 *
 * Verify PatchStore is the single source of truth and all mutations work correctly.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PatchStore } from '../PatchStore';
import { reaction } from 'mobx';
import type { Endpoint } from '../../graph/Patch';
import { blockId } from '../../types';

// Import blocks to ensure they're registered
import '../../blocks/signal-blocks';
import '../../blocks/math-blocks';

describe('PatchStore', () => {
  let store: PatchStore;

  beforeEach(() => {
    store = new PatchStore();
  });

  describe('addBlock', () => {
    it('should add a block with generated ID', () => {
      const id = store.addBlock('Oscillator', { frequency: 440 });

      expect(store.blocks.has(id)).toBe(true);
      const block = store.blocks.get(id);
      expect(block?.type).toBe('Oscillator');
      expect(block?.params).toEqual({ frequency: 440 });
      expect(block?.displayName).toBe(null);
      expect(block?.domainId).toBe(null);
      expect(block?.role).toEqual({ kind: 'user', meta: {} });
    });

    it('should add a block with options', () => {
      const id = store.addBlock('Oscillator', { frequency: 440 }, {
        displayName: 'Main Osc',
        domainId: 'd1',
        role: { kind: 'bus', meta: {} },
      });

      const block = store.blocks.get(id);
      expect(block?.displayName).toBe('Main Osc');
      expect(block?.domainId).toBe('d1');
      expect(block?.role).toEqual({ kind: 'bus', meta: {} });
    });

    it('should generate unique IDs', () => {
      const id1 = store.addBlock('Oscillator');
      const id2 = store.addBlock('Add');
      expect(id1).not.toBe(id2);
    });
  });

  describe('removeBlock', () => {
    it('should remove a block', () => {
      const id = store.addBlock('Oscillator');
      expect(store.blocks.has(id)).toBe(true);

      store.removeBlock(id);
      expect(store.blocks.has(id)).toBe(false);
    });

    it('should remove edges connected to the block', () => {
      const id1 = store.addBlock('Oscillator');
      const id2 = store.addBlock('Add');

      const from: Endpoint = { kind: 'port', blockId: id1, slotId: 'out' };
      const to: Endpoint = { kind: 'port', blockId: id2, slotId: 'in' };
      const edgeId = store.addEdge(from, to);

      expect(store.edges.length).toBe(1);

      store.removeBlock(id1);
      expect(store.edges.length).toBe(0);
    });
  });

  describe('updateBlockParams', () => {
    it('should update block parameters', () => {
      const id = store.addBlock('Oscillator', { frequency: 440 });

      store.updateBlockParams(id, { frequency: 880 });

      const block = store.blocks.get(id);
      expect(block?.params).toEqual({ frequency: 880 });
    });

    it('should merge parameters', () => {
      const id = store.addBlock('Oscillator', { frequency: 440, amplitude: 1 });

      store.updateBlockParams(id, { frequency: 880 });

      const block = store.blocks.get(id);
      // Should merge: keep amplitude, update frequency
      expect(block?.params).toEqual({ frequency: 880, amplitude: 1 });
    });

    it('should throw if block not found', () => {
      expect(() => {
        store.updateBlockParams(blockId('nonexistent'), {});
      }).toThrow('Block not found');
    });
  });

  describe('updateBlockDisplayName', () => {
    it('should update display name', () => {
      const id = store.addBlock('Oscillator');

      store.updateBlockDisplayName(id, 'Main Osc');

      const block = store.blocks.get(id);
      expect(block?.displayName).toBe('Main Osc');
    });

    it('should throw if block not found', () => {
      expect(() => {
        store.updateBlockDisplayName(blockId('nonexistent'), 'Name');
      }).toThrow('Block not found');
    });
  });

  describe('addEdge', () => {
    it('should add an edge with generated ID', () => {
      const id1 = store.addBlock('Oscillator');
      const id2 = store.addBlock('Add');

      const from: Endpoint = { kind: 'port', blockId: id1, slotId: 'out' };
      const to: Endpoint = { kind: 'port', blockId: id2, slotId: 'in' };
      const edgeId = store.addEdge(from, to);

      expect(store.edges.length).toBe(1);
      const edge = store.edges.find(e => e.id === edgeId);
      expect(edge).toBeDefined();
      expect(edge?.from).toEqual(from);
      expect(edge?.to).toEqual(to);
      expect(edge?.enabled).toBe(true);
    });

    it('should add an edge with options', () => {
      const id1 = store.addBlock('Oscillator');
      const id2 = store.addBlock('Add');

      const from: Endpoint = { kind: 'port', blockId: id1, slotId: 'out' };
      const to: Endpoint = { kind: 'port', blockId: id2, slotId: 'in' };
      const edgeId = store.addEdge(from, to, { enabled: false, sortKey: 5 });

      const edge = store.edges.find(e => e.id === edgeId);
      expect(edge?.enabled).toBe(false);
      expect(edge?.sortKey).toBe(5);
    });
  });

  describe('removeEdge', () => {
    it('should remove an edge', () => {
      const id1 = store.addBlock('Oscillator');
      const id2 = store.addBlock('Add');

      const from: Endpoint = { kind: 'port', blockId: id1, slotId: 'out' };
      const to: Endpoint = { kind: 'port', blockId: id2, slotId: 'in' };
      const edgeId = store.addEdge(from, to);

      expect(store.edges.length).toBe(1);

      store.removeEdge(edgeId);
      expect(store.edges.length).toBe(0);
    });
  });

  describe('updateEdge', () => {
    it('should update edge properties', () => {
      const id1 = store.addBlock('Oscillator');
      const id2 = store.addBlock('Add');

      const from: Endpoint = { kind: 'port', blockId: id1, slotId: 'out' };
      const to: Endpoint = { kind: 'port', blockId: id2, slotId: 'in' };
      const edgeId = store.addEdge(from, to);

      store.updateEdge(edgeId, { enabled: false, sortKey: 10 });

      const edge = store.edges.find(e => e.id === edgeId);
      expect(edge?.enabled).toBe(false);
      expect(edge?.sortKey).toBe(10);
    });

    it('should throw if edge not found', () => {
      expect(() => {
        store.updateEdge('nonexistent', {});
      }).toThrow('Edge not found');
    });
  });

  describe('computed properties', () => {
    it('should reactively update buses computed', () => {
      const calls: number[] = [];

      // Set up reaction to track buses changes
      const dispose = reaction(
        () => store.buses.length,
        (length) => calls.push(length)
      );

      // Add a bus block
      store.addBlock('Oscillator', {}, { role: { kind: 'bus', meta: {} } });
      expect(calls).toEqual([1]);

      // Add a non-bus block (shouldn't trigger because length doesn't change)
      store.addBlock('Oscillator', {}, { role: { kind: 'user', meta: {} } });
      expect(calls).toEqual([1]);

      // Add another bus
      store.addBlock('Add', {}, { role: { kind: 'bus', meta: {} } });
      expect(calls).toEqual([1, 2]);

      dispose();
    });

    it('should reactively update domains computed', () => {
      const calls: number[] = [];

      const dispose = reaction(
        () => store.domains.length,
        (length) => calls.push(length)
      );

      store.addBlock('Oscillator', {}, { role: { kind: 'domain', meta: {} } });
      expect(calls).toEqual([1]);

      dispose();
    });
  });

  describe('loadPatch', () => {
    it('should replace entire patch', () => {
      store.addBlock('Oscillator');

      const newPatch = {
        blocks: new Map([
          [blockId('b0'), {
            id: blockId('b0'),
            type: 'Oscillator',
            params: {},
            displayName: null,
            domainId: null,
            role: { kind: 'user' as const, meta: {} },
            inputPorts: new Map(),
            outputPorts: new Map(),
          }],
        ]),
        edges: [],
      };

      store.loadPatch(newPatch);

      expect(store.blocks.size).toBe(1);
      expect(store.blocks.has(blockId('b0'))).toBe(true);
    });

    it('should update ID generators to avoid conflicts', () => {
      const patch = {
        blocks: new Map([
          [blockId('b10'), {
            id: blockId('b10'),
            type: 'Oscillator',
            params: {},
            displayName: null,
            domainId: null,
            role: { kind: 'user' as const, meta: {} },
            inputPorts: new Map(),
            outputPorts: new Map(),
          }],
        ]),
        edges: [
          {
            id: 'e5',
            from: { kind: 'port' as const, blockId: 'b10', slotId: 'out' },
            to: { kind: 'port' as const, blockId: 'b10', slotId: 'in' },
            enabled: true,
            sortKey: 0,
            role: { kind: 'user' as const, meta: {} as Record<string, never> },
          },
        ],
      };

      store.loadPatch(patch);

      // Next IDs should be higher than loaded IDs
      const newBlockId = store.addBlock('Add');
      expect(newBlockId).toMatch(/^b\d+$/);
      expect(parseInt(newBlockId.slice(1))).toBeGreaterThan(10);
    });
  });

  describe('clear', () => {
    it('should clear all blocks and edges', () => {
      store.addBlock('Oscillator');
      expect(store.blocks.size).toBeGreaterThan(0);

      store.clear();
      expect(store.blocks.size).toBe(0);
      expect(store.edges.length).toBe(0);
    });
  });

  describe('strict mode enforcement', () => {
    it('should allow mutations inside actions', () => {
      // This should not throw
      expect(() => {
        store.addBlock('Oscillator');
      }).not.toThrow();
    });
  });
});
