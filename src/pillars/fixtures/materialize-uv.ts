/**
 * src/pillars/fixtures/materialize-uv.ts
 *
 * First Materialize fixture: writes a uv-derived gradient (slightly
 * tinted by an ExpressionModifier) into a 256×256 storage texture.
 *
 *   TextureGrid → ExpressionModifier → Materialize
 *
 * The expression program tints the gradient so we know the modifier
 * ran:
 *   color_r = u * 0.8
 *   color_g = v
 *   color_b = 0.3
 *   color_a = 1.0
 *
 * Verification of this fixture is structural only — Materialize writes
 * to a storage texture, not to the canvas, so the compiler-tester
 * canvas will be blank. Tests in __tests__/compile.test.ts assert the
 * roster has exactly one Compute pass with dispatch.mode='Texture' and
 * a TextureStore statement targeting the right texture.
 */

import type { PillarPatch } from '../types';

const TINT_GRADIENT = `
  color_r = u * 0.8
  color_g = v
  color_b = 0.3
  color_a = 1.0
`;

export function makeMaterializeUvPatch(): PillarPatch {
  return {
    blocks: [
      {
        id: 'grid',
        kind: 'generator',
        type: 'TextureGrid',
        config: { width: 256, height: 256 },
      },
      {
        id: 'tint',
        kind: 'modifier',
        type: 'ExpressionModifier',
        config: { expression: TINT_GRADIENT },
      },
      {
        id: 'sink',
        kind: 'intent',
        type: 'Materialize',
        config: {
          textureId: 'uv_gradient',
          width: 256,
          height: 256,
          format: 'rgba8unorm',
        },
      },
    ],
    edges: [
      { id: 'e0', source: 'grid', target: 'tint', inputSlot: 'primary', role: 'primary' },
      { id: 'e1', source: 'tint', target: 'sink', inputSlot: 'primary', role: 'primary' },
    ],
  };
}
