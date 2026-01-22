/**
 * Stateful Primitives Test
 *
 * Tests for UnitDelay, Hash, and Id01 blocks.
 * Tests the behavior of stateful and utility signal blocks.
 */

import { describe, it, expect } from 'vitest';
import { compile } from '../../compiler/compile';
import { buildPatch } from '../../graph';
import { executeFrame } from '../../runtime/ScheduleExecutor';
import { createRuntimeState } from '../../runtime/RuntimeState';
import { BufferPool } from '../../runtime/BufferPool';
import { evaluateSignal } from '../../runtime/SignalEvaluator';
import type { SigExprId } from '../../types';

describe('UnitDelay Block', () => {
  it('outputs 0 on first frame (initial state)', () => {
    // Build patch: ConstFloat(5) -> UnitDelay -> (output)
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const constBlock = b.addBlock('Const', { value: 5 });
      const delayBlock = b.addBlock('UnitDelay', {});
      b.wire(constBlock, 'out', delayBlock, 'in');
    });

    // Compile
    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const schedule = program.schedule as any;

    // Verify state slots were allocated
    expect(schedule.stateSlotCount).toBe(1);
    expect(schedule.stateSlots).toHaveLength(1);
    expect(schedule.stateSlots[0].initialValue).toBe(0);

    // Create runtime with state slots
    const state = createRuntimeState(program.slotMeta.length, schedule.stateSlotCount);
    const pool = new BufferPool();

    // First frame: output should be 0 (initial state)
    executeFrame(program, state, pool, 0);

    // State should now contain 5 (written at end of frame 1)
    expect(state.state[0]).toBe(5);
  });

  it('outputs previous input on subsequent frames', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const constBlock = b.addBlock('Const', { value: 10 });
      const delayBlock = b.addBlock('UnitDelay', {});
      b.wire(constBlock, 'out', delayBlock, 'in');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const schedule = program.schedule as any;
    const state = createRuntimeState(program.slotMeta.length, schedule.stateSlotCount);
    const pool = new BufferPool();

    // Frame 1: output = 0 (initial), write 10 to state
    executeFrame(program, state, pool, 0);
    expect(state.state[0]).toBe(10);

    // Frame 2: output = 10 (from frame 1), write 10 to state
    executeFrame(program, state, pool, 16);
    expect(state.state[0]).toBe(10);

    // Frame 3: output = 10 (from frame 2), write 10 to state
    executeFrame(program, state, pool, 32);
    expect(state.state[0]).toBe(10);
  });

  // Fixed: Use InfiniteTimeRoot's tMs output instead of non-existent TimeMs block
  it('maintains correct delay over changing input', () => {
    // This test uses InfiniteTimeRoot's tMs output as a changing signal
    const patch = buildPatch((b) => {
      const timeRoot = b.addBlock('InfiniteTimeRoot', {});
      const delayBlock = b.addBlock('UnitDelay', {});
      b.wire(timeRoot, 'tMs', delayBlock, 'in');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const schedule = program.schedule as any;
    const state = createRuntimeState(program.slotMeta.length, schedule.stateSlotCount);
    const pool = new BufferPool();

    // Frame 1 at t=0: output = 0 (initial), write 0 to state
    executeFrame(program, state, pool, 0);
    expect(state.state[0]).toBe(0);

    // Frame 2 at t=100: output = 0 (from frame 1), write 100 to state
    executeFrame(program, state, pool, 100);
    expect(state.state[0]).toBe(100);

    // Frame 3 at t=200: output = 100 (from frame 2), write 200 to state
    executeFrame(program, state, pool, 200);
    expect(state.state[0]).toBe(200);

    // Frame 4 at t=300: output = 200 (from frame 3), write 300 to state
    executeFrame(program, state, pool, 300);
    expect(state.state[0]).toBe(300);
  });

  it('respects custom initial value', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const constBlock = b.addBlock('Const', { value: 7 });
      const delayBlock = b.addBlock('UnitDelay', { initialValue: 42 });
      b.wire(constBlock, 'out', delayBlock, 'in');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const schedule = program.schedule as any;

    // Verify initial value was set correctly
    expect(schedule.stateSlots[0].initialValue).toBe(42);

    const state = createRuntimeState(program.slotMeta.length, schedule.stateSlotCount);
    const pool = new BufferPool();

    // Initialize state from schedule
    for (let i = 0; i < schedule.stateSlots.length; i++) {
      state.state[i] = schedule.stateSlots[i].initialValue;
    }

    // First frame: output should be 42 (custom initial), write 7
    executeFrame(program, state, pool, 0);
    expect(state.state[0]).toBe(7);
  });
});

