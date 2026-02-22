/**
 * Math Blocks
 *
 * Blocks that perform mathematical operations on single-instance and per-instance fields.
 */

import { register as register_0_add } from './add';
import { register as register_1_subtract } from './subtract';
import { register as register_2_multiply } from './multiply';
import { register as register_3_divide } from './divide';
import { register as register_4_modulo } from './modulo';
import { register as register_5_noise } from './noise';
import { register as register_6_length } from './length';
import { register as register_7_normalize } from './normalize';
import { register as register_8_expression } from './expression';
import { register as register_9_sin } from './sin';
import { register as register_10_cos } from './cos';
import { register as register_11_lerp } from './lerp';
import { register as register_12_remap } from './remap';
import { register as register_13_compare } from './compare';
import { register as register_14_select } from './select';
import { register as register_15_dot } from './dot';
import { register as register_16_cross } from './cross';
import { register as register_17_distance } from './distance';
import { register as register_18_angle_between } from './angle-between';
import { register as register_19_reflect } from './reflect';
import { register as register_20_rotate_2d } from './rotate-2d';
import { register as register_21_transform_2d } from './transform-2d';
import { register as register_22_fbm_noise } from './fbm-noise';
import { register as register_23_turbulence_noise } from './turbulence-noise';
import { register as register_24_domain_warp_noise } from './domain-warp-noise';

export function registerMathBlocks(): void {
  register_0_add();
  register_1_subtract();
  register_2_multiply();
  register_3_divide();
  register_4_modulo();
  register_5_noise();
  register_6_length();
  register_7_normalize();
  register_8_expression();
  register_9_sin();
  register_10_cos();
  register_11_lerp();
  register_12_remap();
  register_13_compare();
  register_14_select();
  register_15_dot();
  register_16_cross();
  register_17_distance();
  register_18_angle_between();
  register_19_reflect();
  register_20_rotate_2d();
  register_21_transform_2d();
  register_22_fbm_noise();
  register_23_turbulence_noise();
  register_24_domain_warp_noise();
}
