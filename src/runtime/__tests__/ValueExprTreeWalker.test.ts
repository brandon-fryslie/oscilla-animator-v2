import { describe, it, expect } from 'vitest';
import { getValueExprChildren, walkValueExprTree } from '../ValueExprTreeWalker';
import type { ValueExpr } from '../../compiler/ir/value-expr';
import type { ValueExprId } from '../../compiler/ir/Indices';
import { valueExprId } from '../../compiler/ir/Indices';
import { canonicalSignal, canonicalEvent } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types/payloads';
import { unitNone } from '../../core/canonical-types/units';

const SIG_FLOAT = canonicalSignal(FLOAT, unitNone());
const EVENT_TYPE = canonicalEvent();

/**
 * Helper: build a minimal ValueExpr of each kind for child-enumeration tests.
 */
function id(n: number): ValueExprId {
  return valueExprId(n);
}

describe('getValueExprChildren', () => {
  it('const — leaf', () => {
    const expr: ValueExpr = {
      kind: 'const',
      type: SIG_FLOAT,
      value: { kind: 'float', value: 42 },
    };
    expect(getValueExprChildren(expr)).toEqual([]);
  });

  it('external — leaf', () => {
    const expr: ValueExpr = {
      kind: 'external',
      type: SIG_FLOAT,
      channel: 'mouseX',
    };
    expect(getValueExprChildren(expr)).toEqual([]);
  });

  it('intrinsic (property) — leaf', () => {
    const expr: ValueExpr = {
      kind: 'intrinsic',
      type: SIG_FLOAT,
      intrinsicKind: 'property',
      intrinsic: 'index',
    };
    expect(getValueExprChildren(expr)).toEqual([]);
  });

  it('intrinsic (placement) — leaf', () => {
    const expr: ValueExpr = {
      kind: 'intrinsic',
      type: SIG_FLOAT,
      intrinsicKind: 'placement',
      field: 'uv',
      basisKind: 'halton2D',
    };
    expect(getValueExprChildren(expr)).toEqual([]);
  });

  it('state — leaf', () => {
    const expr: ValueExpr = {
      kind: 'state',
      type: SIG_FLOAT,
      stateKey: 'b1:delay' as any,
    };
    expect(getValueExprChildren(expr)).toEqual([]);
  });

  it('time — leaf', () => {
    const expr: ValueExpr = {
      kind: 'time',
      type: SIG_FLOAT,
      which: 'tMs',
    };
    expect(getValueExprChildren(expr)).toEqual([]);
  });

  it('eventRead — leaf', () => {
    const expr: ValueExpr = {
      kind: 'eventRead',
      type: SIG_FLOAT,
      eventSlot: 0 as any,
    };
    expect(getValueExprChildren(expr)).toEqual([]);
  });

  it('extract — single child', () => {
    const expr: ValueExpr = {
      kind: 'extract',
      type: SIG_FLOAT,
      input: id(5),
      componentIndex: 0,
    };
    expect(getValueExprChildren(expr)).toEqual([id(5)]);
  });

  it('hslToRgb — single child', () => {
    const expr: ValueExpr = {
      kind: 'hslToRgb',
      type: SIG_FLOAT,
      input: id(10),
    };
    expect(getValueExprChildren(expr)).toEqual([id(10)]);
  });

  it('construct — multiple children', () => {
    const expr: ValueExpr = {
      kind: 'construct',
      type: SIG_FLOAT,
      components: [id(1), id(2), id(3)],
    };
    expect(getValueExprChildren(expr)).toEqual([id(1), id(2), id(3)]);
  });

  it('shapeRef — paramArgs only', () => {
    const expr: ValueExpr = {
      kind: 'shapeRef',
      type: SIG_FLOAT,
      topologyId: 1 as any,
      paramArgs: [id(4), id(5)],
    };
    expect(getValueExprChildren(expr)).toEqual([id(4), id(5)]);
  });

  it('shapeRef — paramArgs + controlPointField', () => {
    const expr: ValueExpr = {
      kind: 'shapeRef',
      type: SIG_FLOAT,
      topologyId: 1 as any,
      paramArgs: [id(4)],
      controlPointField: id(6),
    };
    expect(getValueExprChildren(expr)).toEqual([id(4), id(6)]);
  });

  it('kernel(map) — single child', () => {
    const expr: ValueExpr = {
      kind: 'kernel',
      type: SIG_FLOAT,
      kernelKind: 'map',
      input: id(7),
      fn: { kind: 'opcode', opcode: 'sin' as any },
    };
    expect(getValueExprChildren(expr)).toEqual([id(7)]);
  });

  it('kernel(zip) — multiple children', () => {
    const expr: ValueExpr = {
      kind: 'kernel',
      type: SIG_FLOAT,
      kernelKind: 'zip',
      inputs: [id(1), id(2)],
      fn: { kind: 'opcode', opcode: 'add' as any },
    };
    expect(getValueExprChildren(expr)).toEqual([id(1), id(2)]);
  });

  it('kernel(zipSig) — field + signals', () => {
    const expr: ValueExpr = {
      kind: 'kernel',
      type: SIG_FLOAT,
      kernelKind: 'zipSig',
      field: id(10),
      signals: [id(11), id(12)],
      fn: { kind: 'opcode', opcode: 'add' as any },
    };
    expect(getValueExprChildren(expr)).toEqual([id(10), id(11), id(12)]);
  });

  it('kernel(broadcast) — signal only', () => {
    const expr: ValueExpr = {
      kind: 'kernel',
      type: SIG_FLOAT,
      kernelKind: 'broadcast',
      signal: id(3),
    };
    expect(getValueExprChildren(expr)).toEqual([id(3)]);
  });

  it('kernel(broadcast) — signal + signalComponents', () => {
    const expr: ValueExpr = {
      kind: 'kernel',
      type: SIG_FLOAT,
      kernelKind: 'broadcast',
      signal: id(3),
      signalComponents: [id(4), id(5)],
    };
    expect(getValueExprChildren(expr)).toEqual([id(3), id(4), id(5)]);
  });

  it('kernel(reduce) — single child', () => {
    const expr: ValueExpr = {
      kind: 'kernel',
      type: SIG_FLOAT,
      kernelKind: 'reduce',
      field: id(8),
      op: 'sum',
    };
    expect(getValueExprChildren(expr)).toEqual([id(8)]);
  });

  it('kernel(pathDerivative) — single child', () => {
    const expr: ValueExpr = {
      kind: 'kernel',
      type: SIG_FLOAT,
      kernelKind: 'pathDerivative',
      field: id(9),
      op: 'tangent',
      topologyId: 1 as any,
    };
    expect(getValueExprChildren(expr)).toEqual([id(9)]);
  });

  it('event(pulse) — leaf', () => {
    const expr: ValueExpr = {
      kind: 'event',
      type: EVENT_TYPE,
      eventKind: 'pulse',
      source: 'timeRoot',
    };
    expect(getValueExprChildren(expr)).toEqual([]);
  });

  it('event(wrap) — single child', () => {
    const expr: ValueExpr = {
      kind: 'event',
      type: EVENT_TYPE,
      eventKind: 'wrap',
      input: id(20),
    };
    expect(getValueExprChildren(expr)).toEqual([id(20)]);
  });

  it('event(combine) — multiple children', () => {
    const expr: ValueExpr = {
      kind: 'event',
      type: EVENT_TYPE,
      eventKind: 'combine',
      inputs: [id(21), id(22)],
      mode: 'any',
    };
    expect(getValueExprChildren(expr)).toEqual([id(21), id(22)]);
  });

  it('event(never) — leaf', () => {
    const expr: ValueExpr = {
      kind: 'event',
      type: EVENT_TYPE,
      eventKind: 'never',
    };
    expect(getValueExprChildren(expr)).toEqual([]);
  });

  it('event(const) — leaf', () => {
    const expr: ValueExpr = {
      kind: 'event',
      type: EVENT_TYPE,
      eventKind: 'const',
      fired: true,
    };
    expect(getValueExprChildren(expr)).toEqual([]);
  });
});

