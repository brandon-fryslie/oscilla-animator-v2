/**
 * Tests for the payload/unit constraint solver.
 */
import { describe, it, expect } from 'vitest';
import { solvePayloadUnit, buildPortVarMapping } from '../solve';
import type { PayloadUnitConstraint, ConstraintOrigin } from '../solve';
import type { DraftPortKey } from '../../type-facts';
import { draftPortKey } from '../../type-facts';
import { FLOAT, INT, VEC2, COLOR, unitScalar, unitNone, unitRadians } from '../../../../core/canonical-types';
import type { PayloadType, UnitType } from '../../../../core/canonical-types';
import type { InferenceCanonicalType } from '../../../../core/inference-types';
import { inferType, payloadVar, unitVar } from '../../../../core/inference-types';

// Helpers
const portA = draftPortKey('b1', 'a', 'in');
const portB = draftPortKey('b1', 'b', 'in');
const portOut = draftPortKey('b1', 'out', 'out');
const portC = draftPortKey('b2', 'out', 'out');

const edgeOrigin: ConstraintOrigin = { kind: 'edge', edgeId: 'e1' };
const metaOrigin: ConstraintOrigin = { kind: 'payloadMetadata', blockType: 'Add', port: 'a' };
const portDefOrigin: ConstraintOrigin = { kind: 'portDef', blockType: 'Const', port: 'out', dir: 'out' };
const blockRuleOrigin: ConstraintOrigin = { kind: 'blockRule', blockId: 'b1', blockType: 'Add', rule: 'requireUnitless' };

function makeVarMapping(
  ports: [DraftPortKey, string | null, string | null][],
): Map<DraftPortKey, { payloadVarId: string | null; unitVarId: string | null }> {
  const map = new Map<DraftPortKey, { payloadVarId: string | null; unitVarId: string | null }>();
  for (const [key, pv, uv] of ports) {
    map.set(key, { payloadVarId: pv, unitVarId: uv });
  }
  return map;
}

