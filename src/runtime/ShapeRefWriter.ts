import type { ValueExpr } from '../compiler/ir/value-expr';
import type { ValueSlot } from '../compiler/ir/Indices';
import { writeShape2D } from './RuntimeState';

/**
 * Encode a shapeRef expression into the canonical shape2d bank.
 *
 * Returns true when the expression is a shapeRef and was written, false otherwise.
 */
export function writeShapeRefExprToBank(
  exprNode: ValueExpr,
  fieldExprToSlot: ReadonlyMap<number, ValueSlot>,
  shape2dBank: Uint32Array,
  offset: number,
): boolean {
  if (exprNode.kind !== 'shapeRef') {
    return false;
  }

  // [LAW:single-enforcer] controlPointField -> slot resolution for shape records
  // is centralized here for both executeFrame and executeFrameStepped paths.
  let controlPointsSlot = 0;
  if (exprNode.controlPointField != null) {
    const cpSlot = fieldExprToSlot.get(exprNode.controlPointField as number);
    if (cpSlot === undefined) {
      throw new Error(
        'Control point field ' +
          exprNode.controlPointField +
          ' not in fieldExprToSlot — compiler bug',
      );
    }
    controlPointsSlot = cpSlot;
  }

  writeShape2D(shape2dBank, offset, {
    topologyId: exprNode.topologyId,
    pointsFieldSlot: controlPointsSlot,
    pointsCount: 0,
    styleRef: 0,
    flags: 0,
  });
  return true;
}
