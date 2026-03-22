/**
 * Layout Helper Functions
 *
 * Shared utilities for layout blocks.
 */

import type { CanonicalType } from '../../core/canonical-types';
import { withInstance, instanceRef } from '../../core/canonical-types';
import type { InstanceId } from '../../compiler/ir/Indices';
import type { InstanceDecl } from '../../compiler/ir/types';

/**
 * Rewrite placeholder 'default' instance in a field output type with the actual instance.
 * Used by layout blocks that preserve cardinality from upstream Array blocks.
 */
export function rewriteFieldType(
  outType: CanonicalType,
  instId: InstanceId,
  instances: ReadonlyMap<InstanceId, InstanceDecl>
): CanonicalType {
  const decl = instances.get(instId);
  if (!decl) return outType;
  const ref = instanceRef(decl.domainType as string, instId as string);
  return withInstance(outType, ref);
}
