/**
 * Event Consumer Blocks Tests
 *
 * End-to-end compile+execute tests for EventToSignalMask and SampleHold.
 * These blocks bridge the event→signal domain (spec §9.2).
 */

import { describe, it, expect } from 'vitest';
import { compile } from '../../compiler/compile';
import { EventHub } from '../../events/EventHub';
import { getTestArena } from '../../runtime/__tests__/test-arena-helper';
import { buildPatch, type PatchBuilder } from '../../graph/Patch';
import { createSessionState, createProgramState, createRuntimeState, createRuntimeStateFromSession } from '../../runtime';
import { executeFrame } from '../../runtime/ScheduleExecutor';
import { evaluateValueExprSignal } from '../../runtime/ValueExprSignalEvaluator';
import { sigExprId, eventSlotId } from '../../compiler/ir/Indices';
import type { StepEvalSig, ValueSlot } from '../../compiler/ir/types';
import type { CompiledProgramIR, computeStorageSizes } from '../../compiler/ir/program';
import { computeStorageSizes as getStorageSizes } from '../../compiler/ir/program';
import { canonicalType } from '../../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR,  CAMERA_PROJECTION } from '../../core/canonical-types';

/**
 * Build a slot->offset map from slotMeta.
 */
function buildSlotToOffsetMap(program: CompiledProgramIR): Map<number, number> {
  const map = new Map<number, number>();
  for (const meta of program.slotMeta) {
    map.set(meta.slot as number, meta.offset);
  }
  return map;
}

// Import block registrations
import '../signal-blocks';
import '../math-blocks';
import '../time-blocks';
import '../event-blocks';

// =============================================================================
// Test Helpers
// =============================================================================

function compileAndRun(patchFn: (b: PatchBuilder) => void, frames: number[] = [100]) {
  const patch = buildPatch(patchFn);
  const events = new EventHub();
  const result = compile(patch, { events });

  if (result.kind === 'error') {
    throw new Error(`Compile failed: ${result.errors.map(e => e.message).join(', ')}`);
  }

  const program = result.program;
  const schedule = program.schedule;
  const sizes = getStorageSizes(program.slotMeta);
  const state = createRuntimeState(
    sizes.f64,
    schedule.stateSlotCount ?? 0,
    schedule.eventSlotCount ?? 0,
    schedule.eventExprCount ?? 0
  );
  const arena = getTestArena();

  const results: { values: Float64Array; eventScalars: Uint8Array }[] = [];
  for (const tMs of frames) {
    arena.reset(); executeFrame(program, state, arena, tMs);
    results.push({
      values: state.values.f64.slice(),
      eventScalars: state.eventScalars.slice(),
    });
  }

  return { program, state, results, schedule };
}

function getSignalValue(state: { values: { f64: Float64Array } }, slotIndex: number): number {
  return state.values.f64[slotIndex];
}

// =============================================================================
// EventToSignalMask Tests
// =============================================================================

describe('EventToSignalMask', () => {
});

// =============================================================================
// SampleHold Tests
// =============================================================================

describe('SampleHold', () => {
  it('sigEventRead returns 0.0 when event has not fired', () => {
    // Unit test: directly test evaluateValueExprSignal with an eventRead expr
    // when eventScalars[slot] is 0
    const state = createRuntimeState(4, 0, 4, 0);
    state.time = { tAbsMs: 0, tMs: 100, phaseA: 0, phaseB: 0, dt: 16, pulse: 0, palette: new Float32Array([0, 0, 0, 1]), energy: 0.5 };

    // Event slot 0 is NOT fired (stays at 0 after frame clear)
    state.eventScalars[0] = 0;

    const signals = [
      { kind: 'eventRead' as const, eventSlot: eventSlotId(0), type: canonicalType(FLOAT) },
    ];

    const result = evaluateValueExprSignal(sigExprId(0), signals, state);
    expect(result).toBe(0);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Event Consumer Blocks Integration', () => {
});

// =============================================================================
// Helpers
// =============================================================================

/**
 * Find the slot that contains an event-dependent signal value.
 * Returns the slot index of the first signal with value > 0.
 */
function findEventDependentSlot(program: CompiledProgramIR, evalSigSteps: any[], state: any): number {
  const slotToOffset = buildSlotToOffsetMap(program);
  for (const step of evalSigSteps) {
    const slot = step.target as number;
    const offset = slotToOffset.get(slot);
    if (offset === undefined) {
      throw new Error(`Slot ${slot} not found in slotMeta`);
    }
    if (state.values.f64[offset] === 1.0) {
      return slot;
    }
  }
  // Fallback: return last evalSig slot
  if (evalSigSteps.length > 0) {
    return evalSigSteps[evalSigSteps.length - 1].target as number;
  }
  return -1;
}

/**
 * Find the SampleHold output slot.
 * SampleHold's output is the zip(lerp) expression which depends on eventRead.
 */
function findSampleHoldOutputSlot(program: CompiledProgramIR, schedule: any, state: any): number {
  // Find evalSig steps that are after evalEvent steps (post-event signals)
  let afterEvent = false;
  for (const step of schedule.steps) {
    if (step.kind === 'evalEvent') {
      afterEvent = true;
      continue;
    }
    if (afterEvent && step.kind === 'evalSig') {
      return step.target as number;
    }
  }
  return -1;
}
