/**
 * src/pillars/scene/blocks/color-from-gradient.ts
 *
 * A color source: ramps each instance's color across an N-stop gradient by its
 * normalized `rank`, reading as a smooth heatmap across the field. The stops are
 * N opaque colors; the piecewise interpolation the pure-math PlanExpr vocabulary
 * cannot denote (an N-stop ramp) is a *texture sample* — the stops bake to an
 * N-texel OKLab LUT sampled with `linear` filter, so the GPU interpolates
 * between adjacent stops in OKLab (`gradientLutColorPlan`).
 *
 * It is the N-stop generalization of `Gradient` (which ramps two opaque colors
 * by hand in OKLab): the same perceptual interpolation, now for any number of
 * stops, because the LUT mechanism replaces the per-channel lerp.
 *
 * [LAW:carrying-cost] One block covers every stop count; arity is the length of
 *   the value `stops`, not a new block per number of stops.
 * [LAW:decomposition] Color is its only concern; placement stays with the
 *   instance source it modifies.
 */

import { defineSceneBlock, sceneConfig } from '../scene-block';
import { gradientLutColorPlan } from '../color';

const config = {
  stops: sceneConfig.colorList({ label: 'Stops', control: 'colorList' }),
} as const;

export const ColorFromGradientBlock = defineSceneBlock({
  type: 'ColorFromGradient',
  role: 'modifier',
  catalog: {
    displayName: 'Color From Gradient',
    category: 'color',
    ports: [
      { id: 'primary', label: 'Instances', direction: 'input', value: 'instanceBundle', default: { kind: 'required' } },
      { id: 'instances', label: 'Instances', direction: 'output', value: 'instanceBundle' },
    ],
  },
  config,
  contribute: (config) => ({
    role: 'modifier',
    apply: (bundle) => ({ ...bundle, color: gradientLutColorPlan(config.stops) }),
  }),
});
