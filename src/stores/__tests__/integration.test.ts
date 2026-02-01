/**
 * Store Integration Tests
 *
 * Verify stores work together correctly and maintain architectural invariants.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootStore } from '../RootStore';
import type { Endpoint } from '../../graph/Patch';
import { blockId } from '../../types';

// Import blocks to trigger registration
import '../../blocks/all';


describe('Store Integration', () => {
  let root: RootStore;

  beforeEach(() => {
    root = new RootStore();
  });

  describe('RootStore composition', () => {
    it('should create all child stores', () => {
      expect(root.patch).toBeDefined();
      expect(root.selection).toBeDefined();
      expect(root.viewport).toBeDefined();
      expect(root.playback).toBeDefined();
      expect(root.diagnostics).toBeDefined();
    });

    it('should inject PatchStore into SelectionStore', () => {
      const id = root.patch.addBlock('Oscillator');
      root.selection.selectBlock(id);

      // Selection should derive from patch
      expect(root.selection.selectedBlock).toBe(root.patch.blocks.get(id));
    });
  });

  describe('Selection tracks deletion', () => {
    it('should clear selectedBlock when block is deleted', () => {
      const id = root.patch.addBlock('Oscillator');
      root.selection.selectBlock(id);

      expect(root.selection.selectedBlock).toBeDefined();

      root.patch.removeBlock(id);

      // Selection is automatically cleared via BlockRemoved event
      expect(root.selection.selectedBlockId).toBe(null);
      expect(root.selection.selectedBlock).toBeUndefined();
    });

    it('should clear selectedEdge when edge is deleted', () => {
      const id1 = root.patch.addBlock('Oscillator');
      const id2 = root.patch.addBlock('Add');

      const from: Endpoint = { kind: 'port', blockId: id1, slotId: 'out' };
      const to: Endpoint = { kind: 'port', blockId: id2, slotId: 'in' };
      const edgeId = root.patch.addEdge(from, to);

      root.selection.selectEdge(edgeId);
      expect(root.selection.selectedEdge).toBeDefined();

      root.patch.removeEdge(edgeId);

      // Selection is automatically cleared via EdgeRemoved event
      expect(root.selection.selectedEdgeId).toBe(null);
      expect(root.selection.selectedEdge).toBeUndefined();
    });

    it('should clear selectedEdge when source block is deleted', () => {
      const id1 = root.patch.addBlock('Oscillator');
      const id2 = root.patch.addBlock('Add');

      const from: Endpoint = { kind: 'port', blockId: id1, slotId: 'out' };
      const to: Endpoint = { kind: 'port', blockId: id2, slotId: 'in' };
      const edgeId = root.patch.addEdge(from, to);

      root.selection.selectEdge(edgeId);
      expect(root.selection.selectedEdge).toBeDefined();

      // Deleting source block removes the edge, which triggers EdgeRemoved event
      root.patch.removeBlock(id1);

      // Selection is automatically cleared via EdgeRemoved event cascade
      expect(root.selection.selectedEdgeId).toBe(null);
      expect(root.selection.selectedEdge).toBeUndefined();
    });
  });

  describe('Viewport state independence', () => {
    it('should maintain viewport state independently of patch changes', () => {
      root.viewport.setPan(100, 200);
      root.viewport.setZoom(2.0);

      root.patch.addBlock('Oscillator');
      root.patch.clear();

      // Viewport state unchanged
      expect(root.viewport.pan).toEqual({ x: 100, y: 200 });
      expect(root.viewport.zoom).toBe(2.0);
    });
  });

  describe('Playback state independence', () => {
    it('should maintain playback state independently of patch changes', () => {
      root.playback.setTime(5.0);
      root.playback.play();
      root.playback.setSpeed(2.0);

      root.patch.addBlock('Oscillator');
      root.patch.clear();

      // Playback state unchanged
      expect(root.playback.time).toBe(5.0);
      expect(root.playback.isPlaying).toBe(true);
      expect(root.playback.speed).toBe(2.0);
    });
  });

  // Note: "Diagnostics independence" test removed - obsolete behavior
  // New diagnostics system: diagnostics ARE patch-scoped (include patchRevision in ID)
  // This is intentional per spec - diagnostics belong to specific patch versions

  describe('No data duplication invariant', () => {
    it('should not duplicate block data across stores', () => {
      const id = root.patch.addBlock('Oscillator', { frequency: 440 });
      root.selection.selectBlock(id);

      // SelectionStore returns same reference from PatchStore
      const fromPatch = root.patch.blocks.get(id);
      const fromSelection = root.selection.selectedBlock;

      expect(fromSelection).toBe(fromPatch);
    });

    it('should derive buses from patch blocks', () => {
      const busId = root.patch.addBlock('Oscillator', {}, { role: { kind: 'bus', meta: {} } });

      // Buses are computed from patch blocks
      expect(root.patch.buses.length).toBe(1);
      expect(root.patch.buses[0]).toBe(root.patch.blocks.get(busId));
    });
  });

  describe('MobX strict mode enforcement', () => {
    it('should allow mutations inside actions', () => {
      expect(() => {
        root.patch.addBlock('Oscillator');
      }).not.toThrow();

      expect(() => {
        root.selection.selectBlock(blockId('b0'));
      }).not.toThrow();

      expect(() => {
        root.viewport.setPan(100, 100);
      }).not.toThrow();
    });
  });

  describe('Computed reactivity', () => {
    it('should update computed properties reactively', () => {
      const id = root.patch.addBlock('Oscillator', { frequency: 440 });
      root.selection.selectBlock(id);

      expect(root.selection.selectedBlock?.params.frequency).toBe(440);

      // Update params through action
      root.patch.updateBlockParams(id, { frequency: 880 });

      // Computed property updates automatically
      expect(root.selection.selectedBlock?.params.frequency).toBe(880);
    });
  });
});
