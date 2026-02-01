/**
 * Phase Continuity Offset Reconciliation Tests
 *
 * Tests for reconcilePhaseOffsets() - ensures phase remains continuous
 * when TimeRoot period parameters change during hot-swap.
 */

import { describe, it, expect } from 'vitest';
import { reconcilePhaseOffsets, createTimeState, wrapPhase } from '../timeResolution';
import type { TimeModel } from '../../compiler/ir/types';

describe('reconcilePhaseOffsets', () => {
  it('no-op when periods unchanged', () => {
    const timeState = createTimeState();
    timeState.offsetA = 0.25;
    timeState.offsetB = 0.5;

    const oldTimeModel: TimeModel = { kind: 'infinite', periodAMs: 4000, periodBMs: 8000 };
    const newTimeModel: TimeModel = { kind: 'infinite', periodAMs: 4000, periodBMs: 8000 };
    const monotonicTMs = 2000;

    reconcilePhaseOffsets(oldTimeModel, newTimeModel, monotonicTMs, timeState);

    // Offsets should remain unchanged when periods don't change
    expect(timeState.offsetA).toBe(0.25);
    expect(timeState.offsetB).toBe(0.5);
  });

  it('phase preserved when period doubles', () => {
    const timeState = createTimeState();
    timeState.offsetA = 0;
    timeState.offsetB = 0;

    // At t=2000ms with period=4000ms, raw phase = 2000/4000 = 0.5
    // Effective phase (with offset=0) = 0.5
    const monotonicTMs = 2000;
    const oldTimeModel: TimeModel = { kind: 'infinite', periodAMs: 4000, periodBMs: 8000 };
    const newTimeModel: TimeModel = { kind: 'infinite', periodAMs: 8000, periodBMs: 8000 };

    reconcilePhaseOffsets(oldTimeModel, newTimeModel, monotonicTMs, timeState);

    // New raw phase would be 2000/8000 = 0.25
    // To preserve effective phase = 0.5, offset must be adjusted to +0.25
    const newRaw = (monotonicTMs / 8000) % 1.0;
    const newEffective = wrapPhase(newRaw + timeState.offsetA);

    expect(newEffective).toBeCloseTo(0.5, 10);
  });

  it('phase preserved when period halves', () => {
    const timeState = createTimeState();
    timeState.offsetA = 0;
    timeState.offsetB = 0;

    // At t=4000ms with period=8000ms, raw phase = 4000/8000 = 0.5
    // Effective phase (with offset=0) = 0.5
    const monotonicTMs = 4000;
    const oldTimeModel: TimeModel = { kind: 'infinite', periodAMs: 8000, periodBMs: 8000 };
    const newTimeModel: TimeModel = { kind: 'infinite', periodAMs: 4000, periodBMs: 8000 };

    reconcilePhaseOffsets(oldTimeModel, newTimeModel, monotonicTMs, timeState);

    // New raw phase would be 4000/4000 % 1.0 = 0.0 (wraps)
    // To preserve effective phase = 0.5, offset must be adjusted to +0.5
    const newRaw = (monotonicTMs / 4000) % 1.0;
    const newEffective = wrapPhase(newRaw + timeState.offsetA);

    expect(newEffective).toBeCloseTo(0.5, 10);
  });

  it('existing offset respected and adjusted', () => {
    const timeState = createTimeState();
    // Start with a non-zero offset
    timeState.offsetA = 0.3;
    timeState.offsetB = 0;

    // At t=2000ms with period=4000ms, raw phase = 0.5
    // Old effective phase = wrap(0.5 + 0.3) = 0.8
    const monotonicTMs = 2000;
    const oldTimeModel: TimeModel = { kind: 'infinite', periodAMs: 4000, periodBMs: 8000 };
    const newTimeModel: TimeModel = { kind: 'infinite', periodAMs: 2000, periodBMs: 8000 };

    // Calculate expected old effective phase
    const oldRaw = (monotonicTMs / 4000) % 1.0;
    const oldEffective = wrapPhase(oldRaw + 0.3);
    expect(oldEffective).toBeCloseTo(0.8, 10);

    reconcilePhaseOffsets(oldTimeModel, newTimeModel, monotonicTMs, timeState);

    // New raw phase would be 2000/2000 % 1.0 = 0.0 (wraps)
    // New effective phase should still be 0.8
    const newRaw = (monotonicTMs / 2000) % 1.0;
    const newEffective = wrapPhase(newRaw + timeState.offsetA);

    expect(newEffective).toBeCloseTo(oldEffective, 10);
  });

  it('zero period handled gracefully (old)', () => {
    const timeState = createTimeState();
    timeState.offsetA = 0.1;
    timeState.offsetB = 0;

    const monotonicTMs = 2000;
    const oldTimeModel: TimeModel = { kind: 'infinite', periodAMs: 0, periodBMs: 8000 };
    const newTimeModel: TimeModel = { kind: 'infinite', periodAMs: 4000, periodBMs: 8000 };

    // Should not crash with oldPeriod=0
    expect(() => {
      reconcilePhaseOffsets(oldTimeModel, newTimeModel, monotonicTMs, timeState);
    }).not.toThrow();

    // Offset should remain unchanged (no reconciliation happens)
    expect(timeState.offsetA).toBe(0.1);
  });

  it('zero period handled gracefully (new)', () => {
    const timeState = createTimeState();
    timeState.offsetA = 0.1;
    timeState.offsetB = 0;

    const monotonicTMs = 2000;
    const oldTimeModel: TimeModel = { kind: 'infinite', periodAMs: 4000, periodBMs: 8000 };
    const newTimeModel: TimeModel = { kind: 'infinite', periodAMs: 0, periodBMs: 8000 };

    // Should not crash with newPeriod=0
    expect(() => {
      reconcilePhaseOffsets(oldTimeModel, newTimeModel, monotonicTMs, timeState);
    }).not.toThrow();

    // Offset should remain unchanged (no reconciliation happens)
    expect(timeState.offsetA).toBe(0.1);
  });

  it('both phases reconciled independently', () => {
    const timeState = createTimeState();
    timeState.offsetA = 0;
    timeState.offsetB = 0;

    // At t=4000ms:
    // - Phase A: 4000/4000 = 0.0 (wraps) -> effective 0.0
    // - Phase B: 4000/8000 = 0.5 -> effective 0.5
    const monotonicTMs = 4000;
    const oldTimeModel: TimeModel = { kind: 'infinite', periodAMs: 4000, periodBMs: 8000 };
    const newTimeModel: TimeModel = { kind: 'infinite', periodAMs: 2000, periodBMs: 4000 };

    // Calculate old effective phases
    const oldRawA = (monotonicTMs / 4000) % 1.0;
    const oldEffectiveA = wrapPhase(oldRawA);
    const oldRawB = (monotonicTMs / 8000) % 1.0;
    const oldEffectiveB = wrapPhase(oldRawB);

    reconcilePhaseOffsets(oldTimeModel, newTimeModel, monotonicTMs, timeState);

    // Verify both phases preserved independently
    const newRawA = (monotonicTMs / 2000) % 1.0;
    const newEffectiveA = wrapPhase(newRawA + timeState.offsetA);
    const newRawB = (monotonicTMs / 4000) % 1.0;
    const newEffectiveB = wrapPhase(newRawB + timeState.offsetB);

    expect(newEffectiveA).toBeCloseTo(oldEffectiveA, 10);
    expect(newEffectiveB).toBeCloseTo(oldEffectiveB, 10);
  });

  it('phase continuity across wrap boundary', () => {
    const timeState = createTimeState();
    timeState.offsetA = 0;
    timeState.offsetB = 0;

    // At t=3500ms with period=4000ms, raw phase = 0.875
    // This is near the wrap boundary
    const monotonicTMs = 3500;
    const oldTimeModel: TimeModel = { kind: 'infinite', periodAMs: 4000, periodBMs: 8000 };
    const newTimeModel: TimeModel = { kind: 'infinite', periodAMs: 5000, periodBMs: 8000 };

    const oldRaw = (monotonicTMs / 4000) % 1.0;
    const oldEffective = wrapPhase(oldRaw);
    expect(oldEffective).toBeCloseTo(0.875, 10);

    reconcilePhaseOffsets(oldTimeModel, newTimeModel, monotonicTMs, timeState);

    // New raw phase = 3500/5000 = 0.7
    // Offset should adjust to preserve 0.875
    const newRaw = (monotonicTMs / 5000) % 1.0;
    const newEffective = wrapPhase(newRaw + timeState.offsetA);

    expect(newEffective).toBeCloseTo(oldEffective, 10);
  });

  it('works with accumulated offsets from multiple changes', () => {
    const timeState = createTimeState();
    timeState.offsetA = 0;
    timeState.offsetB = 0;

    const monotonicTMs = 2000;

    // First change: 4000 -> 8000
    const model1: TimeModel = { kind: 'infinite', periodAMs: 4000, periodBMs: 8000 };
    const model2: TimeModel = { kind: 'infinite', periodAMs: 8000, periodBMs: 8000 };
    reconcilePhaseOffsets(model1, model2, monotonicTMs, timeState);
    const phase1 = wrapPhase((monotonicTMs / 8000) % 1.0 + timeState.offsetA);

    // Second change: 8000 -> 2000
    const model3: TimeModel = { kind: 'infinite', periodAMs: 2000, periodBMs: 8000 };
    reconcilePhaseOffsets(model2, model3, monotonicTMs, timeState);
    const phase2 = wrapPhase((monotonicTMs / 2000) % 1.0 + timeState.offsetA);

    // After multiple changes, phase should still be continuous
    // (may not match original due to floating point, but should be close)
    expect(phase2).toBeCloseTo(phase1, 10);
  });
});
