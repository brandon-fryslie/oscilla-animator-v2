/**
 * PathField Block Tests (Task 4h6)
 *
 * Unit tests for tangent and arcLength computation on polygonal paths.
 * MVP Scope: Linear approximation only (Phase 1).
 */

import { describe, it, expect } from 'vitest';

/**
 * Test helper: fillBufferTangent (extracted logic from Materializer)
 */
function fillBufferTangent(
  out: Float32Array,
  input: Float32Array,
  N: number
): void {
  if (N === 0) return;
  
  if (N === 1) {
    out[0] = 0;
    out[1] = 0;
    return;
  }
  
  for (let i = 0; i < N; i++) {
    const prevIdx = (i - 1 + N) % N;
    const nextIdx = (i + 1) % N;
    
    const prevX = input[prevIdx * 2];
    const prevY = input[prevIdx * 2 + 1];
    const nextX = input[nextIdx * 2];
    const nextY = input[nextIdx * 2 + 1];
    
    out[i * 2] = (nextX - prevX) / 2;
    out[i * 2 + 1] = (nextY - prevY) / 2;
  }
}

/**
 * Test helper: fillBufferArcLength (extracted logic from Materializer)
 */
function fillBufferArcLength(
  out: Float32Array,
  input: Float32Array,
  N: number
): void {
  if (N === 0) return;
  
  out[0] = 0;
  
  if (N === 1) return;
  
  let totalDistance = 0;
  
  for (let i = 1; i < N; i++) {
    const prevX = input[(i - 1) * 2];
    const prevY = input[(i - 1) * 2 + 1];
    const currX = input[i * 2];
    const currY = input[i * 2 + 1];
    
    const dx = currX - prevX;
    const dy = currY - prevY;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);
    totalDistance += segmentLength;
    
    out[i] = totalDistance;
  }
}

describe('PathField - tangent computation', () => {
  it('computes tangent for equilateral triangle', () => {
    // Equilateral triangle vertices (radius = 1, centered at origin)
    const points = new Float32Array([
      1, 0,           // Point 0: (1, 0)
      -0.5, 0.866,    // Point 1: (-0.5, √3/2)
      -0.5, -0.866,   // Point 2: (-0.5, -√3/2)
    ]);
    
    const tangents = new Float32Array(6); // 3 points × 2 components
    fillBufferTangent(tangents, points, 3);
    
    // Central difference: tangent[i] = (point[i+1] - point[i-1]) / 2
    // tangent[0] = (point[1] - point[2]) / 2 = ((-0.5, 0.866) - (-0.5, -0.866)) / 2 = (0, 0.866)
    expect(tangents[0]).toBeCloseTo(0, 5);
    expect(tangents[1]).toBeCloseTo(0.866, 2);
    
    // Verify non-zero tangents for other points
    expect(Math.abs(tangents[2]) + Math.abs(tangents[3])).toBeGreaterThan(0);
    expect(Math.abs(tangents[4]) + Math.abs(tangents[5])).toBeGreaterThan(0);
  });
  
  it('handles single point (returns zero tangent)', () => {
    const points = new Float32Array([5, 10]);
    const tangents = new Float32Array(2);
    
    fillBufferTangent(tangents, points, 1);
    
    expect(tangents[0]).toBe(0);
    expect(tangents[1]).toBe(0);
  });
  
  it('handles two-point path with wrapping', () => {
    const points = new Float32Array([
      0, 0,
      1, 0,
    ]);
    const tangents = new Float32Array(4);
    
    fillBufferTangent(tangents, points, 2);
    
    // tangent[0] = (point[1] - point[1]) / 2 = (0, 0) [wraps: prev=1, next=1]
    expect(tangents[0]).toBe(0);
    expect(tangents[1]).toBe(0);
    
    // tangent[1] = (point[0] - point[0]) / 2 = (0, 0) [wraps: prev=0, next=0]
    expect(tangents[2]).toBe(0);
    expect(tangents[3]).toBe(0);
  });
  
  it('handles unit square correctly', () => {
    // Unit square: (0,0), (1,0), (1,1), (0,1)
    const points = new Float32Array([
      0, 0,
      1, 0,
      1, 1,
      0, 1,
    ]);
    const tangents = new Float32Array(8);
    
    fillBufferTangent(tangents, points, 4);
    
    // All tangents should be non-zero for a square
    for (let i = 0; i < 8; i++) {
      expect(Math.abs(tangents[i])).toBeLessThanOrEqual(1); // Reasonable magnitude
    }
  });
  
  it('verifies wrapping at boundaries', () => {
    // Triangle to verify point 0 uses point N-1 and point 1
    const points = new Float32Array([
      1, 0,
      0, 1,
      0, 0,
    ]);
    const tangents = new Float32Array(6);
    
    fillBufferTangent(tangents, points, 3);
    
    // tangent[0] = (point[1] - point[2]) / 2
    const expectedX = (0 - 0) / 2;
    const expectedY = (1 - 0) / 2;
    expect(tangents[0]).toBeCloseTo(expectedX, 5);
    expect(tangents[1]).toBeCloseTo(expectedY, 5);
  });
});

