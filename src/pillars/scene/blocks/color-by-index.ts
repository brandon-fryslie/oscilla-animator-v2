/**
 * src/pillars/scene/blocks/color-by-index.ts
 *
 * A color source: gives each instance the palette entry at its integer index,
 * wrapping when the field is larger than the palette — "every dot a different
 * color". The palette is N opaque colors; the lookup the pure-math PlanExpr
 * vocabulary lacks (selection by index) is a *texture sample* — the palette
 * bakes to an N-texel OKLab LUT sampled with `nearest` filter, so each index
 * hits its entry exactly (`paletteColorPlan`).
 *
 * Like every color block it is a `modifier` that replaces the bundle's color,
 * differing from `SolidColor`/`Gradient` only in that the color comes from a
 * lookup table rather than per-channel math — selection lives in the sample
 * *coordinate*, not in a branch over which color to pick.
 *
 * [LAW:decomposition] Color is its only concern; placement stays with the
 *   instance source it modifies, so a palette drops onto any layout unchanged.
 * [LAW:one-source-of-truth] The palette is a list of opaque colors; the OKLab
 *   LUT baking and the index→coord mapping live behind the seam, never on the API.
 */

import { defineSceneBlock, sceneConfig } from '../scene-block';
import { paletteColorPlan } from '../color';

const config = {
  palette: sceneConfig.colorList({ label: 'Palette', control: 'colorList' }),
} as const;

export const ColorByIndexBlock = defineSceneBlock({
  type: 'ColorByIndex',
  role: 'modifier',
  catalog: {
    displayName: 'Color By Index',
    category: 'color',
    ports: [
      { id: 'primary', label: 'Instances', direction: 'input', value: 'instanceBundle' },
      { id: 'instances', label: 'Instances', direction: 'output', value: 'instanceBundle' },
    ],
  },
  config,
  contribute: (config) => ({
    role: 'modifier',
    apply: (bundle) => ({ ...bundle, color: paletteColorPlan(config.palette) }),
  }),
});
