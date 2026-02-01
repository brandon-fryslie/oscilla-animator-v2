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
      'Oscillator', 'UnitDelay', 'Hash', 'Accumulator',
      'Sin', 'Cos',
      'Expression',
      // Layout blocks (UV variants)
      'CircleLayoutUV', 'LineLayoutUV', 'GridLayoutUV',
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
      'RenderInstances2D',
      'StableIdHash', 'DomainIndex',
      'FromDomainId',
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
      'Broadcast',
      // 'LayoutAlongPath', // Not yet implemented
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

    it('GridLayoutUV allows ZipSig (for radius and phase signal inputs)', () => {
      const meta = getBlockCardinalityMetadata('GridLayoutUV');
      expect(meta?.broadcastPolicy).toBe('allowZipSig');
    });

    it('Broadcast requires explicit broadcast expression', () => {
      const meta = getBlockCardinalityMetadata('Broadcast');
      expect(meta?.broadcastPolicy).toBe('requireBroadcastExpr');
    });
  });

  describe('Lane coupling', () => {
    it('Most blocks are lane-local (lane-coupled only where needed)', () => {
      const allTypes = getAllBlockTypes();
      const laneCoupledBlocks = ['Reduce']; // Blocks where all elements contribute to result

      for (const blockType of allTypes) {
        const meta = getBlockCardinalityMetadata(blockType);
        if (meta) {
          if (laneCoupledBlocks.includes(blockType)) {
            expect(meta.laneCoupling).toBe('laneCoupled');
          } else {
            expect(meta.laneCoupling).toBe('laneLocal');
          }
        }
      }
    });
  });

  describe('Query functions', () => {
    it('getBlockCardinalityMetadata throws for non-existent block type', () => {
      expect(() => getBlockCardinalityMetadata('NonExistentBlock')).toThrow(
        'Unknown block type: "NonExistentBlock" is not registered'
      );
    });

    it('isCardinalityGeneric returns false for non-preserve blocks', () => {
      expect(isCardinalityGeneric('Array')).toBe(false); // transform
      expect(isCardinalityGeneric('RenderInstances2D')).toBe(false); // fieldOnly
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
