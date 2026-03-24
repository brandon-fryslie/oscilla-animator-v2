import { register as register_0_stable_id_hash } from './stable-id-hash';
import { register as register_1_domain_index } from './domain-index';
import { register as register_2_instance_domain } from './instance-domain';

export function registerDomainBlocks(): void {
  register_0_stable_id_hash();
  register_1_domain_index();
  register_2_instance_domain();
}
