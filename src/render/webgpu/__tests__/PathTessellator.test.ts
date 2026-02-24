import { describe, expect, it } from 'vitest';
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

  it('throws on unsupported curve verbs', () => {
    const tessellator = new PathTessellator();
    const geometry = createGeometry([0, 0, 1, 0, 1, 1], [0, 3, 4]);
    expect(() => tessellator.getOrCreateMesh(geometry)).toThrow(/unsupported path verb/i);
  });
});
