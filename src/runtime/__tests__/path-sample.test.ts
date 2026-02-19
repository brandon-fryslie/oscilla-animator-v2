import { describe, it, expect } from 'vitest';
import { buildArcLengthTable, findSegment } from '../ValueExprMaterializer';

/**
 * Path Sample Algorithm Unit Tests
 *
 * Tests the core arc-length parameterization primitives:
 * - buildArcLengthTable: cumulative segment distances
 * - findSegment: binary search for segment + fractional position
 */

/** Helper: create Float32Array from [x,y,...] pairs */
function cp(...coords: number[]): Float32Array {
  return new Float32Array(coords);
}

describe('buildArcLengthTable', () => {
  it('open path: N-1 segments for N points', () => {
    // Square: (0,0) → (1,0) → (1,1) — open, 3 points, 2 segments
    const cpBuf = cp(0, 0, 1, 0, 1, 1);
    const { table, totalLength } = buildArcLengthTable(cpBuf, 3, false);
    expect(table.length).toBe(2);
    expect(totalLength).toBeCloseTo(2.0);
    expect(table[0]).toBeCloseTo(1.0); // first segment: (0,0)→(1,0) = 1
    expect(table[1]).toBeCloseTo(2.0); // second: (1,0)→(1,1) = 1, cumulative 2
  });

  it('closed path: N segments for N points (last→first)', () => {
    // Triangle: (0,0) → (1,0) → (0.5,1) — closed
    const cpBuf = cp(0, 0, 1, 0, 0.5, 1);
    const { table, totalLength } = buildArcLengthTable(cpBuf, 3, true);
    expect(table.length).toBe(3); // 3 segments for closed path
    // seg0: (0,0)→(1,0) = 1
    expect(table[0]).toBeCloseTo(1.0);
    // seg1: (1,0)→(0.5,1) = sqrt(0.25+1) = sqrt(1.25) ≈ 1.118
    expect(table[1]).toBeCloseTo(1 + Math.sqrt(1.25));
    // seg2: (0.5,1)→(0,0) = sqrt(0.25+1) = sqrt(1.25) ≈ 1.118
    expect(totalLength).toBeCloseTo(1 + 2 * Math.sqrt(1.25));
  });

  it('N=0 → empty table, zero length', () => {
    const { table, totalLength } = buildArcLengthTable(cp(), 0, false);
    expect(table.length).toBe(0);
    expect(totalLength).toBe(0);
  });

  it('N=1 open → no segments', () => {
    const { table, totalLength } = buildArcLengthTable(cp(5, 5), 1, false);
    expect(table.length).toBe(0);
    expect(totalLength).toBe(0);
  });

  it('N=1 closed → no segments', () => {
    const { table, totalLength } = buildArcLengthTable(cp(5, 5), 1, true);
    expect(table.length).toBe(1);
    // Closed: segment from point[0]→point[0] = zero length
    expect(totalLength).toBe(0);
  });

  it('all coincident points → zero total length', () => {
    const cpBuf = cp(3, 3, 3, 3, 3, 3);
    const { totalLength } = buildArcLengthTable(cpBuf, 3, false);
    expect(totalLength).toBe(0);
  });
});

describe('findSegment', () => {
  it('t=0 → first point (seg 0, frac 0)', () => {
    const table = new Float32Array([1, 2, 3]);
    const { segIndex, frac } = findSegment(table, 0);
    expect(segIndex).toBe(0);
    expect(frac).toBe(0);
  });

  it('t=1 → last point (seg last, frac 1)', () => {
    const table = new Float32Array([1, 2, 3]);
    const { segIndex, frac } = findSegment(table, 3);
    expect(segIndex).toBe(2);
    expect(frac).toBeCloseTo(1);
  });

  it('midpoint of evenly spaced segments', () => {
    // 3 segments of length 1 each, total 3
    const table = new Float32Array([1, 2, 3]);
    const { segIndex, frac } = findSegment(table, 1.5);
    expect(segIndex).toBe(1);
    expect(frac).toBeCloseTo(0.5);
  });

  it('empty table → seg 0, frac 0', () => {
    const { segIndex, frac } = findSegment(new Float32Array(0), 0.5);
    expect(segIndex).toBe(0);
    expect(frac).toBe(0);
  });

  it('L-shaped path: uneven segments produce correct interpolation', () => {
    // (0,0) → (3,0) → (3,4) — open path
    // seg0: length 3, seg1: length 4, total 7
    const table = new Float32Array([3, 7]);

    // At distance 1.5 → seg0 (length 3), frac = 1.5/3 = 0.5
    const r1 = findSegment(table, 1.5);
    expect(r1.segIndex).toBe(0);
    expect(r1.frac).toBeCloseTo(0.5);

    // At distance 5 → seg1 (starts at 3, length 4), frac = (5-3)/4 = 0.5
    const r2 = findSegment(table, 5);
    expect(r2.segIndex).toBe(1);
    expect(r2.frac).toBeCloseTo(0.5);
  });
});
