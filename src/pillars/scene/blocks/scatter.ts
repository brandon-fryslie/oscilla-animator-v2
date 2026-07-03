/**
 * src/pillars/scene/blocks/scatter.ts
 *
 * A layout modifier: place each instance pseudo-randomly within a `width`×`height`
 * rectangle centered on the origin, by hashing its integer `index`. Pure
 * `index`→position math folded onto the upstream transform — placement is a
 * modifier, not a fused source (the demo library's foundational cut), exactly
 * like `RingLayout`/`Spirograph`.
 *
 * The seed is `index`, not `rank`: a pseudo-random hash needs an integer seed,
 * and `rank` is the normalized fraction. `seed` shifts the whole arrangement to a
 * different pseudo-random draw; X and Y read decorrelated hash streams so the
 * cloud fills the rectangle rather than collapsing onto a diagonal.
 *
 * [LAW:composability] Owns neither count nor color: it folds a scatter *offset*
 *   onto whatever bundle feeds it. Dropped onto a bare `InstanceCount` it is a
 *   pure scatter cloud; dropped after another layout it jitters that layout.
 * [LAW:dataflow-not-control-flow] Different clouds are different `seed`/size
 *   *values*, not modes — one expression, no branches.
 */

import { add, hash, intrinsic, konst, mul, sub } from '../../../render/scene-plan';
import { defineSceneBlock, sceneConfig } from '../scene-block';

// Decorrelates the Y hash stream from the X stream so the two axes are
// independent pseudo-random draws rather than the same value on both.
const Y_STREAM_SEED_OFFSET = 9871;

const config = {
  width: sceneConfig.positiveNumber({ label: 'Width', control: 'number' }),
  height: sceneConfig.positiveNumber({ label: 'Height', control: 'number' }),
  seed: sceneConfig.finiteNumber({ label: 'Seed', control: 'number' }),
} as const;

export const ScatterBlock = defineSceneBlock({
  type: 'Scatter',
  role: 'modifier',
  catalog: {
    displayName: 'Scatter',
    category: 'modifier',
    ports: [
      { id: 'primary', label: 'Instances', direction: 'input', value: 'instanceBundle', default: { kind: 'required' } },
      { id: 'instances', label: 'Instances', direction: 'output', value: 'instanceBundle' },
    ],
  },
  config,
  contribute: (config) => ({
    role: 'modifier',
    apply: (bundle) => {
      // hash(index + seed) ∈ [0, 1); map to a centered offset across the extent.
      const offset = (extent: number, seedShift: number) =>
        sub(
          mul(hash(add(intrinsic('index'), konst(config.seed + seedShift))), konst(extent)),
          konst(extent / 2),
        );
      const offsetX = offset(config.width, 0);
      const offsetY = offset(config.height, Y_STREAM_SEED_OFFSET);
      return {
        ...bundle,
        transform: {
          ...bundle.transform,
          positionX: add(bundle.transform.positionX, offsetX),
          positionY: add(bundle.transform.positionY, offsetY),
        },
      };
    },
  }),
});
