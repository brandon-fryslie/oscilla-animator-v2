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
import type { ValueExpr } from '../../compiler/ir/value-expr';

function valueExprChildren(expr: ValueExpr): readonly ValueExprId[] {
  switch (expr.kind) {
    case 'const':
    case 'external':
    case 'state':
    case 'time':
    case 'eventRead':
      return [];
    case 'intrinsic':
      return [];
    case 'shapeRef':
      return expr.paramArgs;
    case 'kernel':
      switch (expr.kernelKind) {
        case 'map':
          return [expr.input];
        case 'zip':
          return expr.inputs;
        case 'broadcast':
          return [expr.one, ...(expr.oneComponents ?? [])];
        case 'reduce':
          return [expr.field];
        case 'zipPromote':
          return [expr.field, ...expr.ones];
        case 'pathDerivative':
          return [expr.field];
        case 'pathSample':
          return [expr.controlPoints, expr.tField];
        default:
          return [];
      }
    case 'event':
      switch (expr.eventKind) {
        case 'wrap':
          return [expr.input];
        case 'combine':
          return expr.inputs;
        case 'pulse':
        case 'never':
        case 'const':
          return [];
        default:
          return [];
      }
    case 'extract':
      return [expr.input];
    case 'construct':
      return expr.components;
    case 'oklchToRgb':
      return [expr.input];
    default:
      return [];
  }
}

/**
 * Resolve shapeRef expression data from a shape one-cardinality input.
 *
 * Searches the IR expression table for a shapeRef that matches the given
 * expression ID, returning the controlPointField and topologyId.
 *
 * Used by PathLayout to access path geometry from One<shape> inputs.
 */
export function resolveShapeRef(
  builder: BlockIRBuilder,
  shapeExprId: ValueExprId
): { controlPointField: ValueExprId; topologyId: TopologyId } {
  const visited = new Set<number>();
  const stack: number[] = [shapeExprId as number];
  const found = new Map<number, { controlPointField: ValueExprId; topologyId: TopologyId }>();

  while (stack.length > 0) {
    const exprId = stack.pop()!;
    if (visited.has(exprId)) continue;
    visited.add(exprId);
    const expr = builder.getValueExpr(exprId as ValueExprId);
    if (!expr) continue;
    if (expr.kind === 'shapeRef') {
      if (expr.controlPointField == null) {
        throw new Error(
          'PathLayout: shape input has no control point field — only path shapes (MakeShape2D, ProceduralPolygon) are supported'
        );
      }
      found.set(exprId, { controlPointField: expr.controlPointField, topologyId: expr.topologyId });
      continue;
    }
    for (const child of valueExprChildren(expr)) {
      stack.push(child as number);
    }
  }

  if (found.size === 1) {
    return [...found.values()][0]!;
  }

  if (found.size > 1) {
    throw new Error(
      'PathLayout: shape input resolves to multiple upstream shape references; provide a single unambiguous shape source'
    );
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
