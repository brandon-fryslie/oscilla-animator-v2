/**
 * src/pillars/scene/blocks/scale.ts
 *
 * A scalar transform on a route: multiply the incoming scalar by a factor. It is
 * the simplest scalar modifier — the `mul` half of a per-cell transform chain in
 * the Modulation Table. Wired `Constant → Scale → knob`, the compiler folds it to
 * `mul(konst(value), konst(factor))`; wired `Time → Scale → knob`, it scales the
 * live clock. [LAW:one-type-per-behavior] one of three transform blocks (with
 * Offset/Clamp) that differ only by their math.
 */

import { konst, mul } from '../../../render/scene-plan';
import { defineScalarModifier, sceneConfig } from '../scene-block';

export const ScaleBlock = defineScalarModifier({
  type: 'Scale',
  displayName: 'Scale',
  config: {
    factor: sceneConfig.finiteNumber({ label: 'Factor', control: 'number' }),
  },
  transform: (config, value) => mul(value, konst(config.factor)),
});
