import type { StaticGeometrySpec } from '../../block-api';

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
      -s, -s, s, -s, s, s,
      -s, -s, s, s, -s, s,
    ],
  };
}