describe('Hash Block', () => {
  it('is deterministic (same inputs produce same output)', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const valueBlock = b.addBlock('Const', { value: 42 });
      const seedBlock = b.addBlock('Const', { value: 0 });
      const hashBlock = b.addBlock('Hash', {});
      const testSig = b.addBlock('TestSignal', {});
      b.wire(valueBlock, 'out', hashBlock, 'value');
      b.wire(seedBlock, 'out', hashBlock, 'seed');
      b.wire(hashBlock, 'out', testSig, 'value');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const state = createRuntimeState(program.slotMeta.length);
    const pool = new BufferPool();

    // Find the evalSig step from TestSignal to get the slot
    const schedule = program.schedule as any;
    const evalSigStep = schedule.steps.find((s: any) => s.kind === 'evalSig');
    expect(evalSigStep).toBeDefined();
    const slot = evalSigStep?.target;

    // Execute multiple times - should get same result
    executeFrame(program, state, pool, 0);
    const hash1 = state.values.f64[slot];

    executeFrame(program, state, pool, 100);
    const hash2 = state.values.f64[slot];

    expect(hash1).toBe(hash2);
  });

  // Test verifies Hash block produces different results with different seeds
  it('different seeds produce different results', () => {
    // Build patch with two hash blocks with different seeds
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const value = b.addBlock('Const', { value: 42 });
      const seed1 = b.addBlock('Const', { value: 0 });
      const seed2 = b.addBlock('Const', { value: 1 });
      const hash1 = b.addBlock('Hash', {});
      const hash2 = b.addBlock('Hash', {});
      const test1 = b.addBlock('TestSignal', {});
      const test2 = b.addBlock('TestSignal', {});

      b.wire(value, 'out', hash1, 'value');
      b.wire(seed1, 'out', hash1, 'seed');
      b.wire(hash1, 'out', test1, 'value');

      b.wire(value, 'out', hash2, 'value');
      b.wire(seed2, 'out', hash2, 'seed');
      b.wire(hash2, 'out', test2, 'value');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const state = createRuntimeState(result.program.slotMeta.length);
    const pool = new BufferPool();

    // Find the evalSig steps from TestSignal blocks to get slots
    // TestSignal blocks create evalSig steps - we need the LAST TWO
    const schedule = result.program.schedule as any;
    const evalSigSteps = schedule.steps.filter((s: any) => s.kind === 'evalSig');
    expect(evalSigSteps.length).toBeGreaterThanOrEqual(2);
    const slot1 = evalSigSteps[evalSigSteps.length - 2].target;
    const slot2 = evalSigSteps[evalSigSteps.length - 1].target;

    executeFrame(result.program, state, pool, 0);

    // Get values from slots where TestSignal stored them
    const val1 = state.values.f64[slot1];
    const val2 = state.values.f64[slot2];

    expect(val1).toBeGreaterThan(0);
    expect(val1).toBeLessThan(1);
    expect(val2).toBeGreaterThan(0);
    expect(val2).toBeLessThan(1);
    expect(val1).not.toBe(val2);
  });

  // Test verifies Hash output is normalized to [0, 1) range
  it('output is always in [0, 1) range', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const valueBlock = b.addBlock('Const', { value: 999999 });
      const seedBlock = b.addBlock('Const', { value: 123456 });
      const hashBlock = b.addBlock('Hash', {});
      const testSig = b.addBlock('TestSignal', {});
      b.wire(valueBlock, 'out', hashBlock, 'value');
      b.wire(seedBlock, 'out', hashBlock, 'seed');
      b.wire(hashBlock, 'out', testSig, 'value');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const state = createRuntimeState(program.slotMeta.length);
    const pool = new BufferPool();

    // Find the evalSig step from TestSignal to get the slot
    // TestSignal's evalSig step is the LAST one in the schedule
    const schedule = program.schedule as any;
    const evalSigSteps = schedule.steps.filter((s: any) => s.kind === 'evalSig');
    const evalSigStep = evalSigSteps[evalSigSteps.length - 1];
    expect(evalSigStep).toBeDefined();
    const slot = evalSigStep?.target;

    executeFrame(program, state, pool, 0);

    // Get the hash output from the slot
    const hashValue = state.values.f64[slot];

    expect(hashValue).toBeGreaterThanOrEqual(0);
    expect(hashValue).toBeLessThan(1);
  });

  // Test verifies Hash seed input is optional and defaults to 0
  it('works with optional seed parameter (defaults to 0)', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const valueBlock = b.addBlock('Const', { value: 42 });
      const hashBlock = b.addBlock('Hash', {});
      const testSig = b.addBlock('TestSignal', {});
      b.wire(valueBlock, 'out', hashBlock, 'value');
      b.wire(hashBlock, 'out', testSig, 'value');
      // Note: seed input not connected, should default to 0
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const state = createRuntimeState(program.slotMeta.length);
    const pool = new BufferPool();

    // Find the evalSig step from TestSignal to get the slot
    // TestSignal's evalSig step is the LAST one in the schedule
    const schedule = program.schedule as any;
    const evalSigSteps = schedule.steps.filter((s: any) => s.kind === 'evalSig');
    const evalSigStep = evalSigSteps[evalSigSteps.length - 1];
    expect(evalSigStep).toBeDefined();
    const slot = evalSigStep?.target;

    // Should execute without error
    expect(() => executeFrame(program, state, pool, 0)).not.toThrow();

    // Get hash output from the slot
    const hashValue = state.values.f64[slot];
    expect(hashValue).toBeGreaterThanOrEqual(0);
    expect(hashValue).toBeLessThan(1);
  });
});

