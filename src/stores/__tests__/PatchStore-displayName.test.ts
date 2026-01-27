/**
 * PatchStore Display Name Tests
 *
 * Tests for auto-generation and validation of block display names.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PatchStore } from '../PatchStore';
import { blockId } from '../../types';

// Import blocks to ensure they're registered
import '../../blocks/signal-blocks';
import '../../blocks/math-blocks';

describe('PatchStore - Display Name Auto-generation', () => {
  let store: PatchStore;

  beforeEach(() => {
    store = new PatchStore();
  });

  describe('addBlock auto-generation', () => {
    it('should auto-generate displayName "Type 1" for first block', () => {
      const id = store.addBlock('Oscillator', { frequency: 440 });

      const block = store.blocks.get(id);
      expect(block?.displayName).toBe('Oscillator 1');
    });

    it('should auto-generate "Type 2" for second same-type block', () => {
      store.addBlock('Oscillator', { frequency: 440 });
      const id2 = store.addBlock('Oscillator', { frequency: 880 });

      const block2 = store.blocks.get(id2);
      expect(block2?.displayName).toBe('Oscillator 2');
    });

    it('should auto-generate "Type 3" for third same-type block', () => {
      store.addBlock('Oscillator', { frequency: 440 });
      store.addBlock('Oscillator', { frequency: 880 });
      const id3 = store.addBlock('Oscillator', { frequency: 1000 });

      const block3 = store.blocks.get(id3);
      expect(block3?.displayName).toBe('Oscillator 3');
    });

    it('should respect explicit displayName when provided', () => {
      const id = store.addBlock('Oscillator', { frequency: 440 }, {
        displayName: 'Main Oscillator'
      });

      const block = store.blocks.get(id);
      expect(block?.displayName).toBe('Main Oscillator');
    });

    it('should allow null displayName when explicitly provided', () => {
      const id = store.addBlock('Oscillator', { frequency: 440 }, {
        displayName: null
      });

      const block = store.blocks.get(id);
      expect(block?.displayName).toBe(null);
    });

    it('should handle collision with existing displayName', () => {
      // Create block with explicit name "Oscillator 1"
      store.addBlock('Oscillator', { frequency: 440 }, { displayName: 'Oscillator 1' });

      // Next auto-generated name should skip to "Oscillator 2"
      const id2 = store.addBlock('Oscillator', { frequency: 880 });
      const block2 = store.blocks.get(id2);
      expect(block2?.displayName).toBe('Oscillator 2');
    });

    it('should handle collision with different block type having same canonical name', () => {
      // Create Add block with name "Oscillator 1" (cross-type collision)
      store.addBlock('Add', {}, { displayName: 'Oscillator 1' });

      // Create Oscillator - should skip to "Oscillator 2" to avoid collision
      const id = store.addBlock('Oscillator', { frequency: 440 });
      const block = store.blocks.get(id);
      expect(block?.displayName).toBe('Oscillator 2');
    });

    it('should handle case-insensitive collision', () => {
      // Create block with "oscillator 1" (lowercase)
      store.addBlock('Add', {}, { displayName: 'oscillator 1' });

      // Next Oscillator should skip to "Oscillator 2" (canonical collision)
      const id = store.addBlock('Oscillator', { frequency: 440 });
      const block = store.blocks.get(id);
      expect(block?.displayName).toBe('Oscillator 2');
    });

    it('should handle special character collision', () => {
      // Create block with "Oscillator 1!" (with special char)
      store.addBlock('Add', {}, { displayName: 'Oscillator 1!' });

      // Next Oscillator should skip to "Oscillator 2" (canonical collision)
      const id = store.addBlock('Oscillator', { frequency: 440 });
      const block = store.blocks.get(id);
      expect(block?.displayName).toBe('Oscillator 2');
    });

    it('should increment based on same-type count and skip collisions', () => {
      // Create blocks with specific names to test collision handling
      // Two Oscillators exist, so next should start at 3
      store.addBlock('Oscillator', {}, { displayName: 'Oscillator 1' });
      store.addBlock('Oscillator', {}, { displayName: 'Oscillator 3' });

      // Next auto-generated should be "Oscillator 3" (based on count=3)
      // But that collides, so it should skip to "Oscillator 4"
      const id = store.addBlock('Oscillator', {});
      const block = store.blocks.get(id);
      expect(block?.displayName).toBe('Oscillator 4');
    });

    it('should auto-generate unique names for different block types', () => {
      const id1 = store.addBlock('Oscillator', {});
      const id2 = store.addBlock('Add', {});

      const block1 = store.blocks.get(id1);
      const block2 = store.blocks.get(id2);

      expect(block1?.displayName).toBe('Oscillator 1');
      expect(block2?.displayName).toBe('Add 1');
    });
  });

  describe('updateBlockDisplayName validation', () => {
    it('should update displayName when no collision', () => {
      const id = store.addBlock('Oscillator', {});
      const result = store.updateBlockDisplayName(id, 'My Oscillator');

      expect(result.error).toBeUndefined();
      const block = store.blocks.get(id);
      expect(block?.displayName).toBe('My Oscillator');
    });

    it('should reject collision with exact match', () => {
      store.addBlock('Oscillator', {}, { displayName: 'Test Block' });
      const id2 = store.addBlock('Oscillator', {});

      const result = store.updateBlockDisplayName(id2, 'Test Block');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('conflicts');
      // Block should keep original name
      const block2 = store.blocks.get(id2);
      expect(block2?.displayName).toBe('Oscillator 2');
    });

    it('should reject case-insensitive collision', () => {
      store.addBlock('Oscillator', {}, { displayName: 'Test Block' });
      const id2 = store.addBlock('Oscillator', {});

      const result = store.updateBlockDisplayName(id2, 'test block');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('conflicts');
    });

    it('should reject special character collision', () => {
      store.addBlock('Oscillator', {}, { displayName: 'Test Block!' });
      const id2 = store.addBlock('Oscillator', {});

      const result = store.updateBlockDisplayName(id2, 'Test Block?');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('conflicts');
    });

    it('should allow updating to same name (self-reference)', () => {
      const id = store.addBlock('Oscillator', {}, { displayName: 'Test Block' });

      const result = store.updateBlockDisplayName(id, 'Test Block');

      expect(result.error).toBeUndefined();
    });

    it('should auto-generate when given null displayName', () => {
      const id = store.addBlock('Oscillator', {}, { displayName: 'Custom Name' });

      const result = store.updateBlockDisplayName(id, null);

      expect(result.error).toBeUndefined();
      const block = store.blocks.get(id);
      // Should auto-generate based on type. Since there's 1 Oscillator, it becomes "Oscillator 2"
      // (the block itself is still counted in the type count during re-generation)
      expect(block?.displayName).toBe('Oscillator 2');
    });

    it('should auto-generate when given empty string', () => {
      const id = store.addBlock('Oscillator', {}, { displayName: 'Custom Name' });

      const result = store.updateBlockDisplayName(id, '   ');

      expect(result.error).toBeUndefined();
      const block = store.blocks.get(id);
      expect(block?.displayName).toBe('Oscillator 2');
    });
  });

  describe('loadPatch auto-migration', () => {
    it('should auto-generate displayName for null values on load', () => {
      const patch = {
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

      store.loadPatch(patch);

      const block = store.blocks.get(blockId('b0'));
      expect(block?.displayName).toBe('Oscillator 1');
    });

    it('should preserve non-null displayNames on load', () => {
      const patch = {
        blocks: new Map([
          [blockId('b0'), {
            id: blockId('b0'),
            type: 'Oscillator',
            params: {},
            displayName: 'Custom Name',
            domainId: null,
            role: { kind: 'user' as const, meta: {} },
            inputPorts: new Map(),
            outputPorts: new Map(),
          }],
        ]),
        edges: [],
      };

      store.loadPatch(patch);

      const block = store.blocks.get(blockId('b0'));
      expect(block?.displayName).toBe('Custom Name');
    });

    it('should handle mixed null and non-null displayNames on load', () => {
      const patch = {
        blocks: new Map([
          [blockId('b0'), {
            id: blockId('b0'),
            type: 'Oscillator',
            params: {},
            displayName: 'Custom 1',
            domainId: null,
            role: { kind: 'user' as const, meta: {} },
            inputPorts: new Map(),
            outputPorts: new Map(),
          }],
          [blockId('b1'), {
            id: blockId('b1'),
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

      store.loadPatch(patch);

      const block0 = store.blocks.get(blockId('b0'));
      const block1 = store.blocks.get(blockId('b1'));
      expect(block0?.displayName).toBe('Custom 1');
      // b1 is processed after b0 is already in migratedBlocks, so count = 2
      expect(block1?.displayName).toBe('Oscillator 2');
    });
  });
});
