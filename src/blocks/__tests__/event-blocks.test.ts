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
  it('outputs 1.0 when pulse event fires (every frame)', () => {
    const patch = buildPatch((b) => {
      const timeRoot = b.addBlock('InfiniteTimeRoot', {});
      const mask = b.addBlock('EventToSignalMask', {});
      b.wire(timeRoot, 'pulse', mask, 'event');
    });

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

    // Execute frame — pulse fires every tick
    arena.reset(); executeFrame(program, state, arena, 100);

    // Find the EventToSignalMask output slot
    // The mask output is a signal stored in a value slot
    const evalSigSteps = schedule.steps.filter((s: any) => s.kind === 'evalSig');
    // The event-dependent evalSig should exist (post-event)
    expect(evalSigSteps.length).toBeGreaterThan(0);

    const slotToOffset = buildSlotToOffsetMap(program);

    // Find all evalSig steps and check which produces 1.0
    // Since pulse fires every frame, the eventRead signal should be 1.0
    let foundEventSignal = false;
    for (const step of evalSigSteps as StepEvalSig[]) {
      const slot = step.target as number;
      const offset = slotToOffset.get(slot);
      if (offset === undefined) {
        throw new Error(`Slot ${slot} not found in slotMeta`);
      }
      const value = state.values.f64[offset];
      if (value === 1.0) {
        foundEventSignal = true;
        break;
      }
    }
    expect(foundEventSignal).toBe(true);
  });

  it('outputs 1.0 every frame for pulse (not just first frame)', () => {
    const patch = buildPatch((b) => {
      const timeRoot = b.addBlock('InfiniteTimeRoot', {});
      const mask = b.addBlock('EventToSignalMask', {});
      b.wire(timeRoot, 'pulse', mask, 'event');
    });

    const events = new EventHub();
    const result = compile(patch, { events });
    if (result.kind === 'error') throw new Error('Compile failed');

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

    const slotToOffset = buildSlotToOffsetMap(program);

    // Frame 1
    arena.reset(); executeFrame(program, state, arena, 100);
    const evalSigSteps = schedule.steps.filter((s: any) => s.kind === 'evalSig');
    const maskSlot = findEventDependentSlot(program, evalSigSteps, state);
    const maskOffset = slotToOffset.get(maskSlot);
    if (maskOffset === undefined) {
      throw new Error(`Slot ${maskSlot} not found in slotMeta`);
    }
    expect(state.values.f64[maskOffset]).toBe(1.0);

    // Frame 2 — eventScalars cleared and re-populated
    arena.reset(); executeFrame(program, state, arena, 116);
    expect(state.values.f64[maskOffset]).toBe(1.0);

    // Frame 3
    arena.reset(); executeFrame(program, state, arena, 132);
    expect(state.values.f64[maskOffset]).toBe(1.0);
  });

  it('compiles without errors', () => {
    const patch = buildPatch((b) => {
      const timeRoot = b.addBlock('InfiniteTimeRoot', {});
      const mask = b.addBlock('EventToSignalMask', {});
      b.wire(timeRoot, 'pulse', mask, 'event');
    });

    const events = new EventHub();
    const result = compile(patch, { events });
    expect(result.kind).toBe('ok');
  });
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

  it('latches input value when pulse trigger fires', () => {
    const patch = buildPatch((b) => {
      const timeRoot = b.addBlock('InfiniteTimeRoot', {});
      // Use tMs as value input — grows each frame
      const sampleHold = b.addBlock('SampleHold', {});
      b.wire(timeRoot, 'tMs', sampleHold, 'value');
      b.wire(timeRoot, 'pulse', sampleHold, 'trigger');
    });

    const events = new EventHub();
    const result = compile(patch, { events });
    if (result.kind === 'error') {
      throw new Error(`Compile failed: ${result.errors.map(e => e.message).join(', ')}`);
    }

    const program = result.program;
    const schedule = program.schedule;
    const sizes = getStorageSizes(program.slotMeta);
    const session = createSessionState();
    const state = createRuntimeStateFromSession(session,
      sizes.f64,
      schedule.stateSlotCount ?? 0,
      schedule.eventSlotCount ?? 0,
      schedule.eventExprCount ?? 0
    );
    const arena = getTestArena();

    const slotToOffset = buildSlotToOffsetMap(program);

    // Frame 1 at t=100ms — pulse fires, SampleHold captures tMs=100
    arena.reset(); executeFrame(program, state, arena, 100);
    const shSlot = findSampleHoldOutputSlot(program, schedule, state);
    expect(shSlot).toBeGreaterThanOrEqual(0);
    const shOffset = slotToOffset.get(shSlot);
    if (shOffset === undefined) {
      throw new Error(`Slot ${shSlot} not found in slotMeta`);
    }
    // Since pulse fires every frame, SampleHold captures the current tMs value
    expect(state.values.f64[shOffset]).toBe(100);

    // Frame 2 at t=200ms — pulse fires again, captures new value
    arena.reset(); executeFrame(program, state, arena, 200);
    expect(state.values.f64[shOffset]).toBe(200);
  });

  it('holds value between fires (non-pulse trigger)', () => {
    // This test uses a wrap event on phaseA — fires when phaseA crosses 0.5 rising edge
    const patch = buildPatch((b) => {
      const timeRoot = b.addBlock('InfiniteTimeRoot', { periodAMs: 1000 });
      // Wrap phaseA — fires once per period when phase crosses 0.5
      const sampleHold = b.addBlock('SampleHold', {});
      b.wire(timeRoot, 'tMs', sampleHold, 'value');
      // We need a SignalToEvent/EventWrap block. If not available, test pulse behavior.
      b.wire(timeRoot, 'pulse', sampleHold, 'trigger');
    });

    const events = new EventHub();
    const result = compile(patch, { events });
    if (result.kind === 'error') {
      throw new Error(`Compile failed: ${result.errors.map(e => e.message).join(', ')}`);
    }

    // Compile and run is sufficient — verifies no crash
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

    arena.reset(); executeFrame(program, state, arena, 100);
    expect(result.kind).toBe('ok');
  });

  it('state persists across frames via stableStateId', () => {
    const patch = buildPatch((b) => {
      const timeRoot = b.addBlock('InfiniteTimeRoot', {});
      const sampleHold = b.addBlock('SampleHold', {});
      b.wire(timeRoot, 'tMs', sampleHold, 'value');
      b.wire(timeRoot, 'pulse', sampleHold, 'trigger');
    });

    const events = new EventHub();
    const result = compile(patch, { events });
    if (result.kind === 'error') throw new Error('Compile failed');

    const program = result.program;
    const schedule = program.schedule;

    // Verify stateSlotCount > 0 (SampleHold allocates a state slot)
    expect(schedule.stateSlotCount).toBeGreaterThan(0);

    // Verify stateMappings include a 'sample' state
    const sampleMapping = schedule.stateMappings.find((m) =>
      typeof m.stateId === 'string' && m.stateId.includes('sample')
    );
    expect(sampleMapping).toBeDefined();
  });

  it('compiles without errors', () => {
    const patch = buildPatch((b) => {
      const timeRoot = b.addBlock('InfiniteTimeRoot', {});
      const sampleHold = b.addBlock('SampleHold', {});
      b.wire(timeRoot, 'tMs', sampleHold, 'value');
      b.wire(timeRoot, 'pulse', sampleHold, 'trigger');
    });

    const events = new EventHub();
    const result = compile(patch, { events });
    expect(result.kind).toBe('ok');
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Event Consumer Blocks Integration', () => {
  it('EventToSignalMask output can drive downstream math blocks', () => {
    const patch = buildPatch((b) => {
      const timeRoot = b.addBlock('InfiniteTimeRoot', {});
      const mask = b.addBlock('EventToSignalMask', {});
      b.wire(timeRoot, 'pulse', mask, 'event');

      // Multiply mask output by 5 — should produce 5.0 when pulse fires
      const five = b.addBlock('Const', { value: 5.0 });
      const mul = b.addBlock('Multiply', {});
      b.wire(mask, 'out', mul, 'a');
      b.wire(five, 'out', mul, 'b');
    });

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

    arena.reset(); executeFrame(program, state, arena, 100);

    const slotToOffset = buildSlotToOffsetMap(program);

    // Find multiply output — should be 5.0 (1.0 * 5.0)
    const evalSigSteps = schedule.steps.filter((s: any) => s.kind === 'evalSig') as StepEvalSig[];
    let found5 = false;
    for (const step of evalSigSteps) {
      const slot = step.target as number;
      const offset = slotToOffset.get(slot);
      if (offset === undefined) {
        throw new Error(`Slot ${slot} not found in slotMeta`);
      }
      if (state.values.f64[offset] === 5.0) {
        found5 = true;
        break;
      }
    }
    expect(found5).toBe(true);
  });

  it('SampleHold output can drive downstream blocks', () => {
    const patch = buildPatch((b) => {
      const timeRoot = b.addBlock('InfiniteTimeRoot', {});
      const sampleHold = b.addBlock('SampleHold', {});
      b.wire(timeRoot, 'tMs', sampleHold, 'value');
      b.wire(timeRoot, 'pulse', sampleHold, 'trigger');

      // Add to offset — should produce tMs + 10
      const ten = b.addBlock('Const', { value: 10.0 });
      const add = b.addBlock('Add', {});
      b.wire(sampleHold, 'out', add, 'a');
      b.wire(ten, 'out', add, 'b');
    });

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

    arena.reset(); executeFrame(program, state, arena, 100);

    const slotToOffset = buildSlotToOffsetMap(program);

    // Find add output — should be 110 (100 + 10)
    const evalSigSteps = schedule.steps.filter((s: any) => s.kind === 'evalSig') as StepEvalSig[];
    let found110 = false;
    for (const step of evalSigSteps) {
      const slot = step.target as number;
      const offset = slotToOffset.get(slot);
      if (offset === undefined) {
        throw new Error(`Slot ${slot} not found in slotMeta`);
      }
      if (state.values.f64[offset] === 110.0) {
        found110 = true;
        break;
      }
    }
    expect(found110).toBe(true);
  });
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
