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
      const type = canonicalField(FLOAT, { kind: 'none' }, ref);
      const field = b.intrinsic('index', type);

      const expr = b.getValueExprs()[field as number];
      const extracted = requireManyInstance(expr.type);
      expect(extracted.instanceId).toBe(instance);
    });

    it('requireManyInstance works for normalizedIndex', () => {
      const b = new IRBuilderImpl();
      const instance = b.createInstance(DOMAIN_CIRCLE, 10);
      const ref = instanceRef(DOMAIN_CIRCLE as string, instance as string);
      const type = canonicalField(FLOAT, { kind: 'none' }, ref);
      const field = b.intrinsic('normalizedIndex', type);

      const expr = b.getValueExprs()[field as number];
      expect(requireManyInstance(expr.type).instanceId).toBe(instance);
    });

    it('requireManyInstance works for randomId', () => {
      const b = new IRBuilderImpl();
      const instance = b.createInstance(DOMAIN_CIRCLE, 10);
      const ref = instanceRef(DOMAIN_CIRCLE as string, instance as string);
      const type = canonicalField(FLOAT, { kind: 'none' }, ref);
      const field = b.intrinsic('randomId', type);

      const expr = b.getValueExprs()[field as number];
      expect(requireManyInstance(expr.type).instanceId).toBe(instance);
    });
  });

  describe('instance-agnostic fields still carry target instance in type', () => {
    it('broadcast field carries instance from its type', () => {
      const b = new IRBuilderImpl();
      const instance = b.createInstance(DOMAIN_CIRCLE, 10);
      const ref = instanceRef(DOMAIN_CIRCLE as string, instance as string);
      const fieldType = canonicalField(FLOAT, { kind: 'none' }, ref);
      const sig = b.constant(floatConst(1.0), canonicalSignal(FLOAT));
      const broadcast = b.broadcast(sig, fieldType);

      // Broadcast has many cardinality (it's a field), so type carries instance
      const expr = b.getValueExprs()[broadcast as number];
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
      const type = canonicalField(FLOAT, { kind: 'none' }, ref);
      const intrinsic = b.intrinsic('index', type);
      const mapped = b.kernelMap(intrinsic, { kind: 'opcode', opcode: OpCode.Sin }, type);

      const expr = b.getValueExprs()[mapped as number];
      expect(requireManyInstance(expr.type).instanceId).toBe(instance);
    });

    it('zipSig preserves instance from field type', () => {
      const b = new IRBuilderImpl();
      const instance = b.createInstance(DOMAIN_CIRCLE, 10);
      const ref = instanceRef(DOMAIN_CIRCLE as string, instance as string);
      const fieldType = canonicalField(FLOAT, { kind: 'none' }, ref);
      const sigType = canonicalSignal(FLOAT);
      const intrinsic = b.intrinsic('index', fieldType);
      const signal = b.constant(floatConst(2.0), sigType);
      const zipped = b.kernelZipSig(intrinsic, [signal], { kind: 'opcode', opcode: OpCode.Mul }, fieldType);

      const expr = b.getValueExprs()[zipped as number];
      expect(requireManyInstance(expr.type).instanceId).toBe(instance);
    });

    it('zip of same-instance fields preserves instance in type', () => {
      const b = new IRBuilderImpl();
      const instance = b.createInstance(DOMAIN_CIRCLE, 10);
      const ref = instanceRef(DOMAIN_CIRCLE as string, instance as string);
      const type = canonicalField(FLOAT, { kind: 'none' }, ref);
      const field1 = b.intrinsic('index', type);
      const field2 = b.intrinsic('normalizedIndex', type);
      const zipped = b.kernelZip([field1, field2], { kind: 'opcode', opcode: OpCode.Add }, type);

      const expr = b.getValueExprs()[zipped as number];
      expect(requireManyInstance(expr.type).instanceId).toBe(instance);
    });

    it('zip with broadcast preserves instance from non-broadcast type', () => {
      const b = new IRBuilderImpl();
      const instance = b.createInstance(DOMAIN_CIRCLE, 10);
      const ref = instanceRef(DOMAIN_CIRCLE as string, instance as string);
      const type = canonicalField(FLOAT, { kind: 'none' }, ref);
      const intrinsic = b.intrinsic('index', type);
      const sig = b.constant(floatConst(1.0), canonicalSignal(FLOAT));
      const broadcast = b.broadcast(sig, type);
      const zipped = b.kernelZip([intrinsic, broadcast], { kind: 'opcode', opcode: OpCode.Add }, type);

      const expr = b.getValueExprs()[zipped as number];
      expect(requireManyInstance(expr.type).instanceId).toBe(instance);
    });

    it('map after zip preserves instance', () => {
      const b = new IRBuilderImpl();
      const instance = b.createInstance(DOMAIN_CIRCLE, 10);
      const ref = instanceRef(DOMAIN_CIRCLE as string, instance as string);
      const type = canonicalField(FLOAT, { kind: 'none' }, ref);
      const field1 = b.intrinsic('index', type);
      const field2 = b.intrinsic('normalizedIndex', type);
      const zipped = b.kernelZip([field1, field2], { kind: 'opcode', opcode: OpCode.Add }, type);
      const mapped = b.kernelMap(zipped, { kind: 'opcode', opcode: OpCode.Sin }, type);

      const expr = b.getValueExprs()[mapped as number];
      expect(requireManyInstance(expr.type).instanceId).toBe(instance);
    });
  });

  describe('layout field instance from type', () => {
    it('kernel-based layout fields carry instance in type', () => {
      const b = new IRBuilderImpl();
      const instance = b.createInstance(DOMAIN_CIRCLE, 10);
      const ref = instanceRef(DOMAIN_CIRCLE as string, instance as string);
      const floatType = canonicalField(FLOAT, { kind: 'none' }, ref);
      const vec2Type = canonicalField(VEC2, { kind: 'none' }, ref);

      const normalizedIndex = b.intrinsic('normalizedIndex', floatType);
      const colsSig = b.constant(intConst(5), canonicalSignal(INT));
      const rowsSig = b.constant(intConst(2), canonicalSignal(INT));
      const layoutField = b.kernelZipSig(
        normalizedIndex,
        [colsSig, rowsSig],
        { kind: 'kernel', name: 'gridLayout' },
        vec2Type
      );

      const expr = b.getValueExprs()[layoutField as number];
      expect(requireManyInstance(expr.type).instanceId).toBe(instance);
    });
  });

  describe('instance name resolution enforcement', () => {
    it('createInstance generates unique non-placeholder IDs', () => {
      const b = new IRBuilderImpl();
      const inst0 = b.createInstance(DOMAIN_CIRCLE, 10);
      const inst1 = b.createInstance(DOMAIN_CIRCLE, 20);

      // Instance IDs must NOT be 'default' — they are generated names
      expect(inst0).not.toBe('default');
      expect(inst1).not.toBe('default');
      // Each instance gets a unique ID
      expect(inst0).not.toBe(inst1);
    });

    it('field expressions with real instance IDs can be looked up in instances map', () => {
      const b = new IRBuilderImpl();
      const instance = b.createInstance(DOMAIN_CIRCLE, 10);
      const ref = instanceRef(DOMAIN_CIRCLE as string, instance as string);
      const type = canonicalField(FLOAT, { kind: 'none' }, ref);
      const field = b.intrinsic('index', type);

      // Extract instance from field expression type
      const expr = b.getValueExprs()[field as number];
      const extractedRef = requireManyInstance(expr.type);

      // The extracted instance ID must exist in the builder's instances map
      const instances = b.getInstances();
      expect(instances.has(extractedRef.instanceId)).toBe(true);
      expect(instances.get(extractedRef.instanceId)?.count).toBe(10);
    });

    it('placeholder instance ID "default" is never resolvable in instances map', () => {
      const b = new IRBuilderImpl();
      b.createInstance(DOMAIN_CIRCLE, 10);

      // 'default' must not exist as an instance — it's a block definition placeholder
      const instances = b.getInstances();
      expect(instances.has('default' as any)).toBe(false);
    });
  });
});
