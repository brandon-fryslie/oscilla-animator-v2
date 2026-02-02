/**
 * ValueExprSignalEvaluator Tests
 *
 * Tests signal-extent evaluation of ValueExpr nodes,
 * specifically extract from strided slot-backed multi-component signals.
 */

import { describe, it, expect } from 'vitest';
import { evaluateValueExprSignal } from '../ValueExprSignalEvaluator';
import { createRuntimeState } from '../RuntimeState';
import type { ValueExpr } from '../../compiler/ir/value-expr';
import { valueExprId, valueSlot } from '../../compiler/ir/Indices';
import { canonicalType } from '../../core/canonical-types';
import { FLOAT, VEC3 } from '../../core/canonical-types';
import type { EffectiveTime } from '../timeResolution';

/** Minimal EffectiveTime for tests that don't use time. */
const DUMMY_TIME: EffectiveTime = {
  tAbsMs: 0, tMs: 0, dt: 16.67,
  phaseA: 0, phaseB: 0, pulse: 1, energy: 0,
  palette: new Float32Array([1, 1, 1, 1]),
};

/**
 * Helper to create a minimal RuntimeState with specific slot values.
 */
function createTestState(slotValues: Record<number, number>, valueExprCount: number) {
  const maxSlot = Math.max(...Object.keys(slotValues).map(Number), 0) + 1;
  const state = createRuntimeState(maxSlot, 0, 0, 0, valueExprCount);
  state.time = DUMMY_TIME;
  for (const [slot, value] of Object.entries(slotValues)) {
    state.values.f64[Number(slot)] = value;
  }
  return state;
}

describe('ValueExprSignalEvaluator', () => {
  describe('extract from strided slots', () => {
    it('extracts component 0 (x) from a vec3 stored in strided slots', () => {
      // Set up: vec3 at slots 10, 11, 12 with values (3.0, 5.0, 7.0)
      const slotBase = 10;
      const state = createTestState(
        { [slotBase]: 3.0, [slotBase + 1]: 5.0, [slotBase + 2]: 7.0 },
        2
      );

      // ValueExpr table:
      // [0] = slotRead(slot=10, type=vec3)
      // [1] = extract(input=0, componentIndex=0, type=float)
      const exprs: ValueExpr[] = [
        { kind: 'slotRead', type: canonicalType(VEC3), slot: valueSlot(slotBase) },
        { kind: 'extract', type: canonicalType(FLOAT), input: valueExprId(0), componentIndex: 0 },
      ];

      const result = evaluateValueExprSignal(valueExprId(1), exprs, state);
      expect(result).toBe(3.0);
    });

    it('extracts component 1 (y) from a vec3 stored in strided slots', () => {
      const slotBase = 10;
      const state = createTestState(
        { [slotBase]: 3.0, [slotBase + 1]: 5.0, [slotBase + 2]: 7.0 },
        2
      );

      const exprs: ValueExpr[] = [
        { kind: 'slotRead', type: canonicalType(VEC3), slot: valueSlot(slotBase) },
        { kind: 'extract', type: canonicalType(FLOAT), input: valueExprId(0), componentIndex: 1 },
      ];

      const result = evaluateValueExprSignal(valueExprId(1), exprs, state);
      expect(result).toBe(5.0);
    });

    it('extracts component 2 (z) from a vec3 stored in strided slots', () => {
      const slotBase = 10;
      const state = createTestState(
        { [slotBase]: 3.0, [slotBase + 1]: 5.0, [slotBase + 2]: 7.0 },
        2
      );

      const exprs: ValueExpr[] = [
        { kind: 'slotRead', type: canonicalType(VEC3), slot: valueSlot(slotBase) },
        { kind: 'extract', type: canonicalType(FLOAT), input: valueExprId(0), componentIndex: 2 },
      ];

      const result = evaluateValueExprSignal(valueExprId(1), exprs, state);
      expect(result).toBe(7.0);
    });

    it('extracts component 0 from non-slotRead input (fallback)', () => {
      // When extract input is a const (not slotRead), componentIndex 0 falls back to evaluating input
      const state = createTestState({}, 2);

      const exprs: ValueExpr[] = [
        { kind: 'const', type: canonicalType(FLOAT), value: { kind: 'float', value: 42.0 } },
        { kind: 'extract', type: canonicalType(FLOAT), input: valueExprId(0), componentIndex: 0 },
      ];

      const result = evaluateValueExprSignal(valueExprId(1), exprs, state);
      expect(result).toBe(42.0);
    });

    it('throws for componentIndex > 0 on non-slotRead input', () => {
      const state = createTestState({}, 2);

      const exprs: ValueExpr[] = [
        { kind: 'const', type: canonicalType(FLOAT), value: { kind: 'float', value: 42.0 } },
        { kind: 'extract', type: canonicalType(FLOAT), input: valueExprId(0), componentIndex: 1 },
      ];

      expect(() => evaluateValueExprSignal(valueExprId(1), exprs, state)).toThrow(
        /extract.*on signal-extent.*not a slotRead/
      );
    });
  });
});
