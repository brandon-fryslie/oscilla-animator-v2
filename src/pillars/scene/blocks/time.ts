/**
 * src/pillars/scene/blocks/time.ts
 *
 * A live scalar source: the runtime `time` channel in seconds, routable into any
 * modifier knob. Where a `Constant` bakes a number, `Time` proves a routed knob
 * carries a live `PlanExpr` — a knob wired to it animates every frame, because the
 * value it resolves to is `input('time')`, not a compile-time constant.
 *
 * [LAW:effects-at-boundaries] The block contributes a *description* (`input('time')`);
 *   the per-frame value is bound behind the renderer seam, not read here.
 */

import { input } from '../../../render/scene-plan';
import { defineSceneBlock } from '../scene-block';

export const TimeBlock = defineSceneBlock({
  type: 'Time',
  role: 'scalarSource',
  catalog: {
    displayName: 'Time',
    category: 'signal',
    ports: [{ id: 'value', label: 'Seconds', direction: 'output', value: 'scalar' }],
  },
  config: {},
  contribute: () => ({ role: 'scalarSource', value: input('time') }),
});
