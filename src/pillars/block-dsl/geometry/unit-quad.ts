/**
 * src/pillars/block-dsl/geometry/unit-quad.ts
 *
 * Constructor for a unit quad geometry, lifted out of the legacy
 * `draw-bundle.ts`.
 *
 * The quad is two triangles in screen space, centered on the origin and
 * scaled by `scale` on each axis. The vertex shader adds the per-instance
 * position (loaded from a SoA field) to each vertex's local position to
 * place the quad at the instance's location.
 *
 * Future work in this directory: parametric polygon, circle approximation,
 * grid mesh, etc. Each gets its own file beside this one.
 *
 * This module is a leaf — it imports only types from the boundary contract.
 */

import type { StaticGeometrySpec } from '../../../render/rust/boundary-contract';

/**
 * Build a unit quad as two triangles. The quad spans `[-scale, scale]` on
 * both axes in local space. Triangles are wound counter-clockwise.
 */
export function makeUnitQuad(scale: number): StaticGeometrySpec {
  const s = scale;
  return {
    topology: 'triangle-list',
    vertexLayout: {
      stride: 8,
      attributes: {
        position: { format: 'float32x2', shaderLocation: 0 },
      },
    },
    vertexData: [
      -s, -s,  s, -s,  s,  s,
      -s, -s,  s,  s, -s,  s,
    ],
  };
}
