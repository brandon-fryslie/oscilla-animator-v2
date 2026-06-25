/**
 * The payload/unit sub-solver, exercised with hand-rolled constraints — no
 * graph, no fixpoint. Each test pins one resolution rule or one failure mode,
 * so a regression names itself. [LAW:behavior-not-structure]
 */

import { describe, it, expect } from 'vitest';
import { payloadVarId, unitVarId, type ZPayloadType } from '../../schemas';
import {
  solvePayloadUnit,
  type PortVarInfo,
  type ZPayloadUnitConstraint,
} from '../payload-unit';
import type { ConstraintOrigin, PortKey } from '../shared';

const rule: ConstraintOrigin = { kind: 'blockRule', blockId: 'b', rule: 'test' };
const edge = (edgeId: string): ConstraintOrigin => ({ kind: 'edge', edgeId });

const ports = (entries: Record<string, PortVarInfo>): ReadonlyMap<PortKey, PortVarInfo> =>
  new Map(Object.entries(entries));

const run = (
  portMap: Record<string, PortVarInfo>,
  constraints: readonly ZPayloadUnitConstraint[],
  edgeVerifications?: readonly { edgeId: string; from: PortKey; to: PortKey }[],
) => solvePayloadUnit({ ports: ports(portMap), constraints, edgeVerifications });

describe('solvePayloadUnit — payload', () => {
  it('resolves a single concrete payload', () => {
    const r = run(
      { A: { payloadVar: payloadVarId('a') } },
      [{ kind: 'concretePayload', port: 'A', value: { kind: 'vec3' }, origin: rule }],
    );
    expect(r.payloads.get(payloadVarId('a'))).toEqual({ kind: 'vec3' });
    expect(r.portPayloads.get('A')).toEqual({ kind: 'vec3' });
    expect(r.errors).toHaveLength(0);
  });

  it('resolves a variable from a concrete neighbour via payloadEq transitivity', () => {
    const r = run(
      { A: {}, B: { payloadVar: payloadVarId('b') } },
      [
        { kind: 'concretePayload', port: 'A', value: { kind: 'float' }, origin: rule },
        { kind: 'payloadEq', a: 'A', b: 'B', origin: edge('e1') },
      ],
    );
    expect(r.payloads.get(payloadVarId('b'))).toEqual({ kind: 'float' });
  });

  it('reports ConflictingPayloads for two incompatible concretes on one group', () => {
    const r = run(
      { A: {}, B: {} },
      [
        { kind: 'concretePayload', port: 'A', value: { kind: 'float' }, origin: rule },
        { kind: 'concretePayload', port: 'B', value: { kind: 'vec2' }, origin: rule },
        { kind: 'payloadEq', a: 'A', b: 'B', origin: edge('e1') },
      ],
    );
    expect(r.errors.map((e) => e.kind)).toContain('ConflictingPayloads');
    // edge origin on the unifying constraint → the user's patch is at fault.
    expect(r.errors.find((e) => e.kind === 'ConflictingPayloads')?.errorClass).toBe('UserPatchTypeError');
  });

  it('defaults a single-element allowed set to that payload', () => {
    const r = run(
      { A: { payloadVar: payloadVarId('a') } },
      [{ kind: 'requirePayloadIn', port: 'A', allowed: [{ kind: 'int' }], origin: rule }],
    );
    expect(r.payloads.get(payloadVarId('a'))).toEqual({ kind: 'int' });
  });

  it('intersects allowed sets to a single non-empty choice', () => {
    const r = run(
      { A: { payloadVar: payloadVarId('a') } },
      [
        { kind: 'requirePayloadIn', port: 'A', allowed: [{ kind: 'float' }, { kind: 'int' }], origin: rule },
        { kind: 'requirePayloadIn', port: 'A', allowed: [{ kind: 'int' }], origin: rule },
      ],
    );
    expect(r.payloads.get(payloadVarId('a'))).toEqual({ kind: 'int' });
    expect(r.errors).toHaveLength(0);
  });

  it('reports EmptyAllowedSet when the intersection is empty', () => {
    const r = run(
      { A: { payloadVar: payloadVarId('a') } },
      [
        { kind: 'requirePayloadIn', port: 'A', allowed: [{ kind: 'float' }], origin: rule },
        { kind: 'requirePayloadIn', port: 'A', allowed: [{ kind: 'int' }], origin: rule },
      ],
    );
    expect(r.errors.map((e) => e.kind)).toContain('EmptyAllowedSet');
  });
});

describe('solvePayloadUnit — unit', () => {
  it('reports UnitlessMismatch for a concrete non-none unit where unitless is required', () => {
    const r = run(
      { A: {} },
      [
        { kind: 'concreteUnit', port: 'A', value: { kind: 'angle', unit: 'radians' }, origin: rule },
        { kind: 'requireUnitless', port: 'A', origin: rule },
      ],
    );
    expect(r.errors.map((e) => e.kind)).toContain('UnitlessMismatch');
  });

  it('defaults an unresolved required-unitless port to none with no diagnostic', () => {
    const r = run(
      { A: { unitVar: unitVarId('u') } },
      [{ kind: 'requireUnitless', port: 'A', origin: rule }],
    );
    expect(r.units.get(unitVarId('u'))).toEqual({ kind: 'none' });
    expect(r.diagnostics).toHaveLength(0);
  });

  it('defaults an unconstrained unit variable to none and announces it', () => {
    const r = run({ A: { unitVar: unitVarId('u') } }, []);
    expect(r.units.get(unitVarId('u'))).toEqual({ kind: 'none' });
    expect(r.diagnostics.map((d) => d.code)).toContain('UnitDefaultedToNone');
  });
});

describe('solvePayloadUnit — purity', () => {
  it('returns equal results across repeated calls on the same input', () => {
    const portMap = { A: {}, B: { payloadVar: payloadVarId('b') }, C: { unitVar: unitVarId('u') } };
    const constraints: readonly ZPayloadUnitConstraint[] = [
      { kind: 'concretePayload', port: 'A', value: { kind: 'float' }, origin: rule },
      { kind: 'payloadEq', a: 'A', b: 'B', origin: edge('e1') },
    ];
    const first = run({ ...portMap }, constraints);
    const second = run({ ...portMap }, constraints);
    expect([...second.payloads]).toEqual([...first.payloads]);
    expect([...second.portPayloads]).toEqual([...first.portPayloads]);
    expect(second.diagnostics).toEqual(first.diagnostics);
  });
});

describe('solvePayloadUnit — edge verification safety net', () => {
  it('catches a dropped constraint via a post-solve edge mismatch', () => {
    // A=float, B=int are never linked by a payloadEq — the "dropped" constraint.
    // Only the edge verification catches that they disagree. Both carry a
    // concrete unit, as every extracted port does. [LAW:no-silent-failure]
    const incompatible: ZPayloadType[] = [{ kind: 'float' }, { kind: 'int' }];
    const r = run(
      { A: {}, B: {} },
      [
        { kind: 'concretePayload', port: 'A', value: incompatible[0], origin: rule },
        { kind: 'concretePayload', port: 'B', value: incompatible[1], origin: rule },
        { kind: 'concreteUnit', port: 'A', value: { kind: 'none' }, origin: rule },
        { kind: 'concreteUnit', port: 'B', value: { kind: 'none' }, origin: rule },
      ],
      [{ edgeId: 'e1', from: 'A', to: 'B' }],
    );
    expect(r.diagnostics.map((d) => d.code)).toContain('PostSolveEdgeTypeMismatch');
  });
});
