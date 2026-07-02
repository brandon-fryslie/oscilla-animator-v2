/**
 * src/pillars/scene/blocks/clamp.ts
 *
 * A scalar transform on a route: confine the incoming scalar to `[lo, hi]`. Folded
 * from `… → Clamp → knob` into `max(lo, min(hi, upstream))` — the composed clamp,
 * which is why the vocabulary gained `min`/`max` (not a bespoke `clamp` op).
 * [LAW:one-type-per-behavior] one of three transform blocks (Scale/Offset/Clamp).
 */

import { clamp, konst } from '../../../render/scene-plan';
import { defineScalarModifier, sceneConfig } from '../scene-block';

export const ClampBlock = defineScalarModifier({
  type: 'Clamp',
  displayName: 'Clamp',
  config: {
    lo: sceneConfig.finiteNumber({ label: 'Min', control: 'number' }),
    hi: sceneConfig.finiteNumber({ label: 'Max', control: 'number' }),
  },
  // [LAW:no-silent-failure] With `lo > hi`, `max(lo, min(hi, x))` collapses to `lo`
  //   for every input — the clamp silently destroys the signal. Reject the inverted
  //   range at parse time so it surfaces as a diagnostic, never a dead constant.
  validateConfig: (config) =>
    config.lo <= config.hi
      ? null
      : `Min (${config.lo}) must be ≤ Max (${config.hi})`,
  transform: (config, value) => clamp(value, konst(config.lo), konst(config.hi)),
});
