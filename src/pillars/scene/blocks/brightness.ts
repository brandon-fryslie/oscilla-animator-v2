/**
 * src/pillars/scene/blocks/brightness.ts
 *
 * A color modifier: scales the upstream bundle's luminance by a factor. Proves
 * the modifier shape generalizes beyond `TransformBinding` to color — a modifier
 * rewrites whichever bundle field it owns, here the whole {@link ColorPlan}, so
 * it brightens a per-channel binding and a sampled palette/gradient LUT alike.
 *
 * [LAW:locality-or-seam] Self-contained: ports + a pure bundle transform. The
 *   luminance math lives at the color seam (`scaleColorPlanLuminance`); this
 *   block edits no draw block and no assembly code.
 */

import { defineSceneBlock, sceneConfig } from '../scene-block';
import { scaleColorPlanLuminance } from '../color';

const config = {
  factor: sceneConfig.positiveNumber({ label: 'Factor', control: 'number' }),
} as const;

export const BrightnessBlock = defineSceneBlock({
  type: 'Brightness',
  role: 'modifier',
  catalog: {
    displayName: 'Brightness',
    category: 'modifier',
    ports: [
      { id: 'primary', label: 'Instances', direction: 'input', value: 'instanceBundle', default: { kind: 'required' } },
      { id: 'instances', label: 'Instances', direction: 'output', value: 'instanceBundle' },
    ],
  },
  config,
  contribute: (config) => ({
    role: 'modifier',
    apply: (bundle) => ({ ...bundle, color: scaleColorPlanLuminance(bundle.color, config.factor) }),
  }),
});
