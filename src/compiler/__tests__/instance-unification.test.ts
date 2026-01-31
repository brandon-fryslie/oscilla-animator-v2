/**
 * Instance Identity Tests (NEW: type-derived)
 *
 * Instance identity is derived from CanonicalType via requireManyInstance(expr.type).
 * There is no inferFieldInstance() method — instance is always in the type.
 *
 * Key behavior:
 * - Field types with cardinality=many(instanceRef) carry instance identity
 * - requireManyInstance(expr.type) extracts the InstanceRef
 * - Broadcast/const fields still have many cardinality (they carry the target instance type)
 * - Instance mismatches are caught at type constraint solving, not at IR build time
 */

import { describe, it, expect } from 'vitest';
import { IRBuilderImpl } from '../ir/IRBuilderImpl';
import { OpCode } from '../ir/types';
import {
  canonicalField,
  canonicalSignal,
  canonicalConst,
  floatConst,
  intConst,
  instanceRef,
  requireManyInstance,
  requireInst,
} from '../../core/canonical-types';
import { FLOAT, INT, VEC2 } from '../../core/canonical-types';
import { DOMAIN_CIRCLE } from '../../core/domain-registry';

describe('Instance Identity (type-derived)', () => {
  describe('field intrinsic instance from type', () => {
    it('requireManyInstance extracts instanceId from intrinsic field type', () => {
      const b = new IRBuilderImpl();
      const instance = b.createInstance(DOMAIN_CIRCLE, 10);
      const ref = instanceRef(DOMAIN_CIRCLE as string, instance as string);
      const type = canonicalField(FLOAT, { kind: 'scalar' }, ref);
      const field = b.fieldIntrinsic('index', type);

      const expr = b.getFieldExprs()[field as number];
      const extracted = requireManyInstance(expr.type);
      expect(extracted.instanceId).toBe(instance);
    });

    it('requireManyInstance works for normalizedIndex', () => {
      const b = new IRBuilderImpl();
      const instance = b.createInstance(DOMAIN_CIRCLE, 10);
      const ref = instanceRef(DOMAIN_CIRCLE as string, instance as string);
      const type = canonicalField(FLOAT, { kind: 'scalar' }, ref);
      const field = b.fieldIntrinsic('normalizedIndex', type);

      const expr = b.getFieldExprs()[field as number];
      expect(requireManyInstance(expr.type).instanceId).toBe(instance);
    });

    it('requireManyInstance works for randomId', () => {
      const b = new IRBuilderImpl();
      const instance = b.createInstance(DOMAIN_CIRCLE, 10);
      const ref = instanceRef(DOMAIN_CIRCLE as string, instance as string);
      const type = canonicalField(FLOAT, { kind: 'scalar' }, ref);
      const field = b.fieldIntrinsic('randomId', type);

      const expr = b.getFieldExprs()[field as number];
      expect(requireManyInstance(expr.type).instanceId).toBe(instance);
    });
  });

  describe('instance-agnostic fields still carry target instance in type', () => {
    it('broadcast field carries instance from its type', () => {
      const b = new IRBuilderImpl();
      const instance = b.createInstance(DOMAIN_CIRCLE, 10);
      const ref = instanceRef(DOMAIN_CIRCLE as string, instance as string);
      const fieldType = canonicalField(FLOAT, { kind: 'scalar' }, ref);
      const sig = b.sigConst(floatConst(1.0), canonicalSignal(FLOAT));
      const broadcast = b.Broadcast(sig, fieldType);

      // Broadcast has many cardinality (it's a field), so type carries instance
      const expr = b.getFieldExprs()[broadcast as number];
      expect(requireManyInstance(expr.type).instanceId).toBe(instance);
    });

    it('const field with zero cardinality has no instance', () => {
      const constType = canonicalConst(FLOAT);
      // Zero cardinality means no instance — requireManyInstance should throw
      const card = requireInst(constType.extent.cardinality, 'cardinality');
      expect(card.kind).toBe('zero');
      expect(() => requireManyInstance(constType)).toThrow();
    });
  });

  describe('instance propagation through composition', () => {
    it('map preserves instance from type', () => {
      const b = new IRBuilderImpl();
      const instance = b.createInstance(DOMAIN_CIRCLE, 10);
      const ref = instanceRef(DOMAIN_CIRCLE as string, instance as string);
      const type = canonicalField(FLOAT, { kind: 'scalar' }, ref);
      const intrinsic = b.fieldIntrinsic('index', type);
      const mapped = b.fieldMap(intrinsic, { kind: 'opcode', opcode: OpCode.Sin }, type);

      const expr = b.getFieldExprs()[mapped as number];
      expect(requireManyInstance(expr.type).instanceId).toBe(instance);
    });

    it('zipSig preserves instance from field type', () => {
      const b = new IRBuilderImpl();
      const instance = b.createInstance(DOMAIN_CIRCLE, 10);
      const ref = instanceRef(DOMAIN_CIRCLE as string, instance as string);
      const fieldType = canonicalField(FLOAT, { kind: 'scalar' }, ref);
      const sigType = canonicalSignal(FLOAT);
      const intrinsic = b.fieldIntrinsic('index', fieldType);
      const signal = b.sigConst(floatConst(2.0), sigType);
      const zipped = b.fieldZipSig(intrinsic, [signal], { kind: 'opcode', opcode: OpCode.Mul }, fieldType);

      const expr = b.getFieldExprs()[zipped as number];
      expect(requireManyInstance(expr.type).instanceId).toBe(instance);
    });

    it('zip of same-instance fields preserves instance in type', () => {
      const b = new IRBuilderImpl();
      const instance = b.createInstance(DOMAIN_CIRCLE, 10);
      const ref = instanceRef(DOMAIN_CIRCLE as string, instance as string);
      const type = canonicalField(FLOAT, { kind: 'scalar' }, ref);
      const field1 = b.fieldIntrinsic('index', type);
      const field2 = b.fieldIntrinsic('normalizedIndex', type);
      const zipped = b.fieldZip([field1, field2], { kind: 'opcode', opcode: OpCode.Add }, type);

      const expr = b.getFieldExprs()[zipped as number];
      expect(requireManyInstance(expr.type).instanceId).toBe(instance);
    });

    it('zip with broadcast preserves instance from non-broadcast type', () => {
      const b = new IRBuilderImpl();
      const instance = b.createInstance(DOMAIN_CIRCLE, 10);
      const ref = instanceRef(DOMAIN_CIRCLE as string, instance as string);
      const type = canonicalField(FLOAT, { kind: 'scalar' }, ref);
      const intrinsic = b.fieldIntrinsic('index', type);
      const sig = b.sigConst(floatConst(1.0), canonicalSignal(FLOAT));
      const broadcast = b.Broadcast(sig, type);
      const zipped = b.fieldZip([intrinsic, broadcast], { kind: 'opcode', opcode: OpCode.Add }, type);

      const expr = b.getFieldExprs()[zipped as number];
      expect(requireManyInstance(expr.type).instanceId).toBe(instance);
    });

    it('map after zip preserves instance', () => {
      const b = new IRBuilderImpl();
      const instance = b.createInstance(DOMAIN_CIRCLE, 10);
      const ref = instanceRef(DOMAIN_CIRCLE as string, instance as string);
      const type = canonicalField(FLOAT, { kind: 'scalar' }, ref);
      const field1 = b.fieldIntrinsic('index', type);
      const field2 = b.fieldIntrinsic('normalizedIndex', type);
      const zipped = b.fieldZip([field1, field2], { kind: 'opcode', opcode: OpCode.Add }, type);
      const mapped = b.fieldMap(zipped, { kind: 'opcode', opcode: OpCode.Sin }, type);

      const expr = b.getFieldExprs()[mapped as number];
      expect(requireManyInstance(expr.type).instanceId).toBe(instance);
    });
  });

  describe('layout field instance from type', () => {
    it('kernel-based layout fields carry instance in type', () => {
      const b = new IRBuilderImpl();
      const instance = b.createInstance(DOMAIN_CIRCLE, 10);
      const ref = instanceRef(DOMAIN_CIRCLE as string, instance as string);
      const floatType = canonicalField(FLOAT, { kind: 'scalar' }, ref);
      const vec2Type = canonicalField(VEC2, { kind: 'scalar' }, ref);

      const normalizedIndex = b.fieldIntrinsic('normalizedIndex', floatType);
      const colsSig = b.sigConst(intConst(5), canonicalSignal(INT));
      const rowsSig = b.sigConst(intConst(2), canonicalSignal(INT));
      const layoutField = b.fieldZipSig(
        normalizedIndex,
        [colsSig, rowsSig],
        { kind: 'kernel', name: 'gridLayout' },
        vec2Type
      );

      const expr = b.getFieldExprs()[layoutField as number];
      expect(requireManyInstance(expr.type).instanceId).toBe(instance);
    });
  });
});