describe('solvePayloadUnit', () => {
  // ==========================================================================
  // Basic payload resolution
  // ==========================================================================

  it('concretePayload assigns payload to port', () => {
    const mapping = makeVarMapping([[portA, null, null]]);
    const constraints: PayloadUnitConstraint[] = [
      { kind: 'concretePayload', port: portA, value: FLOAT, origin: portDefOrigin },
    ];

    const result = solvePayloadUnit(constraints, mapping);
    expect(result.errors).toHaveLength(0);
    expect(result.portPayloads.get(portA)?.kind).toBe('float');
  });

  it('payloadEq with concrete binds var to float', () => {
    const mapping = makeVarMapping([
      [portA, 'T', null],
      [portC, null, null],
    ]);
    const constraints: PayloadUnitConstraint[] = [
      { kind: 'concretePayload', port: portC, value: FLOAT, origin: portDefOrigin },
      { kind: 'payloadEq', a: portA, b: portC, origin: edgeOrigin },
    ];

    const result = solvePayloadUnit(constraints, mapping);
    expect(result.errors).toHaveLength(0);
    expect(result.portPayloads.get(portA)?.kind).toBe('float');
    expect(result.payloads.get('T')?.kind).toBe('float');
  });

  it('two different concrete payloads in same group → ConflictingPayloads', () => {
    const mapping = makeVarMapping([
      [portA, 'T', null],
      [portC, null, null],
    ]);
    const constraints: PayloadUnitConstraint[] = [
      { kind: 'concretePayload', port: portA, value: INT, origin: portDefOrigin },
      { kind: 'concretePayload', port: portC, value: FLOAT, origin: portDefOrigin },
      { kind: 'payloadEq', a: portA, b: portC, origin: edgeOrigin },
    ];

    const result = solvePayloadUnit(constraints, mapping);
    expect(result.errors.some(e => e.kind === 'ConflictingPayloads')).toBe(true);
  });

  // ==========================================================================
  // RequirePayloadIn (allowed-set constraints)
  // ==========================================================================

  it('requirePayloadIn with single entry resolves var', () => {
    const mapping = makeVarMapping([[portA, 'T', null]]);
    const constraints: PayloadUnitConstraint[] = [
      { kind: 'requirePayloadIn', port: portA, allowed: [FLOAT], origin: metaOrigin },
    ];

    const result = solvePayloadUnit(constraints, mapping);
    expect(result.errors).toHaveLength(0);
    expect(result.portPayloads.get(portA)?.kind).toBe('float');
    expect(result.payloads.get('T')?.kind).toBe('float');
  });

  it('requirePayloadIn intersection empties → EmptyAllowedSet error', () => {
    const mapping = makeVarMapping([[portA, 'T', null]]);
    const constraints: PayloadUnitConstraint[] = [
      { kind: 'requirePayloadIn', port: portA, allowed: [FLOAT, INT], origin: metaOrigin },
      { kind: 'requirePayloadIn', port: portA, allowed: [VEC2, COLOR], origin: metaOrigin },
    ];

    const result = solvePayloadUnit(constraints, mapping);
    expect(result.errors.some(e => e.kind === 'EmptyAllowedSet')).toBe(true);
  });

  it('requirePayloadIn intersection with concrete → validates against set', () => {
    const mapping = makeVarMapping([
      [portA, 'T', null],
      [portC, null, null],
    ]);
    const constraints: PayloadUnitConstraint[] = [
      { kind: 'requirePayloadIn', port: portA, allowed: [FLOAT, INT], origin: metaOrigin },
      { kind: 'concretePayload', port: portC, value: VEC2, origin: portDefOrigin },
      { kind: 'payloadEq', a: portA, b: portC, origin: edgeOrigin },
    ];

    const result = solvePayloadUnit(constraints, mapping);
    // VEC2 not in [FLOAT, INT] → PayloadNotInAllowedSet
    expect(result.errors.some(e => e.kind === 'PayloadNotInAllowedSet')).toBe(true);
  });

  it('requirePayloadIn allows concrete that is in set', () => {
    const mapping = makeVarMapping([
      [portA, 'T', null],
      [portC, null, null],
    ]);
    const constraints: PayloadUnitConstraint[] = [
      { kind: 'requirePayloadIn', port: portA, allowed: [FLOAT, INT, VEC2], origin: metaOrigin },
      { kind: 'concretePayload', port: portC, value: VEC2, origin: portDefOrigin },
      { kind: 'payloadEq', a: portA, b: portC, origin: edgeOrigin },
    ];

    const result = solvePayloadUnit(constraints, mapping);
    expect(result.errors).toHaveLength(0);
    expect(result.portPayloads.get(portA)?.kind).toBe('vec2');
  });

  // ==========================================================================
  // Unit resolution
  // ==========================================================================

  it('concreteUnit assigns unit to port', () => {
    const mapping = makeVarMapping([[portA, null, null]]);
    const constraints: PayloadUnitConstraint[] = [
      { kind: 'concreteUnit', port: portA, value: unitScalar(), origin: portDefOrigin },
    ];

    const result = solvePayloadUnit(constraints, mapping);
    expect(result.errors).toHaveLength(0);
    expect(result.portUnits.get(portA)?.kind).toBe('scalar');
  });

  it('unitEq propagates units across edge', () => {
    const mapping = makeVarMapping([
      [portA, null, 'U'],
      [portC, null, null],
    ]);
    const constraints: PayloadUnitConstraint[] = [
      { kind: 'concreteUnit', port: portC, value: unitRadians(), origin: portDefOrigin },
      { kind: 'unitEq', a: portA, b: portC, origin: edgeOrigin },
    ];

    const result = solvePayloadUnit(constraints, mapping);
    expect(result.errors).toHaveLength(0);
    expect(result.portUnits.get(portA)?.kind).toBe('angle');
    expect(result.units.get('U')?.kind).toBe('angle');
  });

  // ==========================================================================
  // RequireUnitless
  // ==========================================================================

  it('requireUnitless with no other constraint resolves to none', () => {
    const mapping = makeVarMapping([[portA, null, 'U']]);
    const constraints: PayloadUnitConstraint[] = [
      { kind: 'requireUnitless', port: portA, origin: blockRuleOrigin },
    ];

    const result = solvePayloadUnit(constraints, mapping);
    expect(result.errors).toHaveLength(0);
    expect(result.portUnits.get(portA)?.kind).toBe('none');
    expect(result.units.get('U')?.kind).toBe('none');
  });

  it('requireUnitless + concrete none → ok', () => {
    const mapping = makeVarMapping([[portA, null, null]]);
    const constraints: PayloadUnitConstraint[] = [
      { kind: 'concreteUnit', port: portA, value: unitNone(), origin: portDefOrigin },
      { kind: 'requireUnitless', port: portA, origin: blockRuleOrigin },
    ];

    const result = solvePayloadUnit(constraints, mapping);
    expect(result.errors).toHaveLength(0);
  });

  it('requireUnitless + concrete radians → UnitlessMismatch', () => {
    const mapping = makeVarMapping([[portA, null, null]]);
    const constraints: PayloadUnitConstraint[] = [
      { kind: 'concreteUnit', port: portA, value: unitRadians(), origin: portDefOrigin },
      { kind: 'requireUnitless', port: portA, origin: blockRuleOrigin },
    ];

    const result = solvePayloadUnit(constraints, mapping);
    expect(result.errors.some(e => e.kind === 'UnitlessMismatch')).toBe(true);
  });

  // ==========================================================================
  // Error classification
  // ==========================================================================

  it('edge conflict → UserPatchTypeError', () => {
    const mapping = makeVarMapping([
      [portA, null, null],
      [portC, null, null],
    ]);
    const constraints: PayloadUnitConstraint[] = [
      { kind: 'concretePayload', port: portA, value: FLOAT, origin: portDefOrigin },
      { kind: 'concretePayload', port: portC, value: INT, origin: portDefOrigin },
      { kind: 'payloadEq', a: portA, b: portC, origin: edgeOrigin },
    ];

    const result = solvePayloadUnit(constraints, mapping);
    const error = result.errors.find(e => e.kind === 'ConflictingPayloads');
    expect(error).toBeDefined();
    expect(error!.errorClass).toBe('UserPatchTypeError');
  });

  it('allowed-set violation from metadata origin → BlockDefTooSpecific', () => {
    const mapping = makeVarMapping([[portA, 'T', null]]);
    const constraints: PayloadUnitConstraint[] = [
      { kind: 'requirePayloadIn', port: portA, allowed: [FLOAT, INT], origin: metaOrigin },
      { kind: 'concretePayload', port: portA, value: VEC2, origin: portDefOrigin },
    ];

    const result = solvePayloadUnit(constraints, mapping);
    const error = result.errors.find(e => e.kind === 'PayloadNotInAllowedSet');
    expect(error).toBeDefined();
    expect(error!.errorClass).toBe('BlockDefTooSpecific');
  });

  // ==========================================================================
  // Multi-port same-var sharing
  // ==========================================================================

  it('multiple ports sharing a payload var all resolve to same type', () => {
    const mapping = makeVarMapping([
      [portA, 'T', null],
      [portB, 'T', null],
      [portOut, 'T', null],
      [portC, null, null],
    ]);
    const constraints: PayloadUnitConstraint[] = [
      // All three ports share var T
      { kind: 'payloadEq', a: portA, b: portB, origin: { kind: 'blockRule', blockId: 'b1', blockType: 'Add', rule: 'samePayloadVar' } },
      { kind: 'payloadEq', a: portA, b: portOut, origin: { kind: 'blockRule', blockId: 'b1', blockType: 'Add', rule: 'samePayloadVar' } },
      // Edge from Const (concrete float) to portA
      { kind: 'concretePayload', port: portC, value: FLOAT, origin: portDefOrigin },
      { kind: 'payloadEq', a: portC, b: portA, origin: edgeOrigin },
    ];

    const result = solvePayloadUnit(constraints, mapping);
    expect(result.errors).toHaveLength(0);
    expect(result.portPayloads.get(portA)?.kind).toBe('float');
    expect(result.portPayloads.get(portB)?.kind).toBe('float');
    expect(result.portPayloads.get(portOut)?.kind).toBe('float');
    expect(result.payloads.get('T')?.kind).toBe('float');
  });

  // ==========================================================================
  // buildPortVarMapping
  // ==========================================================================

  it('buildPortVarMapping extracts var ids from inference types', () => {
    const portBaseTypes = new Map<DraftPortKey, InferenceCanonicalType>();
    portBaseTypes.set(portA, inferType(payloadVar('T'), unitVar('U')));
    portBaseTypes.set(portC, inferType(FLOAT, unitScalar()));

    const mapping = buildPortVarMapping(portBaseTypes);

    expect(mapping.get(portA)).toEqual({ payloadVarId: 'T', unitVarId: 'U' });
    expect(mapping.get(portC)).toEqual({ payloadVarId: null, unitVarId: null });
  });
});
