/**
 * Unit tests for the cardinality constraint solver.
 */
import { describe, it, expect } from 'vitest';
import { solveCardinality, type CardinalityConstraint, type CardinalitySolveInput, type InstanceTerm } from '../solve';
import { axisVar, axisInst, type Axis } from '../../../../core/canonical-types';
import type { CardinalityValue, InstanceRef } from '../../../../core/canonical-types';
import { instanceRef } from '../../../../core/canonical-types';
import { cardinalityVarId, instanceVarId, type CardinalityVarId } from '../../../../core/ids';
import type { DraftPortKey } from '../../type-facts';

// Helpers
const pk = (s: string) => s as DraftPortKey;
const cv = (s: string) => cardinalityVarId(s);
const iv = (s: string) => instanceVarId(s);

function solve(
  ports: string[],
  base: Record<string, Axis<CardinalityValue, CardinalityVarId>>,
  constraints: CardinalityConstraint[],
): ReturnType<typeof solveCardinality> {
  const portKeys = ports.map(pk);
  const baseMap = new Map(Object.entries(base).map(([k, v]) => [pk(k), v] as const));
  return solveCardinality({ ports: portKeys, baseCardinalityAxis: baseMap, constraints });
}

describe('solveCardinality', () => {
  it('empty graph → empty substitution', () => {
    const result = solve([], {}, []);
    expect(result.cardinalities.size).toBe(0);
    expect(result.instances.size).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('signalOnly → all vars bound to one via clampOne', () => {
    const result = solve(
      ['A:x:in', 'A:y:in', 'A:out:out'],
      {
        'A:x:in': axisVar(cv('card:A:x:in')),
        'A:y:in': axisVar(cv('card:A:y:in')),
        'A:out:out': axisVar(cv('card:A:out:out')),
      },
      [
        { kind: 'clampOne', port: pk('A:x:in') },
        { kind: 'clampOne', port: pk('A:y:in') },
        { kind: 'clampOne', port: pk('A:out:out') },
      ],
    );

    expect(result.errors).toHaveLength(0);
    expect(result.cardinalities.get(cv('card:A:x:in'))).toEqual({ kind: 'one' });
    expect(result.cardinalities.get(cv('card:A:y:in'))).toEqual({ kind: 'one' });
    expect(result.cardinalities.get(cv('card:A:out:out'))).toEqual({ kind: 'one' });
  });

  it('transform → outputs concrete many(ref), propagates through edges to preserve inputs', () => {
    const ref = instanceRef('circle', 'arr1');
    const result = solve(
      ['Arr:out:out', 'P:x:in'],
      {
        'Arr:out:out': axisInst({ kind: 'many', instance: ref }),
        'P:x:in': axisVar(cv('card:P:x:in')),
      },
      [
        { kind: 'forceMany', port: pk('Arr:out:out'), instance: { kind: 'inst', ref } },
        { kind: 'equal', a: pk('Arr:out:out'), b: pk('P:x:in') },
      ],
    );

    expect(result.errors).toHaveLength(0);
    expect(result.cardinalities.get(cv('card:P:x:in'))).toEqual({ kind: 'many', instance: ref });
  });

  it('preserve equality → many propagates across equal ports', () => {
    const ref = instanceRef('circle', 'arr1');
    const result = solve(
      ['P:a:in', 'P:b:in', 'P:out:out'],
      {
        'P:a:in': axisVar(cv('card:P:a:in')),
        'P:b:in': axisVar(cv('card:P:b:in')),
        'P:out:out': axisVar(cv('card:P:out:out')),
      },
      [
        // All ports in preserve block share equality
        { kind: 'equal', a: pk('P:a:in'), b: pk('P:b:in') },
        { kind: 'equal', a: pk('P:b:in'), b: pk('P:out:out') },
        // External edge forces many on input a
        { kind: 'forceMany', port: pk('P:a:in'), instance: { kind: 'inst', ref } },
      ],
    );

    expect(result.errors).toHaveLength(0);
    // All vars resolve to many with same instance
    expect(result.cardinalities.get(cv('card:P:a:in'))).toEqual({ kind: 'many', instance: ref });
    expect(result.cardinalities.get(cv('card:P:b:in'))).toEqual({ kind: 'many', instance: ref });
    expect(result.cardinalities.get(cv('card:P:out:out'))).toEqual({ kind: 'many', instance: ref });
  });

  it('zipBroadcast → var + many → all many; no-op when all unknown', () => {
    const ref = instanceRef('circle', 'arr1');

    // Case 1: one member many → propagates to others
    const result1 = solve(
      ['A:x:in', 'A:y:in', 'A:out:out'],
      {
        'A:x:in': axisVar(cv('card:A:x:in')),
        'A:y:in': axisVar(cv('card:A:y:in')),
        'A:out:out': axisVar(cv('card:A:out:out')),
      },
      [
        { kind: 'forceMany', port: pk('A:x:in'), instance: { kind: 'inst', ref } },
        { kind: 'zipBroadcast', ports: [pk('A:x:in'), pk('A:y:in'), pk('A:out:out')] },
      ],
    );

    expect(result1.errors).toHaveLength(0);
    expect(result1.cardinalities.get(cv('card:A:y:in'))).toEqual({ kind: 'many', instance: ref });
    expect(result1.cardinalities.get(cv('card:A:out:out'))).toEqual({ kind: 'many', instance: ref });

    // Case 2: all unknown → evidence-free default to one (signal chain)
    const result2 = solve(
      ['B:x:in', 'B:y:in'],
      {
        'B:x:in': axisVar(cv('card:B:x:in')),
        'B:y:in': axisVar(cv('card:B:y:in')),
      },
      [
        { kind: 'zipBroadcast', ports: [pk('B:x:in'), pk('B:y:in')] },
      ],
    );

    // No many evidence → defaults to one, no errors
    expect(result2.errors).toHaveLength(0);
    expect(result2.cardinalities.get(cv('card:B:x:in'))).toEqual({ kind: 'one' });
    expect(result2.cardinalities.get(cv('card:B:y:in'))).toEqual({ kind: 'one' });
  });

  it('instance unification: two concrete refs in same zip → mismatch error', () => {
    const ref1 = instanceRef('circle', 'arr1');
    const ref2 = instanceRef('grid', 'arr2');
    const result = solve(
      ['A:x:in', 'B:x:in'],
      {
        'A:x:in': axisVar(cv('card:A:x:in')),
        'B:x:in': axisVar(cv('card:B:x:in')),
      },
      [
        { kind: 'forceMany', port: pk('A:x:in'), instance: { kind: 'inst', ref: ref1 } },
        { kind: 'forceMany', port: pk('B:x:in'), instance: { kind: 'inst', ref: ref2 } },
        { kind: 'zipBroadcast', ports: [pk('A:x:in'), pk('B:x:in')] },
      ],
    );

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.kind === 'Conflict')).toBe(true);
  });

  it('evidence-free group defaults to one', () => {
    const result = solve(
      ['A:x:in'],
      {
        'A:x:in': axisVar(cv('card:A:x:in')),
      },
      [],
    );

    // No evidence → defaults to one (signal chain), no error
    expect(result.errors).toHaveLength(0);
    expect(result.cardinalities.get(cv('card:A:x:in'))).toEqual({ kind: 'one' });
  });

  it('unresolved instance var → UnresolvedInstanceVar error', () => {
    const result = solve(
      ['A:x:in'],
      {
        'A:x:in': axisVar(cv('card:A:x:in')),
      },
      [
        { kind: 'forceMany', port: pk('A:x:in'), instance: { kind: 'var', id: iv('inst:A:x') } },
      ],
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].kind).toBe('UnresolvedInstanceVar');
  });

  it('signal→zip conflict: clampOne port in zip with many member → Conflict', () => {
    const ref = instanceRef('circle', 'arr1');
    const result = solve(
      ['Sig:out:out', 'Field:x:in'],
      {
        'Sig:out:out': axisVar(cv('card:Sig:out:out')),
        'Field:x:in': axisVar(cv('card:Field:x:in')),
      },
      [
        { kind: 'clampOne', port: pk('Sig:out:out') },
        { kind: 'forceMany', port: pk('Field:x:in'), instance: { kind: 'inst', ref } },
        { kind: 'zipBroadcast', ports: [pk('Sig:out:out'), pk('Field:x:in')] },
      ],
    );

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.kind === 'Conflict')).toBe(true);
    // Both ports should be listed
    const conflict = result.errors.find(e => e.kind === 'Conflict')!;
    expect(conflict.ports.length).toBeGreaterThanOrEqual(1);
  });

  it('multiple vars per group: two ports with different var IDs in same equality group → both map to same value', () => {
    const ref = instanceRef('circle', 'arr1');
    const result = solve(
      ['A:x:in', 'A:y:in'],
      {
        'A:x:in': axisVar(cv('v1')),
        'A:y:in': axisVar(cv('v2')),
      },
      [
        { kind: 'equal', a: pk('A:x:in'), b: pk('A:y:in') },
        { kind: 'forceMany', port: pk('A:x:in'), instance: { kind: 'inst', ref } },
      ],
    );

    expect(result.errors).toHaveLength(0);
    expect(result.cardinalities.get(cv('v1'))).toEqual({ kind: 'many', instance: ref });
    expect(result.cardinalities.get(cv('v2'))).toEqual({ kind: 'many', instance: ref });
  });

  it('preserve-block broadcast rejection: mixed one/many without zip → Conflict via equality group', () => {
    // A preserve block with strict equality among all ports.
    // One input connected to signalOnly producer (clampOne) and another
    // connected to transform output (forceMany) → Conflict in the equality group
    const ref = instanceRef('circle', 'arr1');
    const result = solve(
      ['P:a:in', 'P:b:in', 'P:out:out'],
      {
        'P:a:in': axisVar(cv('card:P:a:in')),
        'P:b:in': axisVar(cv('card:P:b:in')),
        'P:out:out': axisVar(cv('card:P:out:out')),
      },
      [
        // Strict preserve: all ports equal
        { kind: 'equal', a: pk('P:a:in'), b: pk('P:b:in') },
        { kind: 'equal', a: pk('P:b:in'), b: pk('P:out:out') },
        // clampOne from signal producer (propagated through edge equality to a)
        { kind: 'clampOne', port: pk('P:a:in') },
        // forceMany from transform producer (propagated through edge equality to b)
        { kind: 'forceMany', port: pk('P:b:in'), instance: { kind: 'inst', ref } },
      ],
    );

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.kind === 'Conflict')).toBe(true);
  });

  it('fieldOnly-only unresolved instance: fieldOnly block with only var instance → UnresolvedInstanceVar', () => {
    const result = solve(
      ['F:data:in'],
      {
        'F:data:in': axisVar(cv('card:F:data:in')),
      },
      [
        { kind: 'forceMany', port: pk('F:data:in'), instance: { kind: 'var', id: iv('fieldOnly:F:data') } },
      ],
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].kind).toBe('UnresolvedInstanceVar');
  });

  it('concrete axisInst(one) without clampOne → no substitution needed, no error', () => {
    // Ports with concrete axisInst(one) that have no vars don't need solving
    const result = solve(
      ['A:x:in'],
      {
        'A:x:in': axisInst({ kind: 'one' }),
      },
      [],
    );

    expect(result.errors).toHaveLength(0);
    expect(result.cardinalities.size).toBe(0);
  });

  it('deterministic error ports: ports in error messages are sorted', () => {
    const result = solve(
      ['Z:x:in', 'A:x:in'],
      {
        'Z:x:in': axisVar(cv('v1')),
        'A:x:in': axisVar(cv('v2')),
      },
      [
        { kind: 'equal', a: pk('Z:x:in'), b: pk('A:x:in') },
        // Conflict: both one and many
        { kind: 'clampOne', port: pk('Z:x:in') },
        { kind: 'forceMany', port: pk('A:x:in'), instance: { kind: 'inst', ref: instanceRef('c', 'a') } },
      ],
    );

    expect(result.errors.length).toBeGreaterThan(0);
    const conflict = result.errors.find(e => e.kind === 'Conflict')!;
    // Ports should be sorted
    for (let i = 1; i < conflict.ports.length; i++) {
      expect(conflict.ports[i - 1] <= conflict.ports[i]).toBe(true);
    }
  });

  it('instance var resolves through zip propagation', () => {
    const ref = instanceRef('circle', 'arr1');
    const varId = iv('inst:F:data');
    const result = solve(
      ['Arr:out:out', 'F:data:in'],
      {
        'Arr:out:out': axisInst({ kind: 'many', instance: ref }),
        'F:data:in': axisVar(cv('card:F:data:in')),
      },
      [
        { kind: 'forceMany', port: pk('Arr:out:out'), instance: { kind: 'inst', ref } },
        { kind: 'forceMany', port: pk('F:data:in'), instance: { kind: 'var', id: varId } },
        { kind: 'zipBroadcast', ports: [pk('Arr:out:out'), pk('F:data:in')] },
      ],
    );

    expect(result.errors).toHaveLength(0);
    expect(result.instances.get(varId)).toEqual(ref);
    expect(result.cardinalities.get(cv('card:F:data:in'))).toEqual({ kind: 'many', instance: ref });
  });
});
