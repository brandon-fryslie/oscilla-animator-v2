import { register as register_0_event_to_one_mask } from './event-to-one-mask';
import { register as register_1_sample_hold } from './sample-hold';
import { register as register_2_edge_trigger } from './edge-trigger';
import { register as register_3_pulse_divider } from './pulse-divider';
import { register as register_4_chance_gate } from './chance-gate';
import { register as register_5_default_source_event } from './default-source-event';

export function registerEventBlocks(): void {
  register_0_event_to_one_mask();
  register_1_sample_hold();
  register_2_edge_trigger();
  register_3_pulse_divider();
  register_4_chance_gate();
  register_5_default_source_event();
}
