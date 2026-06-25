/**
 * The 5-phase cardinality sub-solver, exercised with hand-rolled constraints.
 * Covers the resolution rules, the structural/terminal error split, and the
 * promoteToMany inner fixpoint including the clampOne exemption that makes a
 * "clampOne inside a zip set" deliberately NOT a conflict. [LAW:behavior-not-structure]
 */

import { describe, it, expect } from 'vitest';
import { cardinalityVarId, instanceRef, type ZInferenceCardinality } from '../../schemas';
import {
  solveCardinality,
  isStructuralCardinalityConflict,
  UNBOUND_INSTANCE,
  type ZCardinalityConstraint,
} from '../cardinality';
import type { ConstraintOrigin, PortKey } from '../shared';

const o: ConstraintOrigin = { kind: 'blockRule', blockId: 'b', rule: 'test' };
const varAxis = (name: string): ZInferenceCardinality => ({ kind: 'var', var: cardinalityVarId(name) });
const dots = instanceRef('dots');
const stars = instanceRef('stars');

const run = (
  ports: Record<string, ZInferenceCardinality>,
  constraints: readonly ZCardinalityConstraint[],
  inheritInstanceVars?: ReadonlySet<ReturnType<typeof cardinalityVarId>>,
) => solveCardinality({ ports: new Map<PortKey, ZInferenceCardinality>(Object.entries(ports)), constraints, inheritInstanceVars });

describe('solveCardinality — base resolution', () => {
  it('resolves a concrete one (propagated through equal) to one without a many', () => {
    const r = run(
      { A: { kind: 'one' }, B: varAxis('n') },
      [{ kind: 'equal', a: 'A', b: 'B', origin: o }],
    );
    expect(r.cardinalities.get(cardinalityVarId('n'))).toEqual({ kind: 'one' });
    expect(r.errors).toHaveLength(0);
  });

  it('resolves forceMany to many(instance)', () => {
    const r = run({ A: varAxis('n') }, [{ kind: 'forceMany', port: 'A', instance: { kind: 'inst', ref: dots }, origin: o }]);
    expect(r.cardinalities.get(cardinalityVarId('n'))).toEqual({ kind: 'many', instance: 'dots' });
  });

  it('resolves two matching forceMany across an equal group to one many', () => {
    const r = run(
      { A: varAxis('n'), B: varAxis('m') },
      [
        { kind: 'equal', a: 'A', b: 'B', origin: o },
        { kind: 'forceMany', port: 'A', instance: { kind: 'inst', ref: dots }, origin: o },
        { kind: 'forceMany', port: 'B', instance: { kind: 'inst', ref: dots }, origin: o },
      ],
    );
    expect(r.cardinalities.get(cardinalityVarId('n'))).toEqual({ kind: 'many', instance: 'dots' });
    expect(r.cardinalities.get(cardinalityVarId('m'))).toEqual({ kind: 'many', instance: 'dots' });
    expect(r.errors).toHaveLength(0);
  });

  it('reports InstanceConflict for two different concrete instances', () => {
    const r = run({ A: varAxis('n') }, [
      { kind: 'forceMany', port: 'A', instance: { kind: 'inst', ref: dots }, origin: o },
      { kind: 'forceMany', port: 'A', instance: { kind: 'inst', ref: stars }, origin: o },
    ]);
    const conflict = r.errors.find((e) => e.kind === 'InstanceConflict');
    expect(conflict).toBeDefined();
    expect(isStructuralCardinalityConflict(conflict!)).toBe(false); // terminal, not structural
  });

  it('propagates facts through equal (clampOne reaches the joined var)', () => {
    const r = run(
      { A: { kind: 'one' }, B: varAxis('n') },
      [
        { kind: 'clampOne', port: 'A', origin: o },
        { kind: 'equal', a: 'A', b: 'B', origin: o },
      ],
    );
    expect(r.cardinalities.get(cardinalityVarId('n'))).toEqual({ kind: 'one' });
    expect(r.diagnostics).toHaveLength(0); // forcedOne, not a default
  });
});

describe('solveCardinality — structural conflict', () => {
  it('reports ClampManyConflict (structural) for clampOne + forceMany on one group', () => {
    const r = run({ A: varAxis('n') }, [
      { kind: 'clampOne', port: 'A', origin: o },
      { kind: 'forceMany', port: 'A', instance: { kind: 'inst', ref: dots }, origin: o },
    ]);
    const conflict = r.errors.find((e) => e.kind === 'ClampManyConflict');
    expect(conflict).toBeDefined();
    expect(isStructuralCardinalityConflict(conflict!)).toBe(true);
    expect(r.cardinalities.has(cardinalityVarId('n'))).toBe(false); // left unresolved for the driver
  });
});

