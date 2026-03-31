/**
 * GPU-IR DSL: Shape helpers producing StaticGeometrySpec.
 *
 * [LAW:one-source-of-truth] Shape geometry is defined here;
 * pipeline specs reference shapes by ShapeId from the manifest's shapeBank.
 */

import type { StaticGeometrySpec } from '../rust/boundary-contract';

/**
 * Unit quad centered at origin. Two triangles, CCW winding.
 * Vertices span [-halfSize, halfSize] on both axes.
 */
export const quad = (halfSize: number): StaticGeometrySpec => ({
  topology: 'triangle-list',
  vertexLayout: {
    stride: 8,
    attributes: {
      position: { format: 'float32x2', shaderLocation: 0 },
    },
  },
  vertexData: [
    -halfSize, -halfSize,  halfSize, -halfSize,  halfSize,  halfSize,
    -halfSize, -halfSize,  halfSize,  halfSize, -halfSize,  halfSize,
  ],
});

/**
 * Fullscreen quad covering NDC [-1, 1]. Two triangles, no index buffer.
 */
export const fullscreenQuad = (): StaticGeometrySpec => ({
  topology: 'triangle-list',
  vertexLayout: {
    stride: 8,
    attributes: {
      position: { format: 'float32x2', shaderLocation: 0 },
    },
  },
  vertexData: [
    -1, -1,
     1, -1,
     1,  1,
    -1, -1,
     1,  1,
    -1,  1,
  ],
});

/**
 * Arbitrary triangle-list geometry from an explicit vertex array.
 * Each vertex is 2 floats (x, y). Vertex count must be a multiple of 3.
 */
export const tri = (verts: readonly number[]): StaticGeometrySpec => ({
  topology: 'triangle-list',
  vertexLayout: {
    stride: 8,
    attributes: {
      position: { format: 'float32x2', shaderLocation: 0 },
    },
  },
  vertexData: verts,
});
