/**
 * src/pillars/scene/blocks/brightness.ts
 *
 * A color modifier: scales the upstream bundle's luminance by a factor. Proves
 * the modifier shape generalizes beyond `TransformBinding` to `ColorBinding` —
 * a modifier rewrites whichever bundle field it owns.
 *
 * [LAW:types-are-the-program] `scaleLuminance` is exhaustive over the color-space
 *   union: each space scales its own luminance-carrying channels, so a new color
 *   space is a compile error here until its brightening is declared — never a
 *   silent pass-through.
 * [LAW:locality-or-seam] Self-contained: ports + a pure bundle transform. Adding
 *   it edits no draw block and no assembly code.
 */

import { konst, mul, type ColorBinding } from '../../../render/scene-plan';
import { defineSceneBlock, sceneConfig } from '../scene-block';

const config = {
  factor: sceneConfig.positiveNumber({ label: 'Factor', control: 'number' }),
} as const;

/**
 * Scale a color's luminance by `factor`. For HSL that is the lightness channel;
 * for RGB/RGBA it is each color channel uniformly (alpha is opacity, not
 * luminance, so it is preserved).
 */
function scaleLuminance(color: ColorBinding, factor: number): ColorBinding {
  const k = konst(factor);
  switch (color.space) {
    case 'oklab':
      // Darken along the OKLab ray toward black: scale lightness AND the
      // Cartesian chroma axes together. a/b are absolute chroma, so scaling l
      // alone holds chroma fixed and over-saturates at lower lightness —
      // pushing the color out of gamut and clipping its hue. Scaling all three
      // preserves the hue angle atan2(b,a) and reduces chroma in step.
      return { space: 'oklab', l: mul(color.l, k), a: mul(color.a, k), b: mul(color.b, k) };
    case 'hsl':
      return { ...color, l: mul(color.l, k) };
    case 'rgb':
      return { space: 'rgb', r: mul(color.r, k), g: mul(color.g, k), b: mul(color.b, k) };
    case 'rgba':
      return {
        space: 'rgba',
        r: mul(color.r, k),
        g: mul(color.g, k),
        b: mul(color.b, k),
        a: color.a,
      };
    default:
      return assertNever(color);
  }
}

function assertNever(value: never): never {
  throw new Error(`[scene] unhandled color space in Brightness: ${JSON.stringify(value)}`);
}

export const BrightnessBlock = defineSceneBlock({
  type: 'Brightness',
  role: 'modifier',
  catalog: {
    displayName: 'Brightness',
    category: 'modifier',
    ports: [
      { id: 'primary', label: 'Instances', direction: 'input', value: 'instanceBundle' },
      { id: 'instances', label: 'Instances', direction: 'output', value: 'instanceBundle' },
    ],
  },
  config,
  contribute: (config) => ({
    role: 'modifier',
    apply: (bundle) => ({ ...bundle, color: scaleLuminance(bundle.color, config.factor) }),
  }),
});
