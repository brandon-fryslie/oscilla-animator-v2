import { describe, expect, it } from 'vitest';
import { compile } from '../../compiler/compile';
import type { ScheduleIR } from '../../compiler/backend/schedule-program';
import type { CompiledProgramIR } from '../../compiler/ir/program';
import { computeStorageSizes } from '../../compiler/ir/program';
import { SCALAR_INSTANCE_ID, SYSTEM_PALETTE_SLOT } from '../../compiler/ir/Indices';
import { buildPatch } from '../../graph/Patch';
import { executeFrame } from '../ScheduleExecutor';
import { executeFrameStepped } from '../executeFrameStepped';
import type { RuntimeState } from '../RuntimeState';
import { createRuntimeState } from '../RuntimeState';
import { getTestArena } from './test-arena-helper';

import '../../blocks/all';

function compileScalarValuePatch(): CompiledProgramIR {
  const patch = buildPatch((b) => {
    b.addBlock('InfiniteTimeRoot');

    const ellipse = b.addBlock('Ellipse');
    b.setPortDefault(ellipse, 'rx', 0.03);
    b.setPortDefault(ellipse, 'ry', 0.03);
    const array = b.addBlock('Array');
    b.setPortDefault(array, 'count', 4);
    const layout = b.addBlock('GridLayoutUV');
    b.setPortDefault(layout, 'rows', 2);
    b.setPortDefault(layout, 'cols', 2);

    const color = b.addBlock('Const');
    b.setConfig(color, 'value', { r: 1, g: 0.5, b: 0.2, a: 1 });
    const colorField = b.addBlock('Broadcast');
    b.wire(color, 'out', colorField, 'input');

    const render = b.addBlock('RenderInstances2D');
    b.wire(ellipse, 'shape', array, 'element');
    b.wire(array, 'elements', layout, 'elements');
    b.wire(layout, 'position', render, 'pos');
    b.wire(colorField, 'out', render, 'color');
  });

  const result = compile(patch);
  if (result.kind === 'error') {
    throw new Error(result.errors.map((e) => e.message).join('\n'));
  }
  return result.program;
}

function createStateForProgram(program: CompiledProgramIR): RuntimeState {
  const schedule = program.schedule as ScheduleIR;
  const sizes = computeStorageSizes(program.slotMeta);
  return createRuntimeState(
    sizes.f64,
    schedule.stateSlotCount ?? 0,
    schedule.eventSlotCount ?? 0,
    schedule.eventCount ?? 0,
    program.valueExprs.nodes.length,
    program.arenaTotalFloats,
  );
}

function readArenaSlot(program: CompiledProgramIR, state: RuntimeState, slot: number): number[] {
  const arenaDesc = program.arenaLayout[slot];
  if (!arenaDesc || arenaDesc.offset < 0 || arenaDesc.length <= 0) return [];
  return Array.from(state.arena.subarray(arenaDesc.offset, arenaDesc.offset + arenaDesc.length));
}

function assertScalarWritesInArena(program: CompiledProgramIR, state: RuntimeState): void {
  const schedule = program.schedule as ScheduleIR;
  const paletteDesc = program.arenaLayout[SYSTEM_PALETTE_SLOT as number];
  if (!paletteDesc) {
    throw new Error('Missing arena descriptor for SYSTEM_PALETTE_SLOT');
  }
  expect(paletteDesc.offset).toBeGreaterThanOrEqual(0);
  const palette = Array.from(state.arena.subarray(paletteDesc.offset, paletteDesc.offset + 4));
  for (const value of palette) {
    expect(Number.isFinite(value)).toBe(true);
  }
  expect(Math.abs(palette[0]) + Math.abs(palette[1]) + Math.abs(palette[2])).toBeGreaterThan(0);
  expect(palette[3]).toBeGreaterThanOrEqual(0);
  expect(palette[3]).toBeLessThanOrEqual(1);

  // [LAW:one-source-of-truth] All scalar values go through StepMaterialize(SCALAR_INSTANCE_ID).
  let scalarArenaSlots = 0;
  for (const step of schedule.steps) {
    if (step.kind === 'materialize' && step.instanceId === SCALAR_INSTANCE_ID) {
      const targetSlot = step.target as number;
      const values = readArenaSlot(program, state, targetSlot);
      if (values.length === 1) {
        scalarArenaSlots++;
      }
      for (const value of values) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  }

  expect(scalarArenaSlots).toBeGreaterThan(0);
}

describe('scalar writes target arena storage', () => {
  it('executeFrame writes scalar values and system palette into arena', () => {
    const program = compileScalarValuePatch();
    const state = createStateForProgram(program);

    executeFrame(program, state, getTestArena(), 100);
    assertScalarWritesInArena(program, state);
  });

  it('executeFrameStepped writes scalar values and system palette into arena', () => {
    const program = compileScalarValuePatch();
    const state = createStateForProgram(program);

    const gen = executeFrameStepped(program, state, getTestArena(), 100);
    let step = gen.next();
    while (!step.done) {
      step = gen.next();
    }

    assertScalarWritesInArena(program, state);
  });

  it('executeFrame and executeFrameStepped produce equivalent arena values for value slots', () => {
    const program = compileScalarValuePatch();
    const frameState = createStateForProgram(program);
    const steppedState = createStateForProgram(program);

    executeFrame(program, frameState, getTestArena(), 100);

    const gen = executeFrameStepped(program, steppedState, getTestArena(), 100);
    let step = gen.next();
    while (!step.done) {
      step = gen.next();
    }

    const schedule = program.schedule as ScheduleIR;
    // [LAW:one-source-of-truth] All scalar values go through StepMaterialize(SCALAR_INSTANCE_ID).
    const scalarWriteSlots = new Set<number>();
    for (const irStep of schedule.steps) {
      if (irStep.kind === 'materialize' && irStep.instanceId === SCALAR_INSTANCE_ID) {
        scalarWriteSlots.add(irStep.target as number);
      }
    }
    for (const slot of scalarWriteSlots) {
      const a = readArenaSlot(program, frameState, slot);
      const b = readArenaSlot(program, steppedState, slot);
      expect(a.length).toBe(b.length);
      for (let i = 0; i < a.length; i++) {
        expect(a[i]).toBeCloseTo(b[i], 6);
      }
    }
  });
});
