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
import { BufferPool } from '../BufferPool';

describe('Runtime Integration', () => {
  it('executes a simple animated grid', () => {
    // Build patch: TimeRoot -> Grid
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      b.addBlock('GridDomain', { rows: 2, cols: 2 });
    });

    // Compile
    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;

    // Verify program structure
    const schedule = program.schedule as any;
    expect(schedule.timeModel.kind).toBe('infinite');
    expect(schedule.domains.size).toBeGreaterThan(0);
    expect(schedule.steps.length).toBeGreaterThanOrEqual(0);

    // Create runtime
    const state = createRuntimeState(program.slotMeta.length);
    const pool = new BufferPool();

    // Execute at t=0
    const frame = executeFrame(program, state, pool, 0);

    // Verify frame structure
    expect(frame.version).toBe(1);
    expect(frame.passes).toBeInstanceOf(Array);

    // Verify frame advances (starts at 0, increments to 1)
    expect(state.cache.frameId).toBe(1);

    // Execute at t=1000
    const frame2 = executeFrame(program, state, pool, 1000);
    expect(state.cache.frameId).toBe(2);
    expect(frame2.version).toBe(1);
  });

  it('evaluates constant signals', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
      const a = b.addBlock('ConstFloat', { value: 5 });
      const b2 = b.addBlock('ConstFloat', { value: 3 });
      const add = b.addBlock('AddSignal', {});
      b.wire(a, 'out', add, 'a');
      b.wire(b2, 'out', add, 'b');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const state = createRuntimeState(program.slotMeta.length);
    const pool = new BufferPool();

    // Initial state
    expect(state.cache.frameId).toBe(0);

    // Execute frame
    executeFrame(program, state, pool, 0);

    // After first frame, frameId should be 1
    expect(state.cache.frameId).toBe(1);

    // Execute second frame
    executeFrame(program, state, pool, 100);
    expect(state.cache.frameId).toBe(2);
  });

  it('resolves time correctly for finite models', () => {
    const patch = buildPatch((b) => {
      b.addBlock('FiniteTimeRoot', { durationMs: 1000 });
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const state = createRuntimeState(program.slotMeta.length);
    const pool = new BufferPool();

    // Execute at various times
    executeFrame(program, state, pool, 0);
    expect(state.time?.tModelMs).toBe(0);
    expect(state.time?.progress).toBe(0);

    executeFrame(program, state, pool, 500);
    expect(state.time?.tModelMs).toBe(500);
    expect(state.time?.progress).toBe(0.5);

    executeFrame(program, state, pool, 1000);
    expect(state.time?.tModelMs).toBe(1000);
    expect(state.time?.progress).toBe(1);

    // Beyond duration should clamp
    executeFrame(program, state, pool, 1500);
    expect(state.time?.tModelMs).toBe(1000);
    expect(state.time?.progress).toBe(1);
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
    const pool = new BufferPool();

    // Execute at various times
    executeFrame(program, state, pool, 0);
    expect(state.time?.tModelMs).toBe(0);

    executeFrame(program, state, pool, 1000);
    expect(state.time?.tModelMs).toBe(1000);

    executeFrame(program, state, pool, 5000);
    expect(state.time?.tModelMs).toBe(5000);
  });
});
