/**
 * src/pillars/scene/color.ts
 *
 * The seam where an opaque authored color (a single `#rrggbb` value a user
 * picks) becomes a ScenePlan `ColorBinding`. User-facing blocks deal only in the
 * opaque value; the color-space channel layout lives only on the far side of
 * this function, inside the plan.
 *
 * [LAW:one-source-of-truth] The one place a block-facing color crosses into the
 *   backend channel representation. No block copies channel layout into its own
 *   API; it hands an opaque value here and gets a `ColorBinding` back.
 * [LAW:effects-at-boundaries] A pure mapping value→value; it parses and packs,
 *   it does not touch three or the renderer.
 */

import { konst, type ColorBinding } from '../../render/scene-plan';

const CHANNEL_MAX = 255;

/**
 * Parse an opaque `#rrggbb` color into a uniform (per-instance-constant) rgb
 * `ColorBinding`. Each channel is a baked `const` PlanExpr in 0..1 — a solid
 * color is the zero-variation case of the same binding an animated color uses.
 *
 * [LAW:dataflow-not-control-flow] Solidness is a property of the *values* (all
 *   `const`), not a separate kind of binding.
 */
export function hexColorBinding(hex: string): ColorBinding {
  const channel = (start: number): number =>
    parseInt(hex.slice(start, start + 2), 16) / CHANNEL_MAX;
  return {
    space: 'rgb',
    r: konst(channel(1)),
    g: konst(channel(3)),
    b: konst(channel(5)),
  };
}
