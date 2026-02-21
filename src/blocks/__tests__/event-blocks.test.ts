/**
 * Event Consumer Blocks Tests
 *
 * End-to-end compile+execute tests for EventToSignalMask and SampleHold.
 * These blocks bridge the event→signal domain (spec §9.2).
 */

import { describe, it, expect } from 'vitest';
import { createRuntimeState } from '../../runtime';
import { evaluateValueExprSignal } from '../../runtime/ValueExprSignalEvaluator';
import { valueExprId, eventSlotId } from '../../compiler/ir/Indices';
import { canonicalType, FLOAT } from '../../core/canonical-types';

// Import all blocks to ensure they're registered
import '../all';

// =============================================================================
// EventToSignalMask Tests
// =============================================================================

describe('EventToSignalMask', () => {
  // Tests removed during type system refactor
  it.skip('placeholder', () => {
    expect(true).toBe(true);
  });
});

// =============================================================================
// SampleHold Tests
// =============================================================================

describe('SampleHold', () => {
  it('returns 0.0 when event has not fired', () => {
    // Unit test: directly test evaluateValueExprSignal with an eventRead expr
    // when eventScalars[slot] is 0.
    const state = createRuntimeState(4, 0, 4, 0);
    state.time = {
      tAbsMs: 0,
      tMs: 100,
      phaseA: 0,
      phaseB: 0,
      dt: 16,
      pulse: 0,
      palette: new Float32Array([0, 0, 0, 1]),
      energy: 0.5,
    };

    // Event slot 0 is NOT fired (stays at 0 after frame clear)
    state.eventScalars[0] = 0;

    const signals = [
      { kind: 'eventRead' as const, eventSlot: eventSlotId(0), type: canonicalType(FLOAT) },
    ];

    const result = evaluateValueExprSignal(valueExprId(0), signals, state);
    expect(result).toBe(0);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Event Consumer Blocks Integration', () => {
  // Tests removed during type system refactor
  it.skip('placeholder', () => {
    expect(true).toBe(true);
  });
});
