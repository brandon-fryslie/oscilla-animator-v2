/**
 * New Contract Blocks Tests (Sprint 3)
 *
 * Verifies that new contract-based adapter and lens blocks work correctly.
 */

import { describe, it, expect } from 'vitest';
import { findAdapter } from '../adapter-spec';
import { getBlockDefinition } from '../registry';
import {
  canonicalType,
  unitNone,
  contractClamp01,
  contractWrap01,
  contractClamp11,
  contractNone,
} from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';

// Ensure all blocks are registered
import '../all';

describe('New Contract Blocks (Sprint 3)', () => {
  describe('P0: Contract adapter blocks', () => {
    it('Adapter_Clamp01: scalar(none) → scalar(clamp01)', () => {
      const from = canonicalType(FLOAT, unitNone(), undefined, contractNone());
      const to = canonicalType(FLOAT, unitNone(), undefined, contractClamp01());
      const adapter = findAdapter(from, to);
      expect(adapter).not.toBeNull();
      expect(adapter!.blockType).toBe('Adapter_Clamp01');
    });

    it('Adapter_Wrap01: scalar(none) → scalar(wrap01)', () => {
      const from = canonicalType(FLOAT, unitNone(), undefined, contractNone());
      const to = canonicalType(FLOAT, unitNone(), undefined, contractWrap01());
      const adapter = findAdapter(from, to);
      expect(adapter).not.toBeNull();
      expect(adapter!.blockType).toBe('Adapter_Wrap01');
    });

    it('Adapter_Clamp11: scalar(none) → scalar(clamp11)', () => {
      const from = canonicalType(FLOAT, unitNone(), undefined, contractNone());
      const to = canonicalType(FLOAT, unitNone(), undefined, contractClamp11());
      const adapter = findAdapter(from, to);
      expect(adapter).not.toBeNull();
      expect(adapter!.blockType).toBe('Adapter_Clamp11');
    });
  });

  describe('P1: Bidirectional bipolar ↔ unipolar adapters', () => {
    it('Adapter_BipolarToUnipolar: clamp11 → clamp01 (higher priority than Clamp01)', () => {
      const from = canonicalType(FLOAT, unitNone(), undefined, contractClamp11());
      const to = canonicalType(FLOAT, unitNone(), undefined, contractClamp01());
      const adapter = findAdapter(from, to);
      expect(adapter).not.toBeNull();
      expect(adapter!.blockType).toBe('Adapter_BipolarToUnipolar');
    });

    it('Adapter_UnipolarToBipolar: clamp01 → clamp11 (higher priority than Clamp11)', () => {
      const from = canonicalType(FLOAT, unitNone(), undefined, contractClamp01());
      const to = canonicalType(FLOAT, unitNone(), undefined, contractClamp11());
      const adapter = findAdapter(from, to);
      expect(adapter).not.toBeNull();
      expect(adapter!.blockType).toBe('Adapter_UnipolarToBipolar');
    });
  });

  describe('P2: Parameterized lens blocks', () => {
    it('Lens_NormalizeRange is registered with correct properties', () => {
      const normalizeRange = getBlockDefinition('Lens_NormalizeRange');
      expect(normalizeRange).toBeDefined();
      expect(normalizeRange!.category).toBe('lens');
      expect(normalizeRange!.outputs.out.type.contract?.kind).toBe('clamp01');
      expect(normalizeRange!.inputs.in).toBeDefined();
      expect(normalizeRange!.inputs.min).toBeDefined();
      expect(normalizeRange!.inputs.max).toBeDefined();
    });

    it('Lens_DenormalizeRange is registered with correct properties', () => {
      const denormalizeRange = getBlockDefinition('Lens_DenormalizeRange');
      expect(denormalizeRange).toBeDefined();
      expect(denormalizeRange!.category).toBe('lens');
      expect(denormalizeRange!.inputs.in.type.contract?.kind).toBe('clamp01');
      expect(denormalizeRange!.inputs.min).toBeDefined();
      expect(denormalizeRange!.inputs.max).toBeDefined();
      expect(denormalizeRange!.outputs.out).toBeDefined();
    });
  });
});
