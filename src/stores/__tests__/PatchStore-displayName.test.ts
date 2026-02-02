/**
 * PatchStore Display Name Tests
 *
 * Tests for auto-generation and validation of block display names.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PatchStore } from '../PatchStore';

// Import blocks to trigger registration
import '../../blocks/all';


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

    it('should always auto-generate displayName even when explicit name is provided', () => {
      const id = store.addBlock('Oscillator', { frequency: 440 }, {
        displayName: 'Main Oscillator'
      });

      const block = store.blocks.get(id);
      // Always auto-generated, explicit displayName is ignored
      expect(block?.displayName).toBe('Oscillator 1');
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
      const id1 = store.addBlock('Oscillator', {});
      store.updateBlockDisplayName(id1, 'Test Block');
      const id2 = store.addBlock('Oscillator', {});

      const result = store.updateBlockDisplayName(id2, 'Test Block');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('conflicts');
      // Block should keep original name
      const block2 = store.blocks.get(id2);
      expect(block2?.displayName).toBe('Oscillator 2');
    });

    it('should reject case-insensitive collision', () => {
      const id1 = store.addBlock('Oscillator', {});
      store.updateBlockDisplayName(id1, 'Test Block');
      const id2 = store.addBlock('Oscillator', {});

      const result = store.updateBlockDisplayName(id2, 'test block');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('conflicts');
    });

    it('should reject special character collision', () => {
      const id1 = store.addBlock('Oscillator', {});
      store.updateBlockDisplayName(id1, 'Test Block!');
      const id2 = store.addBlock('Oscillator', {});

      const result = store.updateBlockDisplayName(id2, 'Test Block?');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('conflicts');
    });

    it('should allow updating to same name (self-reference)', () => {
      const id = store.addBlock('Oscillator', {});
      store.updateBlockDisplayName(id, 'Test Block');

      const result = store.updateBlockDisplayName(id, 'Test Block');

      expect(result.error).toBeUndefined();
    });

    it('should reject empty string', () => {
      const id = store.addBlock('Oscillator', {});

      const result = store.updateBlockDisplayName(id, '   ');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('empty');
      // Name should remain unchanged
      const block = store.blocks.get(id);
      expect(block?.displayName).toBe('Oscillator 1');
    });
  });
});
