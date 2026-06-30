/**
 * src/pillars/scene/blocks/wave-offset.ts
 *
 * A transform modifier: displaces each instance along Y by a travelling wave
 * whose phase is driven by the instance's `rank` and animated by `time`. Proves
 * the modifier shape over a `TransformBinding` — rank/index/time `PlanExpr`
 * composition layered onto an upstream bundle, not a fresh source.
 *
 * [LAW:locality-or-seam] This block is self-contained: it declares its ports and
 *   a pure bundle transform. Adding it edits no draw block and no assembly code.
 */

import { add, input, intrinsic, konst, mul, sin } from '../../../render/scene-plan';
import { defineSceneBlock, sceneConfig } from '../scene-block';

const config = {
  amplitude: sceneConfig.finiteNumber({ label: 'Amplitude', control: 'number' }),
  frequency: sceneConfig.finiteNumber({ label: 'Frequency', control: 'number' }),
  speed: sceneConfig.finiteNumber({ label: 'Speed', control: 'number' }),
} as const;

export const WaveOffsetBlock = defineSceneBlock({
  type: 'WaveOffset',
  role: 'modifier',
  catalog: {
    displayName: 'Wave Offset',
    category: 'modifier',
    ports: [
      { id: 'primary', label: 'Instances', direction: 'input', value: 'instanceBundle' },
      { id: 'instances', label: 'Instances', direction: 'output', value: 'instanceBundle' },
    ],
  },
  config,
  contribute: (config) => ({
    role: 'modifier',
    // [LAW:dataflow-not-control-flow] The displacement is added onto the upstream
    //   positionY expression; an amplitude of 0 is the identity, not a branch.
    apply: (bundle) => ({
      ...bundle,
      transform: {
        ...bundle.transform,
        positionY: add(
          bundle.transform.positionY,
          mul(
            konst(config.amplitude),
            sin(
              add(
                mul(intrinsic('rank'), konst(config.frequency)),
                mul(input('time'), konst(config.speed)),
              ),
            ),
          ),
        ),
      },
    }),
  }),
});
