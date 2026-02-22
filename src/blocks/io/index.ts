import { register as register_0_external_input } from './external-input';
import { register as register_1_external_gate } from './external-gate';
import { register as register_2_external_vec2 } from './external-vec2';

export function registerIoBlocks(): void {
  register_0_external_input();
  register_1_external_gate();
  register_2_external_vec2();
}
