import { describe, expect, it } from 'vitest';
import { compile } from '../../compiler/compile';
import type { ScheduleIR } from '../../compiler/backend/schedule-program';
import type { CompiledProgramIR } from '../../compiler/ir/program';
import { computeRuntimeStorageSizes } from '../../compiler/ir/program';
import { SCALAR_INSTANCE_ID, SYSTEM_PALETTE_SLOT } from '../../compiler/ir/Indices';
import { buildPatch } from '../../graph/Patch';
import { executeFrame } from '../ScheduleExecutor';
import { executeFrameStepped } from '../executeFrameStepped';
import type { RuntimeState } from '../RuntimeState';
import { createRuntimeState } from '../RuntimeState';
import { packDrawPrepSinkTableV1 } from '../DrawPrepSinkTablePacker';
import { EMPTY_LEGACY_RENDER_FRAME, type LegacyRenderFrame } from '../../render/types';
import { getTestArena } from './test-arena-helper';

import { registerAllBlocks } from '../../blocks/all';
registerAllBlocks();

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
    b.wire(color, 'out', colorField, 'one');

    const render = b.addBlock('RenderInstances2D');
    b.wire(ellipse, 'shape', array, 'element');
    b.wire(array, 'elements', layout, 'elements');
    b.wire(layout, 'controlPoints', render, 'controlPoints');
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
  const sizes = computeRuntimeStorageSizes(program.runtimeSlots);
  return createRuntimeState(
    schedule.stateSlotCount ?? 0,
    schedule.eventSlotCount ?? 0,
    program.valueExprs.nodes.length,
    program.arenaTotalFloats,
    undefined,
    undefined,
    program.arenaRuntimeLayout,
  );
}

function readArenaSlot(program: CompiledProgramIR, state: RuntimeState, slot: number): number[] {
  const arenaDesc = program.arenaLayout[slot];
  if (!arenaDesc || arenaDesc.offset < 0 || arenaDesc.length <= 0) return [];
  return Array.from(state.arena.subarray(arenaDesc.offset, arenaDesc.offset + arenaDesc.length));
}

function assertFiniteValues(values: readonly number[]): void {
  for (const value of values) {
    expect(Number.isFinite(value)).toBe(true);
  }
}

function assertScalarWritesInArena(program: CompiledProgramIR, state: RuntimeState): void {
  const schedule = program.schedule as ScheduleIR;
  const paletteDesc = program.arenaLayout[SYSTEM_PALETTE_SLOT as number];
  if (!paletteDesc) {
    throw new Error('Missing arena descriptor for SYSTEM_PALETTE_SLOT');
  }
  expect(paletteDesc.offset).toBeGreaterThanOrEqual(0);
  const palette = Array.from(state.arena.subarray(paletteDesc.offset, paletteDesc.offset + 4));
  assertFiniteValues(palette);
  expect(Math.abs(palette[0]) + Math.abs(palette[1]) + Math.abs(palette[2])).toBeGreaterThan(0);
  expect(palette[3]).toBeGreaterThanOrEqual(0);
  expect(palette[3]).toBeLessThanOrEqual(1);

  let scalarArenaSlots = 0;
  for (const step of schedule.steps) {
    const targetSlot =
      step.kind === 'materialize' && step.instanceId === SCALAR_INSTANCE_ID
        ? (step.target as number)
        : null;
    if (targetSlot !== null) {
      const values = readArenaSlot(program, state, targetSlot);
      if (values.length === 1) {
        scalarArenaSlots++;
      }
      assertFiniteValues(values);
    }
  }

  expect(scalarArenaSlots).toBeGreaterThan(0);
}

function runSteppedFrameToCompletion(
  program: CompiledProgramIR,
  state: RuntimeState,
  tAbsMs: number,
): LegacyRenderFrame {
  const gen = executeFrameStepped(program, state, getTestArena(), tAbsMs);
  let step = gen.next();
  while (!step.done) {
    step = gen.next();
  }
  return step.value;
}

function assertGpuPlanesRemainPackable(program: CompiledProgramIR, state: RuntimeState): void {
  const packed = packDrawPrepSinkTableV1(program, state);
  expect(packed).not.toBeNull();
  if (!packed) {
    return;
  }
  // [LAW:one-source-of-truth] Draw-prep readiness is asserted via the canonical
  // sink-table packer contract, not ad-hoc render-frame op inspection.
  expect(packed.wordCount).toBeGreaterThan(0);
  expect(state.shapeBank.volatilePtr).toBeGreaterThan(0);
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

    runSteppedFrameToCompletion(program, state, 100);

    assertScalarWritesInArena(program, state);
  });

  it('executeFrame and executeFrameStepped produce equivalent arena values for value slots', () => {
    const program = compileScalarValuePatch();
    const frameState = createStateForProgram(program);
    const steppedState = createStateForProgram(program);

    executeFrame(program, frameState, getTestArena(), 100);

    runSteppedFrameToCompletion(program, steppedState, 100);

    const schedule = program.schedule as ScheduleIR;
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

  it('executeFrame returns compute-only sentinel frame while keeping GPU planes packable', () => {
    const program = compileScalarValuePatch();
    const state = createStateForProgram(program);

    const frame = executeFrame(program, state, getTestArena(), 100);
    expect(frame).toBe(EMPTY_LEGACY_RENDER_FRAME);
    assertScalarWritesInArena(program, state);
    assertGpuPlanesRemainPackable(program, state);
  });

  it('executeFrameStepped returns compute-only sentinel frame while keeping GPU planes packable', () => {
    const program = compileScalarValuePatch();
    const state = createStateForProgram(program);

    const frame = runSteppedFrameToCompletion(program, state, 100);
    expect(frame).toBe(EMPTY_LEGACY_RENDER_FRAME);
    assertScalarWritesInArena(program, state);
    assertGpuPlanesRemainPackable(program, state);
  });
});
