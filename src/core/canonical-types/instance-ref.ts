/**
 * Instance References (Spec §4)
 *
 * Reference to a specific instance declaration.
 * Identifies which domain and which declared instance.
 */

import {
  type DomainTypeId,
  type InstanceId,
  domainTypeId,
  instanceId,
} from '../ids.js';

// =============================================================================
// InstanceRef
// =============================================================================

export interface InstanceRef {
  readonly domainTypeId: DomainTypeId;
  readonly instanceId: InstanceId;
}

export function instanceRef(domainType: string, instanceIdStr: string): InstanceRef {
  return {
    domainTypeId: domainTypeId(domainType),
    instanceId: instanceId(instanceIdStr),
  };
}
