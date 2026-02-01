/**
 * Level 1: vec3 Everywhere (Data Representation)
 *
 * Tests proving the 3D data shape is correct.
 * Position fields are Float32Array stride 3, size fields are Float32Array stride 1.
 *
 * Note: Layout kernel tests (gridLayout3D, lineLayout3D, circleLayout3D,
 * applyZModulation) have been removed along with their implementations.
 * Layout is now handled by field kernels (circleLayoutUV, lineLayoutUV, gridLayoutUV).
 */
import { describe, it, expect } from 'vitest';
import {
  createPositionField,
  createSizeField,
  readPosition,
  writePosition,
  positionFieldCount,
  sizeFieldCount,
} from '../fields';

// =============================================================================
// Unit Tests
// =============================================================================

describe('Level 1 Unit Tests', () => {
  it('Position fields are Float32Array with stride 3 (not 2)', () => {
    const field = createPositionField(5);
    expect(field).toBeInstanceOf(Float32Array);
    // Stride 3: each instance takes 3 floats
    expect(field.length).toBe(5 * 3);
    // Verify it's NOT stride 2
    expect(field.length).not.toBe(5 * 2);
  });

  it('Constructing a position field with N instances allocates exactly N * 3 floats', () => {
    const counts = [0, 1, 7, 16, 100, 10000];
    for (const N of counts) {
      const field = createPositionField(N);
      expect(field.length).toBe(N * 3);
      expect(field.byteLength).toBe(N * 3 * 4); // 4 bytes per float32
    }
  });

  it('Reading back [x, y, z] triples from a position field returns the values written', () => {
    const field = createPositionField(3);

    writePosition(field, 0, 0.1, 0.2, 0.3);
    writePosition(field, 1, 0.4, 0.5, 0.6);
    writePosition(field, 2, 0.7, 0.8, 0.9);

    expect(readPosition(field, 0)).toEqual([
      expect.closeTo(0.1, 5),
      expect.closeTo(0.2, 5),
      expect.closeTo(0.3, 5),
    ]);
    expect(readPosition(field, 1)).toEqual([
      expect.closeTo(0.4, 5),
      expect.closeTo(0.5, 5),
      expect.closeTo(0.6, 5),
    ]);
    expect(readPosition(field, 2)).toEqual([
      expect.closeTo(0.7, 5),
      expect.closeTo(0.8, 5),
      expect.closeTo(0.9, 5),
    ]);
  });

  it('Size fields are Float32Array with stride 1, interpreted as world-space radius', () => {
    const field = createSizeField(5);
    expect(field).toBeInstanceOf(Float32Array);
    expect(field.length).toBe(5); // Stride 1: one float per instance

    // Write world-space radii
    field[0] = 0.05;
    field[1] = 0.1;
    field[2] = 0.03;
    field[3] = 0.5;
    field[4] = 1.0;

    // Read back
    expect(field[0]).toBeCloseTo(0.05);
    expect(field[1]).toBeCloseTo(0.1);
    expect(field[2]).toBeCloseTo(0.03);
    expect(field[3]).toBeCloseTo(0.5);
    expect(field[4]).toBeCloseTo(1.0);
  });
});

// =============================================================================
// Additional property tests
// =============================================================================

describe('Level 1 Property Tests', () => {
  it('Position field with N=0 produces empty array (no crash)', () => {
    const field = createPositionField(0);
    expect(field.length).toBe(0);
    expect(positionFieldCount(field)).toBe(0);
  });

  it('Size field with N=0 produces empty array (no crash)', () => {
    const field = createSizeField(0);
    expect(field.length).toBe(0);
    expect(sizeFieldCount(field)).toBe(0);
  });
});