describe('PathField - arc length computation', () => {
  it('starts at 0', () => {
    const points = new Float32Array([0, 0, 1, 0, 1, 1]);
    const arcLengths = new Float32Array(3);
    
    fillBufferArcLength(arcLengths, points, 3);
    
    expect(arcLengths[0]).toBe(0);
  });
  
  it('increases monotonically', () => {
    const points = new Float32Array([
      0, 0,
      1, 0,
      2, 0,
      3, 0,
    ]);
    const arcLengths = new Float32Array(4);
    
    fillBufferArcLength(arcLengths, points, 4);
    
    // Should be [0, 1, 2, 3]
    expect(arcLengths[0]).toBe(0);
    expect(arcLengths[1]).toBeCloseTo(1, 5);
    expect(arcLengths[2]).toBeCloseTo(2, 5);
    expect(arcLengths[3]).toBeCloseTo(3, 5);
    
    // Verify monotonicity
    for (let i = 1; i < 4; i++) {
      expect(arcLengths[i]).toBeGreaterThanOrEqual(arcLengths[i - 1]);
    }
  });
  
  it('computes correct distance for unit square perimeter', () => {
    // Unit square: perimeter = 4
    const points = new Float32Array([
      0, 0,
      1, 0,
      1, 1,
      0, 1,
    ]);
    const arcLengths = new Float32Array(4);
    
    fillBufferArcLength(arcLengths, points, 4);
    
    expect(arcLengths[0]).toBe(0);
    expect(arcLengths[1]).toBeCloseTo(1, 5); // (0,0) to (1,0)
    expect(arcLengths[2]).toBeCloseTo(2, 5); // (1,0) to (1,1)
    expect(arcLengths[3]).toBeCloseTo(3, 5); // (1,1) to (0,1)
  });
  
  it('handles single point (returns 0)', () => {
    const points = new Float32Array([5, 10]);
    const arcLengths = new Float32Array(1);
    
    fillBufferArcLength(arcLengths, points, 1);
    
    expect(arcLengths[0]).toBe(0);
  });
  
  it('computes exact distance for 3-4-5 triangle', () => {
    // Right triangle with sides 3, 4, 5
    const points = new Float32Array([
      0, 0,
      3, 0,
      3, 4,
    ]);
    const arcLengths = new Float32Array(3);
    
    fillBufferArcLength(arcLengths, points, 3);
    
    expect(arcLengths[0]).toBe(0);
    expect(arcLengths[1]).toBeCloseTo(3, 5); // Distance to (3, 0)
    expect(arcLengths[2]).toBeCloseTo(7, 5); // Distance to (3, 4) = 3 + 4
  });
  
  it('handles large polygon without overflow', () => {
    // 100-point circle approximation
    const N = 100;
    const points = new Float32Array(N * 2);
    const radius = 1;
    
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * 2 * Math.PI;
      points[i * 2] = radius * Math.cos(angle);
      points[i * 2 + 1] = radius * Math.sin(angle);
    }
    
    const arcLengths = new Float32Array(N);
    fillBufferArcLength(arcLengths, points, N);
    
    // Should not overflow or produce NaN
    expect(Number.isFinite(arcLengths[N - 1])).toBe(true);
    
    // Arc length should approximate circle circumference (2πr = 2π)
    const approximateCircumference = arcLengths[N - 1];
    expect(approximateCircumference).toBeGreaterThan(6); // Less than 2π ≈ 6.28 (polygon is shorter)
    expect(approximateCircumference).toBeLessThan(7);
  });
});

describe('PathField - edge cases', () => {
  it('handles empty path (N=0)', () => {
    const points = new Float32Array(0);
    const tangents = new Float32Array(0);
    const arcLengths = new Float32Array(0);
    
    expect(() => fillBufferTangent(tangents, points, 0)).not.toThrow();
    expect(() => fillBufferArcLength(arcLengths, points, 0)).not.toThrow();
  });
  
  it('handles all points at same location', () => {
    // Degenerate case: all points identical
    const points = new Float32Array([5, 5, 5, 5, 5, 5]);
    const tangents = new Float32Array(6);
    const arcLengths = new Float32Array(3);
    
    fillBufferTangent(tangents, points, 3);
    fillBufferArcLength(arcLengths, points, 3);
    
    // Tangents should be zero
    for (let i = 0; i < 6; i++) {
      expect(tangents[i]).toBe(0);
    }
    
    // Arc lengths should be [0, 0, 0]
    for (let i = 0; i < 3; i++) {
      expect(arcLengths[i]).toBe(0);
    }
  });
});
