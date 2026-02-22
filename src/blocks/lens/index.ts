/**
 * Lens Blocks
 *
 * Value-shaping transformation blocks for lens system.
 * These blocks are user-controlled and never auto-inserted by the compiler.
 */

import { register as register_0_scale_bias } from './scale-bias';
import { register as register_1_clamp } from './clamp';
import { register as register_2_wrap01 } from './wrap01';
import { register as register_3_step_quantize } from './step-quantize';
import { register as register_4_smoothstep } from './smoothstep';
import { register as register_5_power_gamma } from './power-gamma';
import { register as register_6_slew } from './slew';
import { register as register_7_mask } from './mask';
import { register as register_8_deadzone } from './deadzone';
import { register as register_9_extract } from './extract';
import { register as register_10_construct } from './construct';
import { register as register_11_normalize_range } from './normalize-range';
import { register as register_12_denormalize_range } from './denormalize-range';

export function registerLensBlocks(): void {
  register_0_scale_bias();
  register_1_clamp();
  register_2_wrap01();
  register_3_step_quantize();
  register_4_smoothstep();
  register_5_power_gamma();
  register_6_slew();
  register_7_mask();
  register_8_deadzone();
  register_9_extract();
  register_10_construct();
  register_11_normalize_range();
  register_12_denormalize_range();
}
