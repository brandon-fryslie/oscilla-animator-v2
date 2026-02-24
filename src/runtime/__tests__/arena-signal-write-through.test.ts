import { describe, expect, it } from 'vitest';
import { compile } from '../../compiler/compile';
import type { ScheduleIR } from '../../compiler/backend/schedule-program';
import type { CompiledProgramIR } from '../../compiler/ir/program';
import { computeStorageSizes } from '../../compiler/ir/program';
import { SYSTEM_PALETTE_SLOT } from '../../compiler/ir/Indices';
import { buildPatch } from '../../graph/Patch';
import { executeFrame } from '../ScheduleExecutor';
import { executeFrameStepped } from '../executeFrameStepped';
import type { RuntimeState } from '../RuntimeState';
import { createRuntimeState } from '../RuntimeState';
import { assertF64Stride, getExprAddressTable } from '../ExprAddressTable';
import { getTestArena } from './test-arena-helper';

import '../../blocks/all';

function compileSignalPatch(): CompiledProgramIR {
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
    b.wire(color, 'out', colorField, 'signal');

    const render = b.addBlock('RenderInstances2D');
    b.wire(ellipse, 'shape', array, 'element');
    b.wire(array, 'elements', layout, 'elements');
    b.wire(layout, 'position', render, 'pos');
    b.wire(colorField, 'field', render, 'color');
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

function assertMirroredF64Slot(program: CompiledProgramIR, state: RuntimeState, slot: number): number {
  const table = getExprAddressTable(program);
  const lookup = table.slotLookup.get(slot as any);
  if (!lookup || lookup.storage !== 'f64') return 0;
  const arenaDesc = program.arenaLayout[slot];
  if (!arenaDesc || arenaDesc.offset < 0) return 0;

  const copyLength = Math.min(lookup.stride, arenaDesc.length);
  for (let i = 0; i < copyLength; i++) {
    const f64Value = state.values.f64[lookup.offset + i];
    const arenaValue = state.arena[arenaDesc.offset + i];
    expect(arenaValue).toBeCloseTo(f64Value, 6);
  }
  return lookup.stride;
}

function assertSignalWritesMirrored(program: CompiledProgramIR, state: RuntimeState): void {
  const schedule = program.schedule as ScheduleIR;
  const table = getExprAddressTable(program);

  const paletteLookup = assertF64Stride(table.slotLookup, SYSTEM_PALETTE_SLOT, 4, 'time.palette slot');
  const paletteDesc = program.arenaLayout[SYSTEM_PALETTE_SLOT as number];
  if (!paletteDesc) {
    throw new Error('Missing arena descriptor for SYSTEM_PALETTE_SLOT');
  }
  expect(paletteDesc.offset).toBeGreaterThanOrEqual(0);
  for (let i = 0; i < 4; i++) {
    expect(state.arena[paletteDesc.offset + i]).toBeCloseTo(state.values.f64[paletteLookup.offset + i], 6);
  }

  let scalarSignalSlots = 0;
  for (const step of schedule.steps) {
    if (step.kind === 'evalValue' && step.target.storage === 'value') {
      const stride = assertMirroredF64Slot(program, state, step.target.slot as number);
      if (stride === 1) scalarSignalSlots++;
    }
  }

  expect(scalarSignalSlots).toBeGreaterThan(0);
}

describe('signal write-through mirrors f64 values into arena', () => {
  it('executeFrame mirrors scalar signal writes (and system palette stride writes)', () => {
    const program = compileSignalPatch();
    const state = createStateForProgram(program);

    executeFrame(program, state, getTestArena(), 100);
    assertSignalWritesMirrored(program, state);
  });

  it('executeFrameStepped mirrors scalar signal writes (and system palette stride writes)', () => {
    const program = compileSignalPatch();
    const state = createStateForProgram(program);

    const gen = executeFrameStepped(program, state, getTestArena(), 100);
    let step = gen.next();
    while (!step.done) {
      step = gen.next();
    }

    assertSignalWritesMirrored(program, state);
  });
});
