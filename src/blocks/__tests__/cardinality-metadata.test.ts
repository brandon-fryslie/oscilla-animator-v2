/**
 * Cardinality Metadata Tests
 *
 * Validates that cardinality-generic block metadata is correctly defined
 * and queryable by the compiler.
 */

import { describe, it, expect } from 'vitest';
import {
  getBlockDefinition,
  getBlockCardinalityMetadata,
  isCardinalityGeneric,
  getAllBlockTypes,
  type BlockCardinalityMetadata,
} from '../registry';

// Import all blocks to ensure they're registered
import '../math-blocks';
import '../signal-blocks';
import '../time-blocks';
import '../field-blocks';
import '../render-blocks';
import '../instance-blocks';
import '../array-blocks';
import '../primitive-blocks';
import '../color-blocks';
import '../geometry-blocks';
import '../expression-blocks';
import '../identity-blocks';
import '../test-blocks';
import '../field-operations-blocks';
import '../path-blocks';
import '../path-operators-blocks';

describe('Cardinality Metadata', () => {
  describe('Registry types', () => {
    it('exports cardinality metadata types correctly', () => {
      const meta: BlockCardinalityMetadata = {
        cardinalityMode: 'preserve',
        laneCoupling: 'laneLocal',
        broadcastPolicy: 'allowZipSig',
      };
      expect(meta.cardinalityMode).toBe('preserve');
      expect(meta.laneCoupling).toBe('laneLocal');
      expect(meta.broadcastPolicy).toBe('allowZipSig');
    });
  });

  describe('Cardinality-generic blocks (preserve + laneLocal)', () => {
    const genericBlocks = [
      'Add', 'Subtract', 'Multiply', 'Divide', 'Modulo',
      'Oscillator', 'UnitDelay', 'Hash', 'Id01',
      'ColorLFO', 'HSVToColor', 'HsvToRgb',
      'PolarToCartesian', 'OffsetPosition',
      'Expression',
    ];

    it.each(genericBlocks)('%s is cardinality-generic', (blockType) => {
      expect(isCardinalityGeneric(blockType)).toBe(true);
      const meta = getBlockCardinalityMetadata(blockType);
      expect(meta).toBeDefined();
      expect(meta?.cardinalityMode).toBe('preserve');
      expect(meta?.laneCoupling).toBe('laneLocal');
    });
  });

  describe('Signal-only blocks (sources)', () => {
    const signalOnlyBlocks = [
      'InfiniteTimeRoot',
      'Ellipse', 'Rect',
      'ProceduralPolygon', 'ProceduralStar',
      'TestSignal',
    ];

    it.each(signalOnlyBlocks)('%s is signalOnly', (blockType) => {
      const meta = getBlockCardinalityMetadata(blockType);
      expect(meta).toBeDefined();
      expect(meta?.cardinalityMode).toBe('signalOnly');
    });
  });

  describe('Field-only blocks', () => {
    const fieldOnlyBlocks = [
      'RenderCircle', 'RenderRect', 'RenderInstances2D',
      'StableIdHash', 'DomainIndex',
      'FieldFromDomainId',
      'FieldAdd', 'FieldMultiply', 'FieldScale',
      'FieldSin', 'FieldCos', 'FieldMod',
      'PathField',
    ];

    it.each(fieldOnlyBlocks)('%s is fieldOnly', (blockType) => {
      const meta = getBlockCardinalityMetadata(blockType);
      expect(meta).toBeDefined();
      expect(meta?.cardinalityMode).toBe('fieldOnly');
    });
  });

  describe('Transform blocks (cardinality changers)', () => {
    const transformBlocks = [
      'Array',
      'FieldBroadcast',
      'LayoutAlongPath',
    ];

    it.each(transformBlocks)('%s is transform', (blockType) => {
      const meta = getBlockCardinalityMetadata(blockType);
      expect(meta).toBeDefined();
      expect(meta?.cardinalityMode).toBe('transform');
    });
  });

  describe('Broadcast policy', () => {
    it('Add allows ZipSig (Signal+Field mixing)', () => {
      const meta = getBlockCardinalityMetadata('Add');
      expect(meta?.broadcastPolicy).toBe('allowZipSig');
    });

    it('GridLayout disallows Signal mixing', () => {
      const meta = getBlockCardinalityMetadata('GridLayout');
      expect(meta?.broadcastPolicy).toBe('disallowSignalMix');
    });

    it('FieldBroadcast requires explicit broadcast expression', () => {
      const meta = getBlockCardinalityMetadata('FieldBroadcast');
      expect(meta?.broadcastPolicy).toBe('requireBroadcastExpr');
    });
  });

  describe('Lane coupling', () => {
    it('All registered blocks are lane-local (no lane-coupled blocks yet)', () => {
      const allTypes = getAllBlockTypes();
      for (const blockType of allTypes) {
        const meta = getBlockCardinalityMetadata(blockType);
        if (meta) {
          expect(meta.laneCoupling).toBe('laneLocal');
        }
      }
    });
  });

  describe('Query functions', () => {
    it('getBlockCardinalityMetadata returns undefined for blocks without metadata', () => {
      // Create a hypothetical block type that doesn't exist
      const meta = getBlockCardinalityMetadata('NonExistentBlock');
      expect(meta).toBeUndefined();
    });

    it('isCardinalityGeneric returns false for non-preserve blocks', () => {
      expect(isCardinalityGeneric('Array')).toBe(false); // transform
      expect(isCardinalityGeneric('RenderCircle')).toBe(false); // fieldOnly
      expect(isCardinalityGeneric('InfiniteTimeRoot')).toBe(false); // signalOnly
    });
  });

  describe('Metadata completeness', () => {
    it('All blocks have cardinality metadata defined', () => {
      const allTypes = getAllBlockTypes();
      const missingMetadata: string[] = [];

      for (const blockType of allTypes) {
        const def = getBlockDefinition(blockType);
        if (!def?.cardinality) {
          missingMetadata.push(blockType);
        }
      }

      // Should be empty - all blocks should have metadata
      expect(missingMetadata).toEqual([]);
    });
  });
});
