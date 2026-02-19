/**
 * Layout Helper Functions
 *
 * Shared utilities for layout blocks.
 */

import type { CanonicalType } from '../../core/canonical-types';
import { withInstance, instanceRef } from '../../core/canonical-types';
import type { InstanceId, ValueExprId } from '../../compiler/ir/Indices';
import type { InstanceDecl } from '../../compiler/ir/types';
import type { TopologyId } from '../../shapes/types';
import type { BlockIRBuilder } from '../../compiler/ir/BlockIRBuilder';

/**
 * Resolve shapeRef expression data from a shape signal input.
 *
 * Searches the IR expression table for a shapeRef that matches the given
 * expression ID, returning the controlPointField and topologyId.
 *
 * Used by PathLayout to access path geometry from Signal<shape2d> inputs.
 */
export function resolveShapeRef(
  builder: BlockIRBuilder,
  shapeExprId: ValueExprId
): { controlPointField: ValueExprId; topologyId: TopologyId } {
  const expr = builder.getValueExpr(shapeExprId);
  if (expr && expr.kind === 'shapeRef') {
    if (expr.controlPointField == null) {
      throw new Error(
        'PathLayout: shape input has no control point field — only path shapes (MakeShape2D, ProceduralPolygon) are supported'
      );
    }
    return { controlPointField: expr.controlPointField, topologyId: expr.topologyId };
  }

  // Shape expr might not be a direct shapeRef — search the whole table
  const exprs = builder.getValueExprs();
  for (const e of exprs) {
    if (e.kind === 'shapeRef' && e.controlPointField != null) {
      return { controlPointField: e.controlPointField, topologyId: e.topologyId };
    }
  }

  throw new Error(
    'PathLayout: could not resolve shape reference — ensure shape input comes from a path-producing block'
  );
}

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
