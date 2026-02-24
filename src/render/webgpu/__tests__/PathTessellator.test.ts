import { describe, expect, it, vi } from 'vitest';
import type { PathGeometry } from '../../types';
import { PathTessellator } from '../PathTessellator';

function createGeometry(points: number[], verbs: number[]): PathGeometry {
  return {
    topologyId: 100,
    points: new Float32Array(points),
    pointsCount: points.length / 2,
    verbs: new Uint8Array(verbs),
    flags: 1,
  };
}

describe('PathTessellator', () => {
  it('triangulates a closed square', () => {
    const tessellator = new PathTessellator();
    const geometry = createGeometry(
      [-1, -1, 1, -1, 1, 1, -1, 1],
      [0, 1, 1, 1, 4]
    );

    const mesh = tessellator.getOrCreateMesh(geometry);
    expect(mesh.vertexData.length).toBe(8);
    expect(mesh.indexData.length).toBe(6);
    expect(mesh.indexFormat).toBe('uint16');
  });

  it('handles concave polygons', () => {
    const tessellator = new PathTessellator();
    const geometry = createGeometry(
      [0, -1, 1, 0, 0.35, 0, 0, 1, -0.35, 0, -1, 0],
      [0, 1, 1, 1, 1, 1, 4]
    );

    const mesh = tessellator.getOrCreateMesh(geometry);
    expect(mesh.indexData.length).toBe((geometry.pointsCount - 2) * 3);
  });

  it('supports QUAD and CUBIC verbs by flattening curves', () => {
    const tessellator = new PathTessellator();
    const quadratic = createGeometry(
      [
        -1, 0,   // MOVE
        0, 1,    // QUAD control
        1, 0,    // QUAD end
        1, -1,   // LINE
        -1, -1,  // LINE
      ],
      [0, 3, 1, 1, 4]
    );

    const cubic = createGeometry(
      [
        -1, 0,   // MOVE
        -0.5, 1, // CUBIC control 1
        0.5, 1,  // CUBIC control 2
        1, 0,    // CUBIC end
        1, -1,   // LINE
        -1, -1,  // LINE
      ],
      [0, 2, 1, 1, 4]
    );

    const quadMesh = tessellator.getOrCreateMesh(quadratic);
    const cubicMesh = tessellator.getOrCreateMesh(cubic);

    expect(quadMesh.indexData.length).toBeGreaterThan(0);
    expect(cubicMesh.indexData.length).toBeGreaterThan(0);
  });

  it('throws on unknown path verbs', () => {
    const tessellator = new PathTessellator();
    const geometry = createGeometry([0, 0, 1, 0, 1, 1], [0, 99, 4]);
    expect(() => tessellator.getOrCreateMesh(geometry)).toThrow(/unsupported path verb/i);
  });

  it('removes collinear midpoints and triangulates successfully', () => {
    const tessellator = new PathTessellator();
    // Square with collinear midpoints on each edge
    const geometry = createGeometry(
      [-1, -1, 0, -1, 1, -1, 1, 0, 1, 1, 0, 1, -1, 1, -1, 0],
      [0, 1, 1, 1, 1, 1, 1, 1, 4]
    );

    const mesh = tessellator.getOrCreateMesh(geometry);
    // Collinear midpoints removed → 4-vertex square → 2 triangles = 6 indices
    expect(mesh.indexData.length).toBe(6);
  });

  it('returns empty mesh for fully collinear points', () => {
    const tessellator = new PathTessellator();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // All points on a line — degenerate, cannot form a polygon
    const geometry = createGeometry(
      [0, 0, 1, 0, 2, 0, 3, 0],
      [0, 1, 1, 1, 4]
    );

    try {
      const mesh = tessellator.getOrCreateMesh(geometry);
      expect(mesh.indexData.length).toBe(0);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('handles near-collinear vertices from floating-point accumulation', () => {
    const tessellator = new PathTessellator();
    // Triangle with a near-collinear point injected on one edge
    const geometry = createGeometry(
      [0, 0, 0.5, 1e-10, 1, 0, 0.5, 1],
      [0, 1, 1, 1, 4]
    );

    const mesh = tessellator.getOrCreateMesh(geometry);
    // Near-collinear midpoint removed → 3 vertices → 1 triangle = 3 indices
    expect(mesh.indexData.length).toBe(3);
  });

  it('gracefully returns empty mesh for self-intersecting contour', () => {
    const tessellator = new PathTessellator();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Bowtie (self-intersecting): edges cross at the center
    const geometry = createGeometry(
      [0, 0, 1, 1, 1, 0, 0, 1],
      [0, 1, 1, 1, 4]
    );

    try {
      const mesh = tessellator.getOrCreateMesh(geometry);
      // Ear-cutting can't handle self-intersection — should degrade gracefully
      expect(mesh.indexData.length).toBe(0);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
