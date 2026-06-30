/**
 * src/pillars/scene/blocks/spirograph.ts
 *
 * A layout modifier: place each instance at a point on a Lissajous curve, using
 * `rank` as a phase delay so each instance is a different moment along the trace.
 * Two oscillators at ratio `freqA:freqB` over the shared phase produce the
 * emergent figure; `speed` slides the sampling over time so the points flow
 * along the curve. Pure `rank`/`time`→position math — no per-demo source block,
 * no geometry beyond the point primitive.
 *
 * The figure is the value of `freqA:freqB`: a 1:1 ratio is an ellipse, 3:2 a
 * three-lobe trace, and so on — variation lives in the operands, not in modes.
 * [LAW:dataflow-not-control-flow]
 *
 * [LAW:composability] Owns neither count nor color; folds onto a bare
 *   `InstanceCount` (point geometry) to draw the trace.
 */

import { add, cos, input, intrinsic, konst, mul, sin } from '../../../render/scene-plan';
import { defineSceneBlock, sceneConfig } from '../scene-block';

const TAU = 2 * Math.PI;

const config = {
  radius: sceneConfig.positiveNumber({ label: 'Radius', control: 'number' }),
  freqA: sceneConfig.finiteNumber({ label: 'Frequency A', control: 'number' }),
  freqB: sceneConfig.finiteNumber({ label: 'Frequency B', control: 'number' }),
  speed: sceneConfig.finiteNumber({ label: 'Speed', control: 'number' }),
} as const;

export const SpirographBlock = defineSceneBlock({
  type: 'Spirograph',
  role: 'modifier',
  catalog: {
    displayName: 'Spirograph',
    category: 'modifier',
    ports: [
      { id: 'primary', label: 'Instances', direction: 'input', value: 'instanceBundle' },
      { id: 'instances', label: 'Instances', direction: 'output', value: 'instanceBundle' },
    ],
  },
  config,
  contribute: (config) => ({
    role: 'modifier',
    apply: (bundle) => {
      // Shared phase: rank places each instance along the trace, time slides it.
      const phase = add(
        mul(intrinsic('rank'), konst(TAU)),
        mul(input('time'), konst(config.speed)),
      );
      return {
        ...bundle,
        transform: {
          ...bundle.transform,
          positionX: add(
            bundle.transform.positionX,
            mul(konst(config.radius), sin(mul(konst(config.freqA), phase))),
          ),
          positionY: add(
            bundle.transform.positionY,
            mul(konst(config.radius), cos(mul(konst(config.freqB), phase))),
          ),
        },
      };
    },
  }),
});
