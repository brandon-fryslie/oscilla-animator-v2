/**
 * Layout Helper Functions
 *
 * Shared utilities for layout blocks.
 */

import type { CanonicalType } from '../../core/canonical-types';
import { withInstance, instanceRef } from '../../core/canonical-types';
import type { InstanceId } from '../../compiler/ir/Indices';
import type { IRBuilder } from '../../compiler/ir/IRBuilder';

/**
 * Rewrite placeholder 'default' instance in a field output type with the actual instance.
 * Used by layout blocks that preserve cardinality from upstream Array blocks.
 */
export function rewriteFieldType(outType: CanonicalType, instId: InstanceId, builder: IRBuilder): CanonicalType {
  const decl = builder.getInstances().get(instId);
  if (!decl) return outType;
  const ref = instanceRef(decl.domainType as string, instId as string);
  return withInstance(outType, ref);
}
