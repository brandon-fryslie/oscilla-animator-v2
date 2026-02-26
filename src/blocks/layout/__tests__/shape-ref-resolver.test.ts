import { describe, expect, it } from 'vitest';
import { canonicalType, FLOAT, HANDLE } from '../../../core/canonical-types';
import type { ValueExpr } from '../../../compiler/ir/value-expr';
import type { ValueExprId } from '../../../compiler/ir/Indices';
import type { BlockIRBuilder } from '../../../compiler/ir/BlockIRBuilder';
import { resolveShapeRef } from '../_helpers';

function mockBuilder(exprs: readonly ValueExpr[]): BlockIRBuilder {
  return {
    getValueExpr: (id: ValueExprId) => exprs[id as number],
    getValueExprs: () => exprs,
  } as unknown as BlockIRBuilder;
}

describe('resolveShapeRef', () => {
  it('resolves direct shapeRef input', () => {
    const exprs: ValueExpr[] = [
      {
        kind: 'shapeRef',
        type: canonicalType(HANDLE),
        topologyId: 7 as any,
        paramArgs: [],
        controlPointField: 3 as ValueExprId,
      },
    ];

    const result = resolveShapeRef(mockBuilder(exprs), 0 as ValueExprId);
    expect(result.controlPointField).toBe(3);
    expect(result.topologyId).toBe(7);
  });

  it('resolves shapeRef through expression DAG', () => {
    const exprs: ValueExpr[] = [
      {
        kind: 'shapeRef',
        type: canonicalType(HANDLE),
        topologyId: 9 as any,
        paramArgs: [],
        controlPointField: 5 as ValueExprId,
      },
      {
        kind: 'extract',
        type: canonicalType(FLOAT),
        input: 0 as ValueExprId,
        componentIndex: 0,
      },
      {
        kind: 'construct',
        type: canonicalType(HANDLE),
        components: [1 as ValueExprId],
      },
    ];

    const result = resolveShapeRef(mockBuilder(exprs), 2 as ValueExprId);
    expect(result.controlPointField).toBe(5);
    expect(result.topologyId).toBe(9);
  });

  it('throws on ambiguous upstream shape refs', () => {
    const exprs: ValueExpr[] = [
      {
        kind: 'shapeRef',
        type: canonicalType(HANDLE),
        topologyId: 1 as any,
        paramArgs: [],
        controlPointField: 4 as ValueExprId,
      },
      {
        kind: 'shapeRef',
        type: canonicalType(HANDLE),
        topologyId: 2 as any,
        paramArgs: [],
        controlPointField: 6 as ValueExprId,
      },
      {
        kind: 'kernel',
        kernelKind: 'zip',
        type: canonicalType(HANDLE),
        inputs: [0 as ValueExprId, 1 as ValueExprId],
        fn: { kind: 'opcode', opcode: 'add' as any },
      },
    ];

    expect(() => resolveShapeRef(mockBuilder(exprs), 2 as ValueExprId)).toThrow(
      /multiple upstream shape references/
    );
  });

  it('throws when no upstream shapeRef exists', () => {
    const exprs: ValueExpr[] = [
      {
        kind: 'const',
        type: canonicalType(FLOAT),
        value: { kind: 'float', value: 1 },
      },
    ];

    expect(() => resolveShapeRef(mockBuilder(exprs), 0 as ValueExprId)).toThrow(
      /could not resolve shape reference/
    );
  });
});