describe('solveCardinality — promoteToMany inner fixpoint', () => {
  it('promotes every zip member to many from a single forceMany', () => {
    const r = run(
      { a: varAxis('na'), b: varAxis('nb'), c: varAxis('nc') },
      [
        { kind: 'promoteToMany', ports: ['a', 'b', 'c'], origin: o },
        { kind: 'forceMany', port: 'a', instance: { kind: 'inst', ref: dots }, origin: o },
      ],
    );
    for (const v of ['na', 'nb', 'nc']) {
      expect(r.cardinalities.get(cardinalityVarId(v))).toEqual({ kind: 'many', instance: 'dots' });
    }
    expect(r.errors).toHaveLength(0);
  });

  it('keeps a clampOne zip member at one while others go many — no conflict', () => {
    const r = run(
      { a: varAxis('na'), b: varAxis('nb'), c: varAxis('nc') },
      [
        { kind: 'promoteToMany', ports: ['a', 'b', 'c'], origin: o },
        { kind: 'forceMany', port: 'a', instance: { kind: 'inst', ref: dots }, origin: o },
        { kind: 'clampOne', port: 'b', origin: o },
      ],
    );
    expect(r.cardinalities.get(cardinalityVarId('na'))).toEqual({ kind: 'many', instance: 'dots' });
    expect(r.cardinalities.get(cardinalityVarId('nb'))).toEqual({ kind: 'one' });
    expect(r.cardinalities.get(cardinalityVarId('nc'))).toEqual({ kind: 'many', instance: 'dots' });
    expect(r.errors).toHaveLength(0);
  });

  it('reports InstanceConflict when two zip members are many with different instances', () => {
    const r = run(
      { a: varAxis('na'), b: varAxis('nb') },
      [
        { kind: 'promoteToMany', ports: ['a', 'b'], origin: o },
        { kind: 'forceMany', port: 'a', instance: { kind: 'inst', ref: dots }, origin: o },
        { kind: 'forceMany', port: 'b', instance: { kind: 'inst', ref: stars }, origin: o },
      ],
    );
    const conflicts = r.errors.filter((e) => e.kind === 'InstanceConflict');
    expect(conflicts).toHaveLength(1); // emitted once, not once per fixpoint pass
  });

  it('cascades many across overlapping zip sets in one solve', () => {
    const r = run(
      { a: varAxis('na'), b: varAxis('nb'), c: varAxis('nc'), d: varAxis('nd') },
      [
        { kind: 'promoteToMany', ports: ['a', 'b'], origin: o },
        { kind: 'promoteToMany', ports: ['b', 'c'], origin: o },
        { kind: 'promoteToMany', ports: ['c', 'd'], origin: o },
        { kind: 'forceMany', port: 'a', instance: { kind: 'inst', ref: dots }, origin: o },
      ],
    );
    for (const v of ['na', 'nb', 'nc', 'nd']) {
      expect(r.cardinalities.get(cardinalityVarId(v))).toEqual({ kind: 'many', instance: 'dots' });
    }
  });
});

describe('solveCardinality — deferred instance binding', () => {
  it('keeps an unresolved instance var as UNBOUND_INSTANCE under inherit policy', () => {
    const iv = cardinalityVarId('iv');
    const r = run(
      { A: varAxis('n') },
      [{ kind: 'forceMany', port: 'A', instance: { kind: 'var', var: iv }, origin: o }],
      new Set([iv]),
    );
    expect(r.cardinalities.get(cardinalityVarId('n'))).toEqual({ kind: 'many', instance: UNBOUND_INSTANCE });
    expect(r.errors).toHaveLength(0);
  });

  it('reports UnresolvedInstanceVar with no inherit policy', () => {
    const iv = cardinalityVarId('iv');
    const r = run(
      { A: varAxis('n') },
      [{ kind: 'forceMany', port: 'A', instance: { kind: 'var', var: iv }, origin: o }],
    );
    expect(r.errors.map((e) => e.kind)).toContain('UnresolvedInstanceVar');
    expect(r.cardinalities.has(cardinalityVarId('n'))).toBe(false);
  });
});

describe('solveCardinality — purity', () => {
  it('returns equal results across repeated calls on the same input', () => {
    const ports = { a: varAxis('na'), b: varAxis('nb'), c: varAxis('nc') };
    const constraints: readonly ZCardinalityConstraint[] = [
      { kind: 'promoteToMany', ports: ['a', 'b', 'c'], origin: o },
      { kind: 'forceMany', port: 'a', instance: { kind: 'inst', ref: dots }, origin: o },
      { kind: 'clampOne', port: 'b', origin: o },
    ];
    const first = run({ ...ports }, constraints);
    const second = run({ ...ports }, constraints);
    expect([...second.cardinalities]).toEqual([...first.cardinalities]);
    expect(second.errors).toEqual(first.errors);
  });
});
