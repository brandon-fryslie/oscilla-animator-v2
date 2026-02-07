/**
 * ValueExpr Tree Walker
 *
 * Provides exhaustive child enumeration and depth-first tree traversal
 * for the unified ValueExpr type. Uses `never` exhaustiveness check so
 * adding a new ValueExpr kind is a compile error.
 */

import type { ValueExpr } from '../compiler/ir/value-expr';
import type { ValueExprId } from '../compiler/ir/Indices';

/**
 * Return the child ValueExprIds referenced by a ValueExpr node.
 *
 * Exhaustive over all 12 kinds (const, external, intrinsic, kernel, state,
 * time, shapeRef, eventRead, event, extract, construct, hslToRgb).
 * Adding a new kind without updating this function is a compile error.
 */
export function getValueExprChildren(expr: ValueExpr): readonly ValueExprId[] {
  switch (expr.kind) {
    // Leaf nodes — no children
    case 'const':
    case 'external':
    case 'intrinsic':
    case 'state':
    case 'time':
    case 'eventRead':
      return [];

    // Single input
    case 'extract':
    case 'hslToRgb':
      return [expr.input];

    // Multiple components
    case 'construct':
      return expr.components;

    // Shape ref: paramArgs + optional controlPointField
    case 'shapeRef': {
      if (expr.controlPointField != null) {
        return [...expr.paramArgs, expr.controlPointField];
      }
      return expr.paramArgs;
    }

    // Kernel sub-kinds
    case 'kernel': {
      switch (expr.kernelKind) {
        case 'map':
          return [expr.input];
        case 'zip':
          return expr.inputs;
        case 'zipSig':
          return [expr.field, ...expr.signals];
        case 'broadcast': {
          if (expr.signalComponents && expr.signalComponents.length > 0) {
            return [expr.signal, ...expr.signalComponents];
          }
          return [expr.signal];
        }
        case 'reduce':
        case 'pathDerivative':
          return [expr.field];
        default: {
          const _exhaustive: never = expr;
          throw new Error(`Unknown kernel kind: ${(_exhaustive as any).kernelKind}`);
        }
      }
    }

    // Event sub-kinds
    case 'event': {
      switch (expr.eventKind) {
        case 'wrap':
          return [expr.input];
        case 'combine':
          return expr.inputs;
        case 'pulse':
        case 'never':
        case 'const':
          return [];
        default: {
          const _exhaustive: never = expr;
          throw new Error(`Unknown event kind: ${(_exhaustive as any).eventKind}`);
        }
      }
    }

    default: {
      const _exhaustive: never = expr;
      throw new Error(`Unknown ValueExpr kind: ${(_exhaustive as any).kind}`);
    }
  }
}

/**
 * Depth-first walk of a ValueExpr tree starting from rootId.
 *
 * @param rootId - Starting expression ID
 * @param nodes - The ValueExpr table (indexed by ValueExprId)
 * @param visitor - Called for each node. Return `false` to skip children.
 *
 * Handles cycles via a visited set — each node is visited at most once.
 */
export function walkValueExprTree(
  rootId: ValueExprId,
  nodes: readonly ValueExpr[],
  visitor: (id: ValueExprId, expr: ValueExpr) => boolean | void,
): void {
  const visited = new Set<number>();
  const stack: ValueExprId[] = [rootId];

  while (stack.length > 0) {
    const id = stack.pop()!;
    const numId = id as number;

    if (visited.has(numId)) continue;
    visited.add(numId);

    const expr = nodes[numId];
    if (!expr) continue;

    const result = visitor(id, expr);
    if (result === false) continue;

    const children = getValueExprChildren(expr);
    // Push in reverse order so left children are visited first
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i]);
    }
  }
}
