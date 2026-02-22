/**
 * Scalar Blocks
 *
 * Blocks that produce and transform scalar one-cardinality values.
 */

import { register as register_0_const } from './const';
import { register as register_1_oscillator } from './oscillator';
import { register as register_2_accumulator } from './accumulator';
import { register as register_3_unit_delay } from './unit-delay';
import { register as register_4_lag } from './lag';
import { register as register_5_phasor } from './phasor';
import { register as register_6_hash } from './hash';
import { register as register_7_camera_projection_const } from './camera-projection-const';
import { register as register_8_default_source } from './default-source';

export function registerScalarBlocks(): void {
  register_0_const();
  register_1_oscillator();
  register_2_accumulator();
  register_3_unit_delay();
  register_4_lag();
  register_5_phasor();
  register_6_hash();
  register_7_camera_projection_const();
  register_8_default_source();
}
