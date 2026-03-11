/**
 * Color Blocks
 *
 * Blocks for OKLCH color creation, manipulation, and conversion.
 */

import { register as register_0_color_picker } from './color-picker';
import { register as register_1_make_color_oklch } from './make-color-oklch';
import { register as register_2_split_color_oklch } from './split-color-oklch';
import { register as register_3_hue_shift } from './hue-shift';
import { register as register_4_mix_color } from './mix-color';
import { register as register_5_alpha_multiply } from './alpha-multiply';
import { register as register_6_oklch_to_rgba } from './oklch-to-rgba';
import { register as register_7_hue_rainbow } from './hue-rainbow';

export function registerColorBlocks(): void {
  register_0_color_picker();
  register_1_make_color_oklch();
  register_2_split_color_oklch();
  register_3_hue_shift();
  register_4_mix_color();
  register_5_alpha_multiply();
  register_6_oklch_to_rgba();
  register_7_hue_rainbow();
}
