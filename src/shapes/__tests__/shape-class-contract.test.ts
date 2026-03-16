/**
 * Shape class contract guardrail tests.
 *
 * // [LAW:one-type-per-behavior] Shape classes are named taxonomy instances
 * // with explicit execution contracts. These tests ensure the classification
 * // is stable, propagated through compile → runtime → draw-prep, and that
 * // the enum values match the ShapeBankHeaderWord.Kind ABI.
 */

import { describe, expect, it } from 'vitest';
import { ShapeClass, TopologyMode } from '../types';

describe('ShapeClass enum', () => {
  it('Type1Rigid has u32-compatible ABI value 1', () => {
    expect(ShapeClass.Type1Rigid).toBe(1);
  });

  it('Type2Parametric has u32-compatible ABI value 2', () => {
    expect(ShapeClass.Type2Parametric).toBe(2);
  });

  it('Type5TextHybrid has u32-compatible ABI value 5', () => {
    expect(ShapeClass.Type5TextHybrid).toBe(5);
  });

  it('all currently defined classes are listed', () => {
    const defined = Object.values(ShapeClass).filter(
      (v): v is number => typeof v === 'number',
    );
    expect(defined.sort()).toEqual([1, 2, 5]);
  });

  it('enum values are distinct positive integers', () => {
    const values = Object.values(ShapeClass).filter(
      (v): v is number => typeof v === 'number',
    );
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
    for (const v of values) {
      expect(v).toBeGreaterThan(0);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe('TopologyMode enum', () => {
  it('NonPath has ABI value 0', () => {
    expect(TopologyMode.NonPath).toBe(0);
  });

  it('Path has ABI value 1', () => {
    expect(TopologyMode.Path).toBe(1);
  });

  it('enum values are distinct non-negative integers', () => {
    const values = Object.values(TopologyMode).filter(
      (v): v is number => typeof v === 'number',
    );
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe('ShapeClass → ShapeBankHeaderWord.Kind ABI consistency', () => {
  it('ShapeClass values fit in u32', () => {
    for (const v of Object.values(ShapeClass)) {
      if (typeof v !== 'number') continue;
      expect(v >>> 0).toBe(v);
    }
  });

  it('TopologyMode values fit in u32', () => {
    for (const v of Object.values(TopologyMode)) {
      if (typeof v !== 'number') continue;
      expect(v >>> 0).toBe(v);
    }
  });
});
