/**
 * src/pillars/scene/blocks/gradient.ts
 *
 * A color source: ramps each instance's color between two opaque colors by its
 * normalized `rank`, so a field of instances reads as a perceptual gradient.
 * Like `SolidColor` it is a `modifier` that sets the bundle's color, differing
 * only in that the color *varies per instance* — a gradient is the per-instance
 * generalization of a solid color, on the same OKLab model (nt56.20).
 *
 * The two endpoints are opaque `#rrggbb` values; the OKLab lerp lives behind the
 * seam (`gradientColorBinding`), so this block names no color channels.
 *
 * [LAW:dataflow-not-control-flow] Position along the ramp is the value `t`
 *   (the `rank` intrinsic, already normalized to [0,1) as index/count), not a
 *   branch — every instance runs the one lerp.
 * [LAW:decomposition] Color is this block's only concern; placement stays with
 *   the instance source it modifies.
 */

import { intrinsic } from '../../../render/scene-plan';
import { defineSceneBlock, sceneConfig } from '../scene-block';
import { bindingColor, gradientColorBinding } from '../color';

const config = {
  colorStart: sceneConfig.color({ label: 'Start color', control: 'color' }),
  colorEnd: sceneConfig.color({ label: 'End color', control: 'color' }),
} as const;

export const GradientBlock = defineSceneBlock({
  type: 'Gradient',
  role: 'modifier',
  catalog: {
    displayName: 'Gradient',
    category: 'color',
    ports: [
      { id: 'primary', label: 'Instances', direction: 'input', value: 'instanceBundle' },
      { id: 'instances', label: 'Instances', direction: 'output', value: 'instanceBundle' },
    ],
  },
  config,
  contribute: (config) => ({
    role: 'modifier',
    // `rank` is already the normalized position in [0,1) across the bundle
    // (index/count), so it *is* the gradient parameter — no further scaling.
    apply: (bundle) => ({
      ...bundle,
      color: bindingColor(gradientColorBinding(config.colorStart, config.colorEnd, intrinsic('rank'))),
    }),
  }),
});
