/**
 * Field Blocks
 *
 * Blocks that work with fields (per-instance values over domains).
 */

import { register as register_0_broadcast } from './broadcast';
import { register as register_1_reduce } from './reduce';
import { register as register_2_from_domain_id } from './from-domain-id';
import { register as register_3_field_const_color } from './field-const-color';
import { register as register_4_default_source_field } from './default-source-field';
import { register as register_5_noisy_broadcast } from './noisy-broadcast';
import { register as register_6_float_range_field } from './float-range-field';

export function registerFieldBlocks(): void {
  register_0_broadcast();
  register_1_reduce();
  register_2_from_domain_id();
  register_3_field_const_color();
  register_4_default_source_field();
  register_5_noisy_broadcast();
  register_6_float_range_field();
}
