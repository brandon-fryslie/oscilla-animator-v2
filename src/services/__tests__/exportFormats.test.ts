/**
 * Export Format Utilities Tests
 *
 * Tests format utilities for patch export.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  formatBlockShorthand,
  formatConnectionLine,
  formatConfigValue,
  isNonDefault,
} from '../exportFormats';
import type { Block, Edge } from '../../graph/Patch';
import type { BlockDef } from '../../blocks/registry';
import { blockId } from '../../types';
import { canonicalType, FLOAT, INT, BOOL, VEC2, VEC3, COLOR,  CAMERA_PROJECTION } from '../../core/canonical-types';
import { createTestBlock, resetBlockFactory } from '../../test-utils/block-factory';

describe('exportFormats', () => {
  beforeEach(() => {
    resetBlockFactory();
  });

  describe('formatConfigValue', () => {
    it('formats primitives correctly', () => {
      expect(formatConfigValue(42)).toBe('42');
      expect(formatConfigValue(3.14)).toBe('3.14');
      expect(formatConfigValue(true)).toBe('true');
      expect(formatConfigValue(false)).toBe('false');
      expect(formatConfigValue('hello')).toBe('hello');
      expect(formatConfigValue(null)).toBe('null');
      expect(formatConfigValue(undefined)).toBe('undefined');
    });

    it('formats arrays correctly', () => {
      expect(formatConfigValue([1, 2, 3])).toBe('[1, 2, 3]');
      expect(formatConfigValue([])).toBe('[]');
      expect(formatConfigValue([true, false])).toBe('[true, false]');
    });

    it('formats objects correctly', () => {
      expect(formatConfigValue({ x: 1, y: 2 })).toBe('{x: 1, y: 2}');
      expect(formatConfigValue({})).toBe('{}');
    });

    it('formats expression strings as-is', () => {
      expect(formatConfigValue('index*0.1')).toBe('index*0.1');
      expect(formatConfigValue('sin(t)')).toBe('sin(t)');
    });

    it('formats nested structures', () => {
      expect(formatConfigValue([{ x: 1 }, { x: 2 }])).toBe('[{x: 1}, {x: 2}]');
      expect(formatConfigValue({ arr: [1, 2] })).toBe('{arr: [1, 2]}');
    });
  });

  describe('isNonDefault', () => {
    it('returns false for matching primitives', () => {
      expect(isNonDefault(42, 42)).toBe(false);
      expect(isNonDefault('hello', 'hello')).toBe(false);
      expect(isNonDefault(true, true)).toBe(false);
    });

    it('returns true for different primitives', () => {
      expect(isNonDefault(42, 100)).toBe(true);
      expect(isNonDefault('hello', 'world')).toBe(true);
      expect(isNonDefault(true, false)).toBe(true);
    });

    it('returns true when default is undefined', () => {
      expect(isNonDefault(42, undefined)).toBe(true);
      expect(isNonDefault('value', undefined)).toBe(true);
    });

    it('compares arrays correctly', () => {
      expect(isNonDefault([1, 2, 3], [1, 2, 3])).toBe(false);
      expect(isNonDefault([1, 2], [1, 2, 3])).toBe(true);
      expect(isNonDefault([1, 2, 3], [1, 3, 3])).toBe(true);
    });

    it('compares objects correctly', () => {
      expect(isNonDefault({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(false);
      expect(isNonDefault({ x: 1 }, { x: 1, y: 2 })).toBe(true);
      expect(isNonDefault({ x: 1, y: 2 }, { x: 1, y: 3 })).toBe(true);
    });
  });

  describe('formatBlockShorthand', () => {
    it('formats block without definition (no config)', () => {
      const block = createTestBlock({
        id: blockId('b1'),
        type: 'Array',
        params: { count: 100 },
      });

      expect(formatBlockShorthand(block, undefined)).toBe('b1:Array');
    });

    it('omits parentheses when all values are default', () => {
      const block = createTestBlock({
        id: blockId('b1'),
        type: 'Array',
        params: { count: 100 },
      });

      const definition: BlockDef = {
        type: 'Array',
        label: 'Array',
        category: 'Instance',
        form: 'primitive',
        capability: 'pure',
        inputs: {
          count: { type: canonicalType(FLOAT), value: 100 },
        },
        outputs: {
          instances: { type: canonicalType(FLOAT) },
        },
        lower: () => ({ outputsById: {} }),
      };

      expect(formatBlockShorthand(block, definition)).toBe('b1:Array');
    });

    it('includes non-default config values', () => {
      const block = createTestBlock({
        id: blockId('b1'),
        type: 'Array',
        params: { count: 5000 },
      });

      const definition: BlockDef = {
        type: 'Array',
        label: 'Array',
        category: 'Instance',
        form: 'primitive',
        capability: 'pure',
        inputs: {
          count: { type: canonicalType(FLOAT), value: 100 },
        },
        outputs: {
          instances: { type: canonicalType(FLOAT) },
        },
        lower: () => ({ outputsById: {} }),
      };

      expect(formatBlockShorthand(block, definition)).toBe('b1:Array(count=5000)');
    });

    it('includes multiple non-default config values', () => {
      const block = createTestBlock({
        id: blockId('b3'),
        type: 'ProceduralPolygon',
        params: { sides: 5, rx: 0.2 },
      });

      const definition: BlockDef = {
        type: 'ProceduralPolygon',
        label: 'Procedural Polygon',
        category: 'Shape',
        form: 'primitive',
        capability: 'pure',
        inputs: {
          sides: { type: canonicalType(FLOAT), value: 3 },
          rx: { type: canonicalType(FLOAT), value: 0.5 },
        },
        outputs: {
          shape: { type: canonicalType(SHAPE) },
        },
        lower: () => ({ outputsById: {} }),
      };

      expect(formatBlockShorthand(block, definition)).toBe(
        'b3:ProceduralPolygon(sides=5, rx=0.2)'
      );
    });

    it('formats expression values', () => {
      const block = createTestBlock({
        id: blockId('b4'),
        type: 'HSVColor',
        params: { h: 'index*0.1' },
      });

      const definition: BlockDef = {
        type: 'HSVColor',
        label: 'HSV Color',
        category: 'Color',
        form: 'primitive',
        capability: 'pure',
        inputs: {
          h: { type: canonicalType(FLOAT), value: 0 },
        },
        outputs: {
          color: { type: canonicalType(COLOR) },
        },
        lower: () => ({ outputsById: {} }),
      };

      expect(formatBlockShorthand(block, definition)).toBe('b4:HSVColor(h=index*0.1)');
    });
  });

  describe('formatConnectionLine', () => {
    it('formats valid connection correctly', () => {
      const block1 = createTestBlock({
        id: blockId('b1'),
        type: 'Array',
        outputPorts: new Map([['instances', { id: 'instances' }]]),
      });
      const block2 = createTestBlock({
        id: blockId('b2'),
        type: 'CircleLayout',
        inputPorts: new Map([['instances', { id: 'instances', combineMode: 'last' as const }]]),
      });
      const blocks = new Map<string, Block>([
        [blockId('b1'), block1],
        [blockId('b2'), block2],
      ]);

      const edge: Edge = {
        id: 'e1',
        from: { kind: 'port', blockId: 'b1', slotId: 'instances' },
        to: { kind: 'port', blockId: 'b2', slotId: 'instances' },
        enabled: true,
        sortKey: 0,
        role: { kind: 'user', meta: {} as Record<string, never> },
      };

      expect(formatConnectionLine(edge, blocks)).toBe('b1.instances → b2.instances');
    });

    it('handles invalid edge (missing block) gracefully', () => {
      const blocks = new Map<string, Block>();
      const edge: Edge = {
        id: 'e1',
        from: { kind: 'port', blockId: 'b1', slotId: 'out' },
        to: { kind: 'port', blockId: 'b2', slotId: 'in' },
        enabled: true,
        sortKey: 0,
        role: { kind: 'user', meta: {} as Record<string, never> },
      };

      const result = formatConnectionLine(edge, blocks);
      expect(result).toContain('[INVALID]');
    });
  });
});
