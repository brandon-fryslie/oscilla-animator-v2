/**
 * src/pillars/scene/blocks/offset.ts
 *
 * A scalar transform on a route: add a constant amount to the incoming scalar —
 * the `add` op of a per-cell transform chain in the Modulation Table. Folded from
 * `… → Offset → knob` into `add(upstream, konst(amount))`.
 * [LAW:one-type-per-behavior] one of three transform blocks (Scale/Offset/Clamp).
 */

import { add, konst } from '../../../render/scene-plan';
import { defineScalarModifier, sceneConfig } from '../scene-block';

export const OffsetBlock = defineScalarModifier({
  type: 'Offset',
  displayName: 'Offset',
  config: {
    amount: sceneConfig.finiteNumber({ label: 'Amount', control: 'number' }),
  },
  transform: (config, value) => add(value, konst(config.amount)),
});
