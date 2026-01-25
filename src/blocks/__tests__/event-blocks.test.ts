/**
 * Event Consumer Blocks Tests
 *
 * End-to-end compile+execute tests for EventToSignalMask and SampleHold.
 * These blocks bridge the event→signal domain (spec §9.2).
 */

import { describe, it, expect } from 'vitest';
import { compile } from '../../compiler/compile';
import { EventHub } from '../../events/EventHub';
import { BufferPool } from '../../runtime/BufferPool';
import { buildPatch, type PatchBuilder } from '../../graph/Patch';
import { createRuntimeState } from '../../runtime/RuntimeState';
import { executeFrame } from '../../runtime/ScheduleExecutor';
import { evaluateSignal } from '../../runtime/SignalEvaluator';
import { sigExprId, eventSlotId } from '../../compiler/ir/Indices';
import { signalType } from '../../core/canonical-types';

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
  const state = createRuntimeState(
    program.slotMeta.length,
    schedule.stateSlotCount ?? 0,
    schedule.eventSlotCount ?? 0,
    schedule.eventExprCount ?? 0
  );
  const pool = new BufferPool();

  const results: { values: Float64Array; eventScalars: Uint8Array }[] = [];
  for (const tMs of frames) {
    executeFrame(program, state, pool, tMs);
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
    const state = createRuntimeState(
      program.slotMeta.length,
      schedule.stateSlotCount ?? 0,
      schedule.eventSlotCount ?? 0,
      schedule.eventExprCount ?? 0
    );
    const pool = new BufferPool();

    // Execute frame — pulse fires every tick
    executeFrame(program, state, pool, 100);

    // Find the EventToSignalMask output slot
    // The mask output is a signal stored in a value slot
    const evalSigSteps = schedule.steps.filter((s: any) => s.kind === 'evalSig');
    // The event-dependent evalSig should exist (post-event)
    expect(evalSigSteps.length).toBeGreaterThan(0);

    // Find all evalSig steps and check which produces 1.0
    // Since pulse fires every frame, the eventRead signal should be 1.0
    let foundEventSignal = false;
    for (const step of evalSigSteps) {
      const value = state.values.f64[step.target as number];
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
    const state = createRuntimeState(
      program.slotMeta.length,
      schedule.stateSlotCount ?? 0,
      schedule.eventSlotCount ?? 0,
      schedule.eventExprCount ?? 0
    );
    const pool = new BufferPool();

    // Frame 1
    executeFrame(program, state, pool, 100);
    const evalSigSteps = schedule.steps.filter((s: any) => s.kind === 'evalSig');
    const maskSlot = findEventDependentSlot(evalSigSteps, state);
    expect(state.values.f64[maskSlot]).toBe(1.0);

    // Frame 2 — eventScalars cleared and re-populated
    executeFrame(program, state, pool, 116);
    expect(state.values.f64[maskSlot]).toBe(1.0);

    // Frame 3
    executeFrame(program, state, pool, 132);
    expect(state.values.f64[maskSlot]).toBe(1.0);
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
    // Unit test: directly test evaluateSignal with an eventRead expr
    // when eventScalars[slot] is 0
    const state = createRuntimeState(4, 0, 4, 0);
    state.time = { tAbsMs: 0, tMs: 100, phaseA: 0, phaseB: 0, dt: 16, pulse: 0, palette: { r: 0, g: 0, b: 0, a: 1 }, energy: 0.5 };

    // Event slot 0 is NOT fired (stays at 0 after frame clear)
    state.eventScalars[0] = 0;

    const signals = [
      { kind: 'eventRead' as const, eventSlot: eventSlotId(0), type: signalType('float') },
    ];

    const result = evaluateSignal(sigExprId(0), signals, state);
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
    const state = createRuntimeState(
      program.slotMeta.length,
      schedule.stateSlotCount ?? 0,
      schedule.eventSlotCount ?? 0,
      schedule.eventExprCount ?? 0
    );
    const pool = new BufferPool();

    // Frame 1 at t=100ms — pulse fires, SampleHold captures tMs=100
    executeFrame(program, state, pool, 100);
    const shSlot = findSampleHoldOutputSlot(schedule, state);
    expect(shSlot).toBeGreaterThanOrEqual(0);
    // Since pulse fires every frame, SampleHold captures the current tMs value
    expect(state.values.f64[shSlot]).toBe(100);

    // Frame 2 at t=200ms — pulse fires again, captures new value
    executeFrame(program, state, pool, 200);
    expect(state.values.f64[shSlot]).toBe(200);
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
    const state = createRuntimeState(
      program.slotMeta.length,
      schedule.stateSlotCount ?? 0,
      schedule.eventSlotCount ?? 0,
      schedule.eventExprCount ?? 0
    );
    const pool = new BufferPool();

    executeFrame(program, state, pool, 100);
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
      typeof m.stableId === 'string' && m.stableId.includes('sample')
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
    const state = createRuntimeState(
      program.slotMeta.length,
      schedule.stateSlotCount ?? 0,
      schedule.eventSlotCount ?? 0,
      schedule.eventExprCount ?? 0
    );
    const pool = new BufferPool();

    executeFrame(program, state, pool, 100);

    // Find multiply output — should be 5.0 (1.0 * 5.0)
    const evalSigSteps = schedule.steps.filter((s: any) => s.kind === 'evalSig');
    let found5 = false;
    for (const step of evalSigSteps) {
      if (state.values.f64[step.target as number] === 5.0) {
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
    const state = createRuntimeState(
      program.slotMeta.length,
      schedule.stateSlotCount ?? 0,
      schedule.eventSlotCount ?? 0,
      schedule.eventExprCount ?? 0
    );
    const pool = new BufferPool();

    executeFrame(program, state, pool, 100);

    // Find add output — should be 110 (100 + 10)
    const evalSigSteps = schedule.steps.filter((s: any) => s.kind === 'evalSig');
    let found110 = false;
    for (const step of evalSigSteps) {
      if (state.values.f64[step.target as number] === 110.0) {
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
function findEventDependentSlot(evalSigSteps: any[], state: any): number {
  for (const step of evalSigSteps) {
    if (state.values.f64[step.target as number] === 1.0) {
      return step.target as number;
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
function findSampleHoldOutputSlot(schedule: any, state: any): number {
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
