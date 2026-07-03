/**
 * src/pillars/scene/blocks/kaleidoscope.ts
 *
 * A layout modifier: give each instance an `index`-derived rotation so the N
 * copies form an N-fold rotationally symmetric figure, where N is the upstream
 * instance count. Rotation is `index · (TAU / count)` — symmetry emerges from
 * pure index arithmetic, with no mirror primitive and no per-instance variation
 * beyond the angle.
 *
 * It rewrites only the rotation channel, so it composes: drop it onto a bare
 * `InstanceCount` (all at the origin) for an overlapping rosette, or after a
 * `RingLayout` so each copy on the ring also faces its own angle — a pinwheel.
 *
 * [LAW:composability] Owns neither count, position, nor color; the symmetry order
 *   is read from the bundle it transforms, so the same block is 6-fold or 12-fold
 *   purely by the count feeding it.
 */

import { add, intrinsic, konst, mul } from '../../../render/scene-plan';
import { defineSceneBlock } from '../scene-block';

const TAU = 2 * Math.PI;

export const KaleidoscopeBlock = defineSceneBlock({
  type: 'Kaleidoscope',
  role: 'modifier',
  catalog: {
    displayName: 'Kaleidoscope',
    category: 'modifier',
    ports: [
      { id: 'primary', label: 'Instances', direction: 'input', value: 'instanceBundle', default: { kind: 'required' } },
      { id: 'instances', label: 'Instances', direction: 'output', value: 'instanceBundle' },
    ],
  },
  config: {},
  contribute: () => ({
    role: 'modifier',
    apply: (bundle) => ({
      ...bundle,
      transform: {
        ...bundle.transform,
        // N-fold: each index turns by one slice of the full circle.
        rotation: add(
          bundle.transform.rotation,
          mul(intrinsic('index'), konst(TAU / bundle.count)),
        ),
      },
    }),
  }),
});
