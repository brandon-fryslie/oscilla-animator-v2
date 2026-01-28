/**
 * PlacementBasis Tests
 *
 * Tests for gauge-invariant placement coordinate system.
 */

import { describe, it, expect } from 'vitest';
import { MAX_ELEMENTS } from '../PlacementBasis';

describe('PlacementBasis Sprint 1: Type Foundation', () => {
  describe('constants', () => {
    it('MAX_ELEMENTS is defined and correct', () => {
      expect(MAX_ELEMENTS).toBe(10_000);
    });
  });

  describe('types', () => {
    it('PlacementFieldName type is exported from IR types', () => {
      // Type-only test - if this compiles, the type exists
      const field: import('../../compiler/ir/types').PlacementFieldName = 'uv';
      expect(['uv', 'rank', 'seed']).toContain(field);
    });

    it('BasisKind type is exported from IR types', () => {
      // Type-only test - if this compiles, the type exists
      const kind: import('../../compiler/ir/types').BasisKind = 'halton2D';
      expect(['halton2D', 'random', 'spiral', 'grid']).toContain(kind);
    });
  });
});
