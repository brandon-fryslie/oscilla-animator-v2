/**
 * Unit tests for Continuity Mapping module
 *
 * Tests element mapping algorithms per spec topics/11-continuity-system.md §3.3-3.5
 */

import { describe, it, expect } from 'vitest';
import {
  buildMappingById,
  buildMappingByPosition,
  detectDomainChange,
  countMappedElements,
} from '../ContinuityMapping';
import {
  createStableDomainInstance,
  createUnstableDomainInstance,
} from '../DomainIdentity';
import type { DomainInstance } from '../../compiler/ir/types';

describe('ContinuityMapping', () => {
  describe('buildMappingById', () => {
    it('maps 10→11 correctly (add one element)', () => {
      const old = createStableDomainInstance(10);
      const new_ = createStableDomainInstance(11);
      const mapping = buildMappingById(old, new_);

      expect(mapping.kind).toBe('byId');
      if (mapping.kind === 'byId') {
        // 0-9 map to themselves
        for (let i = 0; i < 10; i++) {
          expect(mapping.newToOld[i]).toBe(i);
        }
        // 10 is new (unmapped)
        expect(mapping.newToOld[10]).toBe(-1);
      }
    });

    it('maps 11→10 correctly (remove one element)', () => {
      const old = createStableDomainInstance(11);
      const new_ = createStableDomainInstance(10);
      const mapping = buildMappingById(old, new_);

      expect(mapping.kind).toBe('byId');
      if (mapping.kind === 'byId') {
        // 0-9 map to themselves
        for (let i = 0; i < 10; i++) {
          expect(mapping.newToOld[i]).toBe(i);
        }
      }
    });

    it('returns identity for unchanged domain', () => {
      const domain = createStableDomainInstance(10);
      const mapping = buildMappingById(domain, domain);
      expect(mapping.kind).toBe('identity');
      if (mapping.kind === 'identity') {
        expect(mapping.count).toBe(10);
      }
    });

    it('throws if either domain has identityMode="none"', () => {
      const stable = createStableDomainInstance(10);
      const unstable = createUnstableDomainInstance(10);
      expect(() => buildMappingById(stable, unstable)).toThrow();
      expect(() => buildMappingById(unstable, stable)).toThrow();
    });

    it('handles seeded domains with disjoint IDs', () => {
      // Old domain: IDs [100..109]
      const old = createStableDomainInstance(10, 100);
      // New domain: IDs [100..114]
      const new_ = createStableDomainInstance(15, 100);

      const mapping = buildMappingById(old, new_);
      expect(mapping.kind).toBe('byId');
      if (mapping.kind === 'byId') {
        // First 10 should map
        for (let i = 0; i < 10; i++) {
          expect(mapping.newToOld[i]).toBe(i);
        }
        // Last 5 are new (unmapped)
        for (let i = 10; i < 15; i++) {
          expect(mapping.newToOld[i]).toBe(-1);
        }
      }
    });

    it('handles complete replacement (no overlap)', () => {
      // Old domain: IDs [0..9]
      const old = createStableDomainInstance(10, 0);
      // New domain: IDs [1000..1009] (no overlap)
      const new_ = createStableDomainInstance(10, 1000);

      const mapping = buildMappingById(old, new_);
      expect(mapping.kind).toBe('byId');
      if (mapping.kind === 'byId') {
        // All should be unmapped
        for (let i = 0; i < 10; i++) {
          expect(mapping.newToOld[i]).toBe(-1);
        }
      }
    });
  });

  describe('buildMappingByPosition', () => {
    it('maps by nearest neighbor', () => {
      const oldPos = new Float32Array([0, 0, 1, 1]); // 2 elements at (0,0) and (1,1)
      const newPos = new Float32Array([0.1, 0.1, 0.9, 0.9]); // Slightly offset

      const old: DomainInstance = {
        count: 2,
        elementId: new Uint32Array(0),
        identityMode: 'none',
        posHintXY: oldPos,
      };
      const new_: DomainInstance = {
        count: 2,
        elementId: new Uint32Array(0),
        identityMode: 'none',
        posHintXY: newPos,
      };

      const mapping = buildMappingByPosition(old, new_, 0.5);
      expect(mapping.kind).toBe('byPosition');
      if (mapping.kind === 'byPosition') {
        expect(mapping.newToOld[0]).toBe(0); // (0.1,0.1) → (0,0)
        expect(mapping.newToOld[1]).toBe(1); // (0.9,0.9) → (1,1)
      }
    });

    it('returns -1 for elements outside search radius', () => {
      const oldPos = new Float32Array([0, 0]);
      const newPos = new Float32Array([10, 10]); // Far away

      const old: DomainInstance = {
        count: 1,
        elementId: new Uint32Array(0),
        identityMode: 'none',
        posHintXY: oldPos,
      };
      const new_: DomainInstance = {
        count: 1,
        elementId: new Uint32Array(0),
        identityMode: 'none',
        posHintXY: newPos,
      };

      const mapping = buildMappingByPosition(old, new_, 0.5);
      if (mapping.kind === 'byPosition') {
        expect(mapping.newToOld[0]).toBe(-1);
      }
    });

    it('prevents double-mapping (each old element used once)', () => {
      // Old: one element at (0,0)
      // New: two elements both close to (0,0)
      const oldPos = new Float32Array([0, 0]);
      const newPos = new Float32Array([0.01, 0.01, 0.02, 0.02]);

      const old: DomainInstance = {
        count: 1,
        elementId: new Uint32Array(0),
        identityMode: 'none',
        posHintXY: oldPos,
      };
      const new_: DomainInstance = {
        count: 2,
        elementId: new Uint32Array(0),
        identityMode: 'none',
        posHintXY: newPos,
      };

      const mapping = buildMappingByPosition(old, new_, 0.5);
      if (mapping.kind === 'byPosition') {
        // First element maps to old[0]
        expect(mapping.newToOld[0]).toBe(0);
        // Second element can't map (old[0] already used)
        expect(mapping.newToOld[1]).toBe(-1);
      }
    });

    it('throws if posHintXY missing', () => {
      const withPos: DomainInstance = {
        count: 1,
        elementId: new Uint32Array(0),
        identityMode: 'none',
        posHintXY: new Float32Array([0, 0]),
      };
      const withoutPos: DomainInstance = {
        count: 1,
        elementId: new Uint32Array(0),
        identityMode: 'none',
      };

      expect(() => buildMappingByPosition(withPos, withoutPos)).toThrow();
      expect(() => buildMappingByPosition(withoutPos, withPos)).toThrow();
    });
  });

  describe('detectDomainChange', () => {
    it('returns changed=true for new domain (not in prevDomains)', () => {
      const domain = createStableDomainInstance(10);
      const prevDomains = new Map<string, DomainInstance>();
      const result = detectDomainChange('inst1', domain, prevDomains);
      expect(result.changed).toBe(true);
      expect(result.mapping).toBeNull();
    });

    it('returns changed=false for identical domain', () => {
      const domain = createStableDomainInstance(10);
      const prevDomains = new Map<string, DomainInstance>([['inst1', domain]]);
      const result = detectDomainChange('inst1', domain, prevDomains);
      expect(result.changed).toBe(false);
      expect(result.mapping?.kind).toBe('identity');
    });

    it('returns mapping for count change (stable domains)', () => {
      const old = createStableDomainInstance(10);
      const new_ = createStableDomainInstance(11);
      const prevDomains = new Map<string, DomainInstance>([['inst1', old]]);

      const result = detectDomainChange('inst1', new_, prevDomains);
      expect(result.changed).toBe(true);
      expect(result.mapping).not.toBeNull();
      expect(result.mapping?.kind).toBe('byId');
    });

    it('returns null mapping for unstable domains without posHint', () => {
      const old = createUnstableDomainInstance(10);
      const new_ = createUnstableDomainInstance(11);
      const prevDomains = new Map<string, DomainInstance>([['inst1', old]]);

      const result = detectDomainChange('inst1', new_, prevDomains);
      expect(result.changed).toBe(true);
      expect(result.mapping).toBeNull();
    });

    it('uses byPosition for unstable domains with posHint', () => {
      const old: DomainInstance = {
        count: 2,
        elementId: new Uint32Array(0),
        identityMode: 'none',
        posHintXY: new Float32Array([0, 0, 1, 1]),
      };
      const new_: DomainInstance = {
        count: 2,
        elementId: new Uint32Array(0),
        identityMode: 'none',
        posHintXY: new Float32Array([0.1, 0.1, 0.9, 0.9]),
      };
      const prevDomains = new Map<string, DomainInstance>([['inst1', old]]);

      const result = detectDomainChange('inst1', new_, prevDomains);
      expect(result.changed).toBe(true);
      expect(result.mapping?.kind).toBe('byPosition');
    });
  });

  describe('countMappedElements', () => {
    it('counts identity mapping correctly', () => {
      const counts = countMappedElements({ kind: 'identity', count: 10 });
      expect(counts.mapped).toBe(10);
      expect(counts.unmapped).toBe(0);
    });

    it('counts byId mapping correctly', () => {
      const mapping = {
        kind: 'byId' as const,
        newToOld: new Int32Array([0, 1, -1, 3, -1]),
      };
      const counts = countMappedElements(mapping);
      expect(counts.mapped).toBe(3);
      expect(counts.unmapped).toBe(2);
    });

    it('counts all mapped', () => {
      const mapping = {
        kind: 'byId' as const,
        newToOld: new Int32Array([0, 1, 2]),
      };
      const counts = countMappedElements(mapping);
      expect(counts.mapped).toBe(3);
      expect(counts.unmapped).toBe(0);
    });

    it('counts all unmapped', () => {
      const mapping = {
        kind: 'byId' as const,
        newToOld: new Int32Array([-1, -1, -1]),
      };
      const counts = countMappedElements(mapping);
      expect(counts.mapped).toBe(0);
      expect(counts.unmapped).toBe(3);
    });
  });
});
