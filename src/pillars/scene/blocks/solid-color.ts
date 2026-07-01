/**
 * src/pillars/scene/blocks/solid-color.ts
 *
 * A color source: sets the upstream bundle's color to one opaque authored color.
 * It is the thinnest color block — the user picks a single color, with no
 * color-space channels in the API; the channel layout is minted at the seam
 * (`hexColorBinding`). Brightness and the richer color ops (gradients,
 * color-by-position) are adjustments/sources layered on this same model.
 *
 * It is a `modifier` over the instance bundle: it rewrites only the bundle's
 * `ColorBinding`, leaving count and transform untouched — exactly the modifier
 * shape Brightness uses, differing only in that it *replaces* the color rather
 * than scaling it.
 *
 * [LAW:decomposition] Color is its own concern, cut away from instancing: a
 *   source decides where instances go; a color block decides what color they
 *   are. Neither block has to name the other's vocabulary.
 * [LAW:one-source-of-truth] The opaque color is the block's only color field;
 *   the rgb channel layout exists only inside the `ColorBinding` it mints.
 */

import { defineSceneBlock, sceneConfig } from '../scene-block';
import { bindingColor, hexColorBinding } from '../color';

const config = {
  color: sceneConfig.color({ label: 'Color', control: 'color' }),
} as const;

export const SolidColorBlock = defineSceneBlock({
  type: 'SolidColor',
  role: 'modifier',
  catalog: {
    displayName: 'Solid Color',
    category: 'color',
    ports: [
      { id: 'primary', label: 'Instances', direction: 'input', value: 'instanceBundle', default: { kind: 'required' } },
      { id: 'instances', label: 'Instances', direction: 'output', value: 'instanceBundle' },
    ],
  },
  config,
  contribute: (config) => ({
    role: 'modifier',
    apply: (bundle) => ({ ...bundle, color: bindingColor(hexColorBinding(config.color)) }),
  }),
});
