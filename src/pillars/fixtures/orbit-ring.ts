/**
 * src/pillars/fixtures/orbit-ring.ts
 *
 * Vertical-slice fixture: 64 dots on a ring, with a shape-preserving
 * ExpressionModifier that shrinks the radius and overrides one color channel.
 *
 * Graph shape:
 *
 *   ParticlePool ─primary─▶ ExpressionModifier ─primary─▶ DrawBundle
 *
 * After slice 2, the modifier's behavior is expressed as a text DSL program
 * in the block's config — no TS lambda, no ir-builder imports in the
 * fixture. The parser + compiler in src/pillars/expression/ converts the
 * text into the same ExprIR the hand-coded lambda used to produce.
 */

import type { PillarPatch } from '../types';
import { clearCanvas } from '../block-dsl/presentation/canvas-attachment';

/**
 * Text DSL program for the ExpressionModifier.
 *
 *   - pos_x and pos_y are both scaled by 0.75 → the ring remains a ring
 *     (same scale factor on both axes) but rendered at 75% radius.
 *   - color_r is overridden to a constant 0.2 → the red channel is mostly
 *     suppressed, shifting dots toward cyan/teal/blue instead of the
 *     Generator's full rainbow palette. Obvious visual tell that the
 *     modifier ran.
 */
const SHRINK_AND_TINT = `
  pos_x = pos_x * 0.75
  pos_y = pos_y * 0.75
  color_r = 0.2
`;

export function makeOrbitRingPatch(): PillarPatch {
  return {
    blocks: [
      {
        id: 'gen',
        kind: 'generator',
        type: 'ParticlePool',
        config: {
          domainId: 'dots',
          capacity: 64,
          radius: 0.7,
        },
      },
      {
        id: 'mod',
        kind: 'modifier',
        type: 'ExpressionModifier',
        config: {
          expression: SHRINK_AND_TINT,
        },
      },
      {
        id: 'sink',
        kind: 'intent',
        type: 'DrawBundle',
        config: {
          domainId: 'dots',
          shapeId: 'dots_quad',
          quadScale: 0.03,
          attachment: clearCanvas([0.05, 0.05, 0.07, 1]),
        },
      },
    ],
    edges: [
      {
        id: 'e0',
        source: 'gen',
        target: 'mod',
        inputSlot: 'primary',
        role: 'primary',
      },
      {
        id: 'e1',
        source: 'mod',
        target: 'sink',
        inputSlot: 'primary',
        role: 'primary',
      },
    ],
  };
}
