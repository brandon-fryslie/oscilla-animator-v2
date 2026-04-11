/**
 * src/pillars/fixtures/clock-driven-wobble.ts
 *
 * Slice 3 fixture: secondary bundle inputs end-to-end.
 *
 * Graph shape:
 *
 *   ParticlePool (timeFactor: 0)  ─primary────▶ ExpressionModifier ─primary─▶ DrawBundle
 *                                                  ▲
 *   Clock                          ─secondary──────┘
 *                                    inputSlot: 'clock'
 *
 * The Generator emits a STATIC ring (timeFactor=0 collapses the sys:time
 * contribution inside the initial angle computation). The Clock block is
 * a zero-cost Generator whose only field is `time = loadGlobal('sys:time')`.
 *
 * The ExpressionModifier reads both bundles. Its expression program adds a
 * small clock-driven circular offset to each dot's position:
 *
 *   pos_x = primary.pos_x + sin(clock.time * 2.0) * 0.1
 *   pos_y = primary.pos_y + cos(clock.time * 2.0) * 0.1
 *
 * Visual: 64 dots arranged in a static ring, each shifting by a small
 * uniform vector whose direction rotates over time. Compared against the
 * orbit-ring fixture (which animates via time INSIDE the Generator), this
 * fixture proves the Modifier can reach a clock-driven value via a
 * secondary bundle and weave it into the primary bundle's field math.
 *
 * Note: every dot applies the SAME offset at a given frame (clock.time is
 * a scalar global, not a per-instance field). This is intentional for
 * slice 3 — per-instance cross-bundle reads require `LoadField` rather
 * than `LoadGlobal`, which is slice 4.
 */

import type { PillarPatch } from '../types';
import { clearCanvas } from '../block-dsl/presentation/canvas-attachment';

const CLOCK_DRIVEN_OFFSETS = `
  pos_x = primary.pos_x + sin(clock.time * 2.0) * 0.1
  pos_y = primary.pos_y + cos(clock.time * 2.0) * 0.1
`;

export function makeClockDrivenWobblePatch(): PillarPatch {
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
          // Static ring — time contribution to the Generator's angle is
          // multiplied by 0. All visible motion must come from the
          // downstream ExpressionModifier reading clock.time.
          timeFactor: 0,
        },
      },
      {
        id: 'clock',
        kind: 'generator',
        type: 'Clock',
        config: {},
      },
      {
        id: 'mod',
        kind: 'modifier',
        type: 'ExpressionModifier',
        config: {
          expression: CLOCK_DRIVEN_OFFSETS,
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
      // ParticlePool → ExpressionModifier (primary)
      {
        id: 'e0',
        source: 'gen',
        target: 'mod',
        inputSlot: 'primary',
        role: 'primary',
      },
      // Clock → ExpressionModifier (secondary, inputSlot='clock')
      {
        id: 'e1',
        source: 'clock',
        target: 'mod',
        inputSlot: 'clock',
        role: 'secondary',
      },
      // ExpressionModifier → DrawBundle (primary)
      {
        id: 'e2',
        source: 'mod',
        target: 'sink',
        inputSlot: 'primary',
        role: 'primary',
      },
    ],
  };
}
