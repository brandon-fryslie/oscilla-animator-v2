/**
 * Unit tests for Domain Identity module
 *
 * Tests element ID generation and domain instance creation
 * per spec topics/11-continuity-system.md §3.1-3.2
 */

import { describe, it, expect } from 'vitest';
import {
  generateElementIds,
  createStableDomainInstance,
  createUnstableDomainInstance,
  extendElementIds,
} from '../DomainIdentity';

describe('DomainIdentity', () => {
  describe('generateElementIds', () => {
    it('generates deterministic IDs starting from 0', () => {
      const ids = generateElementIds(10);
      expect(ids).toEqual(new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    });

    it('respects seed parameter', () => {
      const ids = generateElementIds(5, 100);
      expect(ids).toEqual(new Uint32Array([100, 101, 102, 103, 104]));
    });

    it('handles empty count', () => {
      const ids = generateElementIds(0);
      expect(ids.length).toBe(0);
    });

    it('handles large count', () => {
      const ids = generateElementIds(1000);
      expect(ids.length).toBe(1000);
      expect(ids[0]).toBe(0);
      expect(ids[999]).toBe(999);
    });

    it('produces same result for same inputs (deterministic)', () => {
      const ids1 = generateElementIds(10, 42);
      const ids2 = generateElementIds(10, 42);
      expect(ids1).toEqual(ids2);
    });
  });

  describe('createStableDomainInstance', () => {
    it('creates instance with stable identity', () => {
      const inst = createStableDomainInstance(10);
      expect(inst.identityMode).toBe('stable');
      expect(inst.count).toBe(10);
      expect(inst.elementId.length).toBe(10);
    });

    it('element IDs are sequential from 0 by default', () => {
      const inst = createStableDomainInstance(5);
      expect(inst.elementId).toEqual(new Uint32Array([0, 1, 2, 3, 4]));
    });

    it('respects seed parameter', () => {
      const inst = createStableDomainInstance(3, 100);
      expect(inst.elementId).toEqual(new Uint32Array([100, 101, 102]));
    });

    it('includes position hints when provided', () => {
      const posHints = new Float32Array([0, 0, 1, 1, 2, 2]);
      const inst = createStableDomainInstance(3, 0, posHints);
      expect(inst.posHintXY).toBe(posHints);
    });

    it('omits position hints when not provided', () => {
      const inst = createStableDomainInstance(5);
      expect(inst.posHintXY).toBeUndefined();
    });
  });

  describe('createUnstableDomainInstance', () => {
    it('creates instance without identity', () => {
      const inst = createUnstableDomainInstance(10);
      expect(inst.identityMode).toBe('none');
      expect(inst.elementId.length).toBe(0);
    });

    it('sets correct count', () => {
      const inst = createUnstableDomainInstance(42);
      expect(inst.count).toBe(42);
    });

    it('has no position hints', () => {
      const inst = createUnstableDomainInstance(5);
      expect(inst.posHintXY).toBeUndefined();
    });
  });

  describe('extendElementIds', () => {
    it('preserves existing IDs when growing', () => {
      const existing = new Uint32Array([0, 1, 2, 3, 4]);
      const extended = extendElementIds(existing, 8);

      // First 5 should be unchanged
      expect(extended[0]).toBe(0);
      expect(extended[1]).toBe(1);
      expect(extended[2]).toBe(2);
      expect(extended[3]).toBe(3);
      expect(extended[4]).toBe(4);

      // Next 3 should be new
      expect(extended.length).toBe(8);
    });

    it('shrinks by slicing', () => {
      const existing = new Uint32Array([0, 1, 2, 3, 4]);
      const shrunk = extendElementIds(existing, 3);

      expect(shrunk).toEqual(new Uint32Array([0, 1, 2]));
    });

    it('returns same array reference pattern on no change', () => {
      const existing = new Uint32Array([0, 1, 2]);
      const same = extendElementIds(existing, 3);

      // Note: slice creates new array, so length check
      expect(same.length).toBe(3);
      expect(same[0]).toBe(0);
      expect(same[1]).toBe(1);
      expect(same[2]).toBe(2);
    });

    it('uses seed for new IDs when provided', () => {
      const existing = new Uint32Array([100, 101, 102]);
      const extended = extendElementIds(existing, 5, 200);

      // Existing preserved
      expect(extended[0]).toBe(100);
      expect(extended[1]).toBe(101);
      expect(extended[2]).toBe(102);

      // New IDs from seed
      expect(extended[3]).toBe(200);
      expect(extended[4]).toBe(201);
    });

    it('defaults seed to existing length', () => {
      const existing = new Uint32Array([0, 1, 2]);
      const extended = extendElementIds(existing, 5);

      // New IDs continue from existing length
      expect(extended[3]).toBe(3);
      expect(extended[4]).toBe(4);
    });
  });

  describe('identity stability across count changes', () => {
    it('IDs 0-9 remain stable when count goes 10→11', () => {
      const inst10 = createStableDomainInstance(10);
      const inst11 = createStableDomainInstance(11);

      // First 10 IDs should match
      for (let i = 0; i < 10; i++) {
        expect(inst10.elementId[i]).toBe(inst11.elementId[i]);
      }
    });

    it('IDs 0-9 remain stable when count goes 11→10', () => {
      const inst11 = createStableDomainInstance(11);
      const inst10 = createStableDomainInstance(10);

      // First 10 IDs should match
      for (let i = 0; i < 10; i++) {
        expect(inst11.elementId[i]).toBe(inst10.elementId[i]);
      }
    });

    it('seeded instances have disjoint ID ranges', () => {
      const inst1 = createStableDomainInstance(100, 0);
      const inst2 = createStableDomainInstance(100, 1000);

      // No overlap between ranges [0,99] and [1000,1099]
      const set1 = new Set(inst1.elementId);
      for (const id of inst2.elementId) {
        expect(set1.has(id)).toBe(false);
      }
    });
  });
});
