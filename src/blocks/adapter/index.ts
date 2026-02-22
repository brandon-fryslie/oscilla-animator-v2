/**
 * Adapter Blocks
 *
 * Unit conversion lens blocks.
 */

import { register as register_0_phase_to_scalar } from './phase-to-scalar';
import { register as register_1_scalar_to_phase } from './scalar-to-phase';
import { register as register_2_unit_cast } from './unit-cast';
import { register as register_3_phase_to_degrees } from './phase-to-degrees';
import { register as register_4_phase_to_radians } from './phase-to-radians';
import { register as register_5_radians_to_phase } from './radians-to-phase';
import { register as register_6_degrees_to_radians } from './degrees-to-radians';
import { register as register_7_radians_to_degrees } from './radians-to-degrees';
import { register as register_8_ms_to_seconds } from './ms-to-seconds';
import { register as register_9_seconds_to_ms } from './seconds-to-ms';
import { register as register_10_clamp01 } from './clamp01';
import { register as register_11_wrap01 } from './wrap01';
import { register as register_12_phase_wrap01 } from './phase-wrap01';
import { register as register_13_clamp11 } from './clamp11';
import { register as register_14_bipolar_to_unipolar } from './bipolar-to-unipolar';
import { register as register_15_unipolar_to_bipolar } from './unipolar-to-bipolar';
import { register as register_16_norm01_to_scalar } from './norm01-to-scalar';
import { register as register_17_scalar_to_deg } from './scalar-to-deg';
import { register as register_18_cast_float_to_int } from './cast-float-to-int';
import { register as register_19_cast_int_to_float } from './cast-int-to-float';
import { register as register_20_degrees_to_phase } from './degrees-to-phase';
import { register as register_21_payload_anchor_float } from './payload-anchor-float';

export function registerAdapterBlocks(): void {
  register_0_phase_to_scalar();
  register_1_scalar_to_phase();
  register_2_unit_cast();
  register_3_phase_to_degrees();
  register_4_phase_to_radians();
  register_5_radians_to_phase();
  register_6_degrees_to_radians();
  register_7_radians_to_degrees();
  register_8_ms_to_seconds();
  register_9_seconds_to_ms();
  register_10_clamp01();
  register_11_wrap01();
  register_12_phase_wrap01();
  register_13_clamp11();
  register_14_bipolar_to_unipolar();
  register_15_unipolar_to_bipolar();
  register_16_norm01_to_scalar();
  register_17_scalar_to_deg();
  register_18_cast_float_to_int();
  register_19_cast_int_to_float();
  register_20_degrees_to_phase();
  register_21_payload_anchor_float();
}
