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

import { add, input, intrinsic, mul, sin } from '../../../render/scene-plan';
import { defineSceneBlock } from '../scene-block';

/**
 * `amplitude`, `frequency`, and `speed` are routable scalar *knobs*: each is a
 * config default AND a scalar input port. Unwired, a knob resolves to its config
 * constant (the prior behavior); wired to a Constant/Time source it resolves to
 * that routed scalar — this is the block that proves a scalar drives a modifier's
 * math. [LAW:one-source-of-truth] One declaration is field + port + default.
 */
const knobs = {
  amplitude: { label: 'Amplitude', default: 0.15 },
  frequency: { label: 'Frequency', default: 6 },
  speed: { label: 'Speed', default: 2 },
} as const;

export const WaveOffsetBlock = defineSceneBlock({
  type: 'WaveOffset',
  role: 'modifier',
  catalog: {
    displayName: 'Wave Offset',
    category: 'modifier',
    ports: [
      { id: 'primary', label: 'Instances', direction: 'input', value: 'instanceBundle', default: { kind: 'required' } },
      { id: 'instances', label: 'Instances', direction: 'output', value: 'instanceBundle' },
    ],
  },
  config: {},
  knobs,
  contribute: (_config, inputs) => ({
    role: 'modifier',
    // [LAW:dataflow-not-control-flow] The displacement is added onto the upstream
    //   positionY expression; an amplitude of 0 is the identity, not a branch. The
    //   knob PlanExprs (`inputs.x`) are the resolved routed scalars — a wired
    //   Constant/Time or the synthesized config default, uniformly.
    apply: (bundle) => ({
      ...bundle,
      transform: {
        ...bundle.transform,
        positionY: add(
          bundle.transform.positionY,
          mul(
            inputs.amplitude,
            sin(
              add(
                mul(intrinsic('rank'), inputs.frequency),
                mul(input('time'), inputs.speed),
              ),
            ),
          ),
        ),
      },
    }),
  }),
});
