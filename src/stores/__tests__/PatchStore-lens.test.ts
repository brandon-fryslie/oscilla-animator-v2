/**
 * Tests for PatchStore lens methods.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PatchStore } from '../PatchStore';
import type { BlockId } from '../../types';

// Import block registrations
import '../../blocks/signal-blocks';
import '../../blocks/adapter-blocks';
import '../../blocks/math-blocks';

describe('PatchStore Lens Methods', () => {
  let store: PatchStore;

  beforeEach(() => {
    store = new PatchStore();
  });

  describe('addLens', () => {
    it('adds lens to port with no existing lenses', () => {
      const blockId = store.addBlock('Add', {});
      const lensId = store.addLens(
        blockId,
        'a',
        'Adapter_ScalarToPhase01',
        'v1:blocks.phasor_1.outputs.phase'
      );

      expect(lensId).toMatch(/^lens_/);
      const lenses = store.getLensesForPort(blockId, 'a');
      expect(lenses).toHaveLength(1);
      expect(lenses[0].lensType).toBe('Adapter_ScalarToPhase01');
    });

    it('adds lens to port with existing lenses', () => {
      const blockId = store.addBlock('Add', {});
      store.addLens(blockId, 'a', 'Adapter_ScalarToPhase01', 'v1:blocks.a.outputs.x');
      store.addLens(blockId, 'a', 'Adapter_DegreesToRadians', 'v1:blocks.b.outputs.y');

      const lenses = store.getLensesForPort(blockId, 'a');
      expect(lenses).toHaveLength(2);
      expect(lenses[0].sortKey).toBe(0);
      expect(lenses[1].sortKey).toBe(1);
    });

    it('generates deterministic lens ID from source address', () => {
      const blockId = store.addBlock('Add', {});
      const sourceAddr = 'v1:blocks.phasor_1.outputs.phase';
      const lensId1 = store.addLens(blockId, 'a', 'Adapter_ScalarToPhase01', sourceAddr);

      // Create another block and add same lens
      const blockId2 = store.addBlock('Add', {});
      const lensId2 = store.addLens(blockId2, 'a', 'Adapter_ScalarToPhase01', sourceAddr);

      // IDs should be the same (deterministic based on source address)
      expect(lensId1).toBe(lensId2);
    });

    it('throws if lens already exists for source', () => {
      const blockId = store.addBlock('Add', {});
      const sourceAddr = 'v1:blocks.phasor_1.outputs.phase';
      store.addLens(blockId, 'a', 'Adapter_ScalarToPhase01', sourceAddr);

      expect(() => {
        store.addLens(blockId, 'a', 'Adapter_ScalarToPhase01', sourceAddr);
      }).toThrow(/already exists/);
    });

    it('throws if block not found', () => {
      expect(() => {
        store.addLens('nonexistent' as BlockId, 'a', 'Adapter_ScalarToPhase01', 'addr');
      }).toThrow(/not found/);
    });

    it('throws if port not found', () => {
      const blockId = store.addBlock('Add', {});
      expect(() => {
        store.addLens(blockId, 'nonexistentPort', 'Adapter_ScalarToPhase01', 'addr');
      }).toThrow(/not found/);
    });

    it('throws if lens type not registered', () => {
      const blockId = store.addBlock('Add', {});
      expect(() => {
        store.addLens(blockId, 'a', 'NonexistentLens', 'addr');
      }).toThrow();
    });

    it('accepts optional params', () => {
      const blockId = store.addBlock('Add', {});
      store.addLens(
        blockId,
        'a',
        'Adapter_ScalarToPhase01',
        'v1:blocks.a.outputs.x',
        { scale: 2.0, offset: 0.5 }
      );

      const lenses = store.getLensesForPort(blockId, 'a');
      expect(lenses[0].params).toEqual({ scale: 2.0, offset: 0.5 });
    });
  });

  describe('removeLens', () => {
    it('removes lens from port', () => {
      const blockId = store.addBlock('Add', {});
      const lensId = store.addLens(
        blockId, 'a', 'Adapter_ScalarToPhase01', 'v1:blocks.a.outputs.x'
      );

      store.removeLens(blockId, 'a', lensId);
      expect(store.getLensesForPort(blockId, 'phase')).toHaveLength(0);
    });

    it('clears lenses field when last lens removed', () => {
      const blockId = store.addBlock('Add', {});
      const lensId = store.addLens(
        blockId, 'a', 'Adapter_ScalarToPhase01', 'v1:blocks.a.outputs.x'
      );

      store.removeLens(blockId, 'a', lensId);

      // Check that the port's lenses field is undefined (not empty array)
      const block = store.blocks.get(blockId);
      const port = block?.inputPorts.get('a');
      expect(port?.lenses).toBeUndefined();
    });

    it('removes only specified lens', () => {
      const blockId = store.addBlock('Add', {});
      const lensId1 = store.addLens(blockId, 'a', 'Adapter_ScalarToPhase01', 'v1:blocks.a.outputs.x');
      const lensId2 = store.addLens(blockId, 'a', 'Adapter_DegreesToRadians', 'v1:blocks.b.outputs.y');

      store.removeLens(blockId, 'a', lensId1);

      const lenses = store.getLensesForPort(blockId, 'a');
      expect(lenses).toHaveLength(1);
      expect(lenses[0].id).toBe(lensId2);
    });

    it('throws if lens not found', () => {
      const blockId = store.addBlock('Add', {});
      expect(() => {
        store.removeLens(blockId, 'a', 'nonexistent');
      }).toThrow(/not found/);
    });

    it('throws if block not found', () => {
      expect(() => {
        store.removeLens('nonexistent' as BlockId, 'a', 'lens_123');
      }).toThrow(/not found/);
    });
  });

  describe('getLensesForPort', () => {
    it('returns empty array for port with no lenses', () => {
      const blockId = store.addBlock('Add', {});
      expect(store.getLensesForPort(blockId, 'phase')).toEqual([]);
    });

    it('returns empty array for nonexistent block', () => {
      expect(store.getLensesForPort('nonexistent' as BlockId, 'phase')).toEqual([]);
    });

    it('returns lenses in order', () => {
      const blockId = store.addBlock('Add', {});
      store.addLens(blockId, 'a', 'Adapter_ScalarToPhase01', 'v1:blocks.a.outputs.x');
      store.addLens(blockId, 'a', 'Adapter_DegreesToRadians', 'v1:blocks.b.outputs.y');

      const lenses = store.getLensesForPort(blockId, 'a');
      expect(lenses).toHaveLength(2);
      expect(lenses[0].lensType).toBe('Adapter_ScalarToPhase01');
      expect(lenses[1].lensType).toBe('Adapter_DegreesToRadians');
    });

    it('returns defensive copy', () => {
      const blockId = store.addBlock('Add', {});
      store.addLens(blockId, 'a', 'Adapter_ScalarToPhase01', 'v1:blocks.a.outputs.x');

      const lenses1 = store.getLensesForPort(blockId, 'phase');
      const lenses2 = store.getLensesForPort(blockId, 'phase');
      expect(lenses1).not.toBe(lenses2);
    });
  });

  describe('updateLensParams', () => {
    it('updates lens params', () => {
      const blockId = store.addBlock('Add', {});
      const lensId = store.addLens(
        blockId, 'a', 'Adapter_ScalarToPhase01', 'v1:blocks.a.outputs.x',
        { scale: 1.0 }
      );

      store.updateLensParams(blockId, 'a', lensId, { scale: 2.0 });

      const lenses = store.getLensesForPort(blockId, 'a');
      expect(lenses[0].params?.scale).toBe(2.0);
    });

    it('merges with existing params', () => {
      const blockId = store.addBlock('Add', {});
      const lensId = store.addLens(
        blockId, 'a', 'Adapter_ScalarToPhase01', 'v1:blocks.a.outputs.x',
        { scale: 1.0, offset: 0 }
      );

      store.updateLensParams(blockId, 'a', lensId, { scale: 2.0 });

      const lenses = store.getLensesForPort(blockId, 'a');
      expect(lenses[0].params).toEqual({ scale: 2.0, offset: 0 });
    });

    it('throws if lens not found', () => {
      const blockId = store.addBlock('Add', {});
      expect(() => {
        store.updateLensParams(blockId, 'a', 'nonexistent', { scale: 2.0 });
      }).toThrow(/not found/);
    });

    it('throws if block not found', () => {
      expect(() => {
        store.updateLensParams('nonexistent' as BlockId, 'a', 'lens_123', { scale: 2.0 });
      }).toThrow(/not found/);
    });
  });
});
