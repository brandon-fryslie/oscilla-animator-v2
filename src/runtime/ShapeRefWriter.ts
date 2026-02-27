import type { ValueExpr } from '../compiler/ir/value-expr';
import type { ValueSlot } from '../compiler/ir/Indices';
import { writeShape2DWords } from './RuntimeState';

/**
 * Encode a shapeRef expression into the canonical shape2d bank.
 */
export function writeShapeRefExprToBank(
  exprNode: ValueExpr,
  fieldExprToSlot: ReadonlyMap<number, ValueSlot>,
  shape2dBank: Uint32Array,
  offset: number,
): void {
  if (exprNode.kind !== 'shapeRef') {
    throw new Error(
      'shape2d evalOne target must lower a shapeRef expression; got ' + exprNode.kind,
    );
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

  writeShape2DWords(shape2dBank, offset, exprNode.topologyId, controlPointsSlot, 0, 0, 0);
}
