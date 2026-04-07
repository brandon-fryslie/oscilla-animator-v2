/**
 * src/pillars/fixtures/orbit-grid-oklch.ts
 *
 * Track 2 fixture: validates ScatterUVModifier and OklchColorModifier in
 * one pass.
 *
 *   ParticlePool → ScatterUVModifier → OklchColorModifier → DrawBundle
 *
 * The Generator emits 64 particles. ScatterUV overrides the ring layout
 * with an 8×8 grid centered at the origin. OklchColorModifier overrides
 * the rainbow colors with a uniform teal (l=0.7, c=0.15, h=210°).
 *
 * Visual: an 8×8 grid of teal squares.
 */

import type { PillarPatch } from '../types';
import { clearCanvas } from '../block-dsl/presentation/canvas-attachment';

export function makeOrbitGridOklchPatch(): PillarPatch {
  return {
    blocks: [
      {
        id: 'gen',
        kind: 'generator',
        type: 'ParticlePool',
        config: {
          domainId: 'dots',
          capacity: 64,
          radius: 0.5,
          timeFactor: 0,
        },
      },
      {
        id: 'grid',
        kind: 'modifier',
        type: 'ScatterUVModifier',
        config: {
          cols: 8,
          rows: 8,
          spacing: 0.18,
        },
      },
      {
        id: 'tint',
        kind: 'modifier',
        type: 'OklchColorModifier',
        config: { l: 0.7, c: 0.15, h: 210 },
      },
      {
        id: 'sink',
        kind: 'intent',
        type: 'DrawBundle',
        config: {
          domainId: 'dots',
          shapeId: 'dots_quad',
          quadScale: 0.04,
          attachment: clearCanvas([0.05, 0.05, 0.07, 1]),
        },
      },
    ],
    edges: [
      { id: 'e0', source: 'gen', target: 'grid', inputSlot: 'primary', role: 'primary' },
      { id: 'e1', source: 'grid', target: 'tint', inputSlot: 'primary', role: 'primary' },
      { id: 'e2', source: 'tint', target: 'sink', inputSlot: 'primary', role: 'primary' },
    ],
  };
}
