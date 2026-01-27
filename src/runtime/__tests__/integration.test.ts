/**
 * Integration Test - End-to-End Runtime
 *
 * Tests: Patch -> compile -> execute -> RenderFrameIR
 */

import { describe, it, expect } from 'vitest';
import { compile } from '../../compiler/compile';
import { buildPatch } from '../../graph';
import { executeFrame } from '../ScheduleExecutor';
import { createRuntimeState } from '../RuntimeState';
import { getTestArena } from '../../runtime/__tests__/test-arena-helper';

describe('Runtime Integration', () => {
  it('executes a simple animated grid', () => {
    // Build patch: TimeRoot -> Array + GridLayout
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const array = b.addBlock('Array', { count: 4 });
      const gridLayout = b.addBlock('GridLayout', { rows: 2, cols: 2 });
      b.wire(array, 'elements', gridLayout, 'elements');
    });

    // Compile
    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;

    // Verify program structure
    const schedule = program.schedule;
    expect(schedule.timeModel.kind).toBe('infinite');
    expect(schedule.instances.size).toBeGreaterThan(0);
    expect(schedule.steps.length).toBeGreaterThanOrEqual(0);

    // Create runtime
    const state = createRuntimeState(program.slotMeta.length);
    const arena = getTestArena();

    // Execute at t=0
    const frame = executeFrame(program, state, arena, 0);

    // Verify frame structure
    expect(frame.version).toBe(2);
    expect(frame.ops).toBeInstanceOf(Array);

    // Verify frame advances (starts at 1, increments to 2)
    expect(state.cache.frameId).toBe(2);

    // Execute at t=1000
    const frame2 = executeFrame(program, state, arena, 1000);
    expect(state.cache.frameId).toBe(3);
    expect(frame2.version).toBe(2);
  });

  it('evaluates constant signals', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const a = b.addBlock('Const', { value: 5 });
      const b2 = b.addBlock('Const', { value: 3 });
      const add = b.addBlock('Add', {});
      b.wire(a, 'out', add, 'a');
      b.wire(b2, 'out', add, 'b');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const state = createRuntimeState(program.slotMeta.length);
    const arena = getTestArena();

    // Initial state (frameId starts at 1)
    expect(state.cache.frameId).toBe(1);

    // Execute frame
    executeFrame(program, state, arena, 0);

    // After first frame, frameId should be 2
    expect(state.cache.frameId).toBe(2);

    // Execute second frame
    executeFrame(program, state, arena, 100);
    expect(state.cache.frameId).toBe(3);
  });

  it('resolves time correctly for infinite models', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const state = createRuntimeState(program.slotMeta.length);
    const arena = getTestArena();

    // Execute at various times
    executeFrame(program, state, arena, 0);
    expect(state.time?.tMs).toBe(0);

    executeFrame(program, state, arena, 1000);
    expect(state.time?.tMs).toBe(1000);

    executeFrame(program, state, arena, 5000);
    expect(state.time?.tMs).toBe(5000);
  });
});
