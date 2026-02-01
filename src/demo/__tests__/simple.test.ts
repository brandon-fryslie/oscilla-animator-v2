/**
 * Simple demo patch - compile + execute test
 */

import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../../compiler/compile';
import { createRuntimeState, executeFrame } from '../../runtime';
import { getTestArena } from '../../runtime/__tests__/test-arena-helper';
import type { ScheduleIR } from '../../compiler/backend/schedule-program';
import { patchSimple } from '../simple';

describe('simple demo patch', () => {
  it('compiles without errors', () => {
    const patch = buildPatch(patchSimple);
    const result = compile(patch);
    if (result.kind === 'error') {
      throw new Error(`Compilation failed: ${result.errors.map(e => e.message).join('; ')}`);
    }
    expect(result.kind).toBe('ok');
  });

  it('executes a frame and produces draw ops', () => {
    const patch = buildPatch(patchSimple);
    const result = compile(patch);
    if (result.kind === 'error') {
      throw new Error(`Compilation failed: ${result.errors.map(e => e.message).join('; ')}`);
    }
    const program = result.program;
    const schedule = program.schedule as ScheduleIR;
    const state = createRuntimeState(
      program.slotMeta.length,
      schedule.stateSlotCount,
      0,
      0,
      program.valueExprs.nodes.length,
    );
    const arena = getTestArena();
    const frame = executeFrame(program, state, arena, 0);

    expect(frame.version).toBe(2);
    expect(frame.ops.length).toBeGreaterThan(0);
    expect(frame.ops[0].instances.count).toBe(4);
  });
});
