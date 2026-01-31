/**
 * Enforcement tests: FieldExpr objects must NOT contain instanceId.
 *
 * Instance identity is derived from CanonicalType via requireManyInstance(expr.type).
 * These tests ensure no builder method emits instanceId as a property on FieldExpr objects.
 * If any agent re-adds instanceId to builder output, these tests WILL FAIL.
 */
import { describe, it, expect } from 'vitest';
import { IRBuilderImpl } from '../IRBuilderImpl';
import {
  FLOAT,
  VEC2,
  canonicalField,
  canonicalType,
  instanceRef,
  requireManyInstance,
  floatConst,
  unitScalar,
} from '../../../core/canonical-types';
import type { FieldExpr } from '../types';
import { stableStateId } from '../types';

// Helper: a field type with many(instance) cardinality
const TEST_INSTANCE = instanceRef('testDomain', 'test_inst');
const FIELD_FLOAT = canonicalField(FLOAT, unitScalar(), TEST_INSTANCE);
const FIELD_VEC2 = canonicalField(VEC2, unitScalar(), TEST_INSTANCE);

/**
 * Assert that a FieldExpr object has NO instanceId property.
 * This is the core enforcement: instanceId must be derived from type, not stored.
 */
function assertNoInstanceId(expr: FieldExpr, label: string): void {
  // Use Object.keys to check the runtime object, not the TypeScript type
  const keys = Object.keys(expr);
  expect(keys, `${label}: FieldExpr should not have instanceId key`).not.toContain('instanceId');
}

describe('FieldExpr instanceId enforcement (TYPE-SYSTEM-INVARIANT #10)', () => {
  describe('no instanceId on any FieldExpr variant built by IRBuilderImpl', () => {
    it('FieldExprIntrinsic has no instanceId property', () => {
      const b = new IRBuilderImpl();
      const id = b.fieldIntrinsic('index', FIELD_FLOAT);
      const expr = b.getFieldExprs()[id as number];
      assertNoInstanceId(expr, 'fieldIntrinsic');
      expect(expr.kind).toBe('intrinsic');
    });

    it('FieldExprPlacement has no instanceId property', () => {
      const b = new IRBuilderImpl();
      const id = b.fieldPlacement('uv', 'halton2D', FIELD_VEC2);
      const expr = b.getFieldExprs()[id as number];
      assertNoInstanceId(expr, 'fieldPlacement');
      expect(expr.kind).toBe('placement');
    });

    it('FieldExprMap has no instanceId property', () => {
      const b = new IRBuilderImpl();
      const inputId = b.fieldIntrinsic('index', FIELD_FLOAT);
      const id = b.fieldMap(inputId, { kind: 'kernel', name: 'sin' }, FIELD_FLOAT);
      const expr = b.getFieldExprs()[id as number];
      assertNoInstanceId(expr, 'fieldMap');
      expect(expr.kind).toBe('map');
    });

    it('FieldExprZip has no instanceId property', () => {
      const b = new IRBuilderImpl();
      const input1 = b.fieldIntrinsic('index', FIELD_FLOAT);
      const input2 = b.fieldIntrinsic('randomId', FIELD_FLOAT);
      const id = b.fieldZip([input1, input2], { kind: 'kernel', name: 'add' }, FIELD_FLOAT);
      const expr = b.getFieldExprs()[id as number];
      assertNoInstanceId(expr, 'fieldZip');
      expect(expr.kind).toBe('zip');
    });

    it('FieldExprZipSig has no instanceId property', () => {
      const b = new IRBuilderImpl();
      const fieldId = b.fieldIntrinsic('index', FIELD_FLOAT);
      const sigId = b.sigConst(floatConst(1.0), canonicalType(FLOAT));
      const id = b.fieldZipSig(fieldId, [sigId], { kind: 'kernel', name: 'scale' }, FIELD_FLOAT);
      const expr = b.getFieldExprs()[id as number];
      assertNoInstanceId(expr, 'fieldZipSig');
      expect(expr.kind).toBe('zipSig');
    });

    it('FieldExprStateRead has no instanceId property', () => {
      const b = new IRBuilderImpl();
      const stateSlot = b.allocStateSlot(stableStateId('block1', 'delay'));
      const id = b.fieldStateRead(stateSlot, FIELD_FLOAT);
      const expr = b.getFieldExprs()[id as number];
      assertNoInstanceId(expr, 'fieldStateRead');
      expect(expr.kind).toBe('stateRead');
    });

    it('FieldExprBroadcast has no instanceId property', () => {
      const b = new IRBuilderImpl();
      const sigId = b.sigConst(floatConst(1.0), canonicalType(FLOAT));
      const id = b.Broadcast(sigId, FIELD_FLOAT);
      const expr = b.getFieldExprs()[id as number];
      assertNoInstanceId(expr, 'Broadcast');
      expect(expr.kind).toBe('broadcast');
    });

    it('fieldCombine (zip variant) has no instanceId property', () => {
      const b = new IRBuilderImpl();
      const input1 = b.fieldIntrinsic('index', FIELD_FLOAT);
      const input2 = b.fieldIntrinsic('randomId', FIELD_FLOAT);
      const id = b.fieldCombine([input1, input2], 'sum', FIELD_FLOAT);
      const expr = b.getFieldExprs()[id as number];
      assertNoInstanceId(expr, 'fieldCombine');
      expect(expr.kind).toBe('zip');
    });
  });

  describe('instance identity is derived from CanonicalType', () => {
    it('requireManyInstance extracts instance from field type', () => {
      const ref = requireManyInstance(FIELD_FLOAT);
      expect(ref.instanceId).toBe('test_inst');
      expect(ref.domainTypeId).toBe('testDomain');
    });

    it('field expressions carry instance identity in their type, not as a field', () => {
      const b = new IRBuilderImpl();
      const id = b.fieldIntrinsic('index', FIELD_FLOAT);
      const expr = b.getFieldExprs()[id as number];
      // Instance is in the type
      const ref = requireManyInstance(expr.type);
      expect(ref.instanceId).toBe('test_inst');
      // NOT on the expr itself
      expect('instanceId' in expr).toBe(false);
    });
  });
});
