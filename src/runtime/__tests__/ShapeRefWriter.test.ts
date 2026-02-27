import { describe, expect, it } from 'vitest';
import { canonicalType, FLOAT } from '../../core/canonical-types';
import { writeShapeRefExprToBank } from '../ShapeRefWriter';
import { readShape2D } from '../RuntimeState';
import type { ValueExpr } from '../../compiler/ir/value-expr';
import type { ValueExprId } from '../../compiler/ir/Indices';
import type { ValueSlot } from '../../compiler/ir/Indices';

const FLOAT_TYPE = canonicalType(FLOAT);

describe('ShapeRefWriter', () => {
  it('throws when evalOne target is not a shapeRef expression', () => {
    const notShapeRef: ValueExpr = {
      kind: 'time',
      type: FLOAT_TYPE,
      which: 'tMs',
    };
    const bank = new Uint32Array(8);

    expect(() =>
      writeShapeRefExprToBank(notShapeRef, new Map<number, ValueSlot>(), bank, 0),
    ).toThrow(/must lower a shapeRef expression/);
  });

  it('writes shape2d record with resolved control-point slot', () => {
    const shapeRefExpr: ValueExpr = {
      kind: 'shapeRef',
      type: FLOAT_TYPE,
      topologyId: 42 as any,
      paramArgs: [],
      controlPointField: 7 as ValueExprId,
    };
    const fieldExprToSlot = new Map<number, ValueSlot>([[7, 11 as ValueSlot]]);
    const bank = new Uint32Array(8 * 4);

    writeShapeRefExprToBank(shapeRefExpr, fieldExprToSlot, bank, 2);
    const record = readShape2D(bank, 2);

    expect(record.topologyId).toBe(42);
    expect(record.pointsFieldSlot).toBe(11);
    expect(record.pointsCount).toBe(0);
    expect(record.styleRef).toBe(0);
    expect(record.flags).toBe(0);
  });

  it('throws when shapeRef control-point field is not mapped to a runtime slot', () => {
    const shapeRefExpr: ValueExpr = {
      kind: 'shapeRef',
      type: FLOAT_TYPE,
      topologyId: 9 as any,
      paramArgs: [],
      controlPointField: 5 as ValueExprId,
    };
    const bank = new Uint32Array(8);

    expect(() =>
      writeShapeRefExprToBank(shapeRefExpr, new Map<number, ValueSlot>(), bank, 0),
    ).toThrow(/not in fieldExprToSlot/);
  });
});
