/**
 * src/pillars/scene/blocks/ring-layout.ts
 *
 * A layout modifier: arrange the upstream instances evenly around a circle by
 * their `rank`, optionally orbiting the whole ring over time. Pure
 * `rank`/`time`→position math folded onto the upstream transform — placement is
 * a modifier, not a fused source (the demo library's foundational cut).
 *
 * `angularSpeed` of 0 is a static ring; any other value spins the ring about the
 * origin — an orbit. The two are the same expression with a different value, not
 * two blocks. [LAW:dataflow-not-control-flow]
 *
 * [LAW:composability] Owns neither count nor color: it transforms whatever
 *   bundle feeds it. It drops onto a bare `InstanceCount` to make an orbit ring,
 *   or after another layout to arrange that layout's output on a circle.
 */

import { add, cos, input, intrinsic, konst, mul, sin } from '../../../render/scene-plan';
import { defineSceneBlock, sceneConfig } from '../scene-block';

const TAU = 2 * Math.PI;

const config = {
  radius: sceneConfig.positiveNumber({ label: 'Radius', control: 'number' }),
  angularSpeed: sceneConfig.finiteNumber({ label: 'Angular speed', control: 'number' }),
} as const;

export const RingLayoutBlock = defineSceneBlock({
  type: 'RingLayout',
  role: 'modifier',
  catalog: {
    displayName: 'Ring Layout',
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
      // angle = rank·TAU (even spacing) + time·angularSpeed (orbital spin).
      const angle = add(
        mul(intrinsic('rank'), konst(TAU)),
        mul(input('time'), konst(config.angularSpeed)),
      );
      return {
        ...bundle,
        transform: {
          ...bundle.transform,
          positionX: add(bundle.transform.positionX, mul(konst(config.radius), cos(angle))),
          positionY: add(bundle.transform.positionY, mul(konst(config.radius), sin(angle))),
        },
      };
    },
  }),
});
