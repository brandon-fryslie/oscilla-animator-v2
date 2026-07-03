/**
 * src/pillars/scene/blocks/color-cycle.ts
 *
 * A color source that spins each instance through the color wheel by its `rank`
 * (a spatial spread across the field) and `time` (an animated drift) — the color
 * analogue of `WaveOffset`, which varies a transform channel by rank/time. It is
 * the native form of the demo "rank + time hue" coloring, on the perceptual
 * OKLab model (nt56.20).
 *
 * The block describes *intent* — how far the hue spreads, how fast it cycles,
 * how vivid and how bright — never a color channel. Hue itself lives only inside
 * the OKLCH→OKLab conversion at the seam (`oklchColorBinding`); the
 * color-opacity test guards that this block names no `hue`/`saturation`/etc.
 *
 * [LAW:dataflow-not-control-flow] Every instance runs the one OKLCH expression;
 *   its place on the wheel is the value `hueTurns`, not a branch.
 * [LAW:decomposition] Color is this block's only concern; placement stays with
 *   the instance source it modifies.
 */

import { add, input, intrinsic, konst, mul } from '../../../render/scene-plan';
import { defineSceneBlock, sceneConfig } from '../scene-block';
import { bindingColor, oklchColorBinding } from '../color';

// OKLab chroma roughly at the sRGB gamut edge; `vividness` is a 0..1 fraction of
// it, so the most vivid setting sits near the boundary without blowing past it.
const MAX_CHROMA = 0.2;

const config = {
  spread: sceneConfig.finiteNumber({ label: 'Spread', control: 'number' }),
  cycleSpeed: sceneConfig.finiteNumber({ label: 'Cycle speed', control: 'number' }),
  vividness: sceneConfig.positiveNumber({ label: 'Vividness', control: 'number' }),
  brightness: sceneConfig.positiveNumber({ label: 'Brightness', control: 'number' }),
} as const;

export const ColorCycleBlock = defineSceneBlock({
  type: 'ColorCycle',
  role: 'modifier',
  catalog: {
    displayName: 'Color Cycle',
    category: 'color',
    ports: [
      { id: 'primary', label: 'Instances', direction: 'input', value: 'instanceBundle', default: { kind: 'required' } },
      { id: 'instances', label: 'Instances', direction: 'output', value: 'instanceBundle' },
    ],
  },
  config,
  contribute: (config) => ({
    role: 'modifier',
    // Hue, in turns: a spatial spread across rank plus a time-driven drift.
    apply: (bundle) => ({
      ...bundle,
      color: bindingColor(
        oklchColorBinding(
          config.brightness,
          config.vividness * MAX_CHROMA,
          add(mul(intrinsic('rank'), konst(config.spread)), mul(input('time'), konst(config.cycleSpeed))),
        ),
      ),
    }),
  }),
});