describe('walkValueExprTree', () => {
  it('walks a simple chain', () => {
    // 0: const -> 1: map(sin, input=0) -> 2: extract(input=1, index=0)
    const nodes: ValueExpr[] = [
      { kind: 'const', type: SIG_FLOAT, value: { kind: 'float', value: 1 } },
      { kind: 'kernel', type: SIG_FLOAT, kernelKind: 'map', input: id(0), fn: { kind: 'opcode', opcode: 'sin' as any } },
      { kind: 'extract', type: SIG_FLOAT, input: id(1), componentIndex: 0 },
    ];

    const visited: number[] = [];
    walkValueExprTree(id(2), nodes, (exprId) => {
      visited.push(exprId as number);
    });

    expect(visited).toEqual([2, 1, 0]);
  });

  it('handles DAG (shared child)', () => {
    // 0: const
    // 1: map(input=0)
    // 2: map(input=0)  — shares child 0 with node 1
    // 3: zip(inputs=[1, 2])
    const nodes: ValueExpr[] = [
      { kind: 'const', type: SIG_FLOAT, value: { kind: 'float', value: 1 } },
      { kind: 'kernel', type: SIG_FLOAT, kernelKind: 'map', input: id(0), fn: { kind: 'opcode', opcode: 'sin' as any } },
      { kind: 'kernel', type: SIG_FLOAT, kernelKind: 'map', input: id(0), fn: { kind: 'opcode', opcode: 'cos' as any } },
      { kind: 'kernel', type: SIG_FLOAT, kernelKind: 'zip', inputs: [id(1), id(2)], fn: { kind: 'opcode', opcode: 'add' as any } },
    ];

    const visited: number[] = [];
    walkValueExprTree(id(3), nodes, (exprId) => {
      visited.push(exprId as number);
    });

    // Node 0 should only be visited once
    expect(visited).toEqual([3, 1, 0, 2]);
  });

  it('respects visitor returning false to skip children', () => {
    const nodes: ValueExpr[] = [
      { kind: 'const', type: SIG_FLOAT, value: { kind: 'float', value: 1 } },
      { kind: 'kernel', type: SIG_FLOAT, kernelKind: 'map', input: id(0), fn: { kind: 'opcode', opcode: 'sin' as any } },
      { kind: 'extract', type: SIG_FLOAT, input: id(1), componentIndex: 0 },
    ];

    const visited: number[] = [];
    walkValueExprTree(id(2), nodes, (exprId) => {
      visited.push(exprId as number);
      if ((exprId as number) === 1) return false; // stop descending at node 1
    });

    // Should visit 2, 1, but NOT 0
    expect(visited).toEqual([2, 1]);
  });

  it('handles missing nodes gracefully', () => {
    const nodes: ValueExpr[] = [
      { kind: 'const', type: SIG_FLOAT, value: { kind: 'float', value: 1 } },
    ];

    const visited: number[] = [];
    // Start at non-existent node 5
    walkValueExprTree(id(5), nodes, (exprId) => {
      visited.push(exprId as number);
    });

    expect(visited).toEqual([]);
  });
});
