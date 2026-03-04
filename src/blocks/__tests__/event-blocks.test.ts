import { describe, it, expect } from 'vitest';
import { compile } from '../../compiler/compile';
import { buildPatch, type Patch } from '../../graph';
import type { PatchBuilder } from '../../graph';
import type { CompiledProgramIR } from '../../compiler/ir/program';
import { computeRuntimeStorageSizes } from '../../compiler/ir/program';
import type { ScheduleIR } from '../../compiler/backend/schedule-program';
import { createRuntimeState } from '../../runtime/RuntimeState';
import { executeFrame } from '../../runtime/ScheduleExecutor';
import { getTestArena } from '../../runtime/__tests__/test-arena-helper';

function compileOk(patch: Patch): CompiledProgramIR {
  const result = compile(patch);
  if (result.kind === 'error') {
    throw new Error(result.errors.map((e) => `${e.code}: ${e.message}`).join('\n'));
  }
  return result.program;
}

function createState(program: CompiledProgramIR) {
  const schedule = program.schedule as ScheduleIR;
  const sizes = computeRuntimeStorageSizes(program.runtimeSlots);
  return createRuntimeState(
    sizes.f32,
    schedule.stateSlotCount ?? 0,
    schedule.eventSlotCount ?? 0,
    schedule.eventCount ?? 0,
    program.valueExprs.nodes.length,
    program.arenaTotalFloats,
    0,
    undefined,
    undefined,
    program.arenaRuntimeLayout,
  );
}

function buildScalarProbePatch(
  wireScale: (ctx: { b: PatchBuilder; time: any; render: any }) => void,
): Patch {
  return buildPatch((b) => {
    const time = b.addBlock('InfiniteTimeRoot');

    const ellipse = b.addBlock('Ellipse');
    b.setPortDefault(ellipse, 'rx', 0.03);
    b.setPortDefault(ellipse, 'ry', 0.03);

    const array = b.addBlock('Array');
    b.setPortDefault(array, 'count', 1);

    const layout = b.addBlock('GridLayoutUV');
    b.setPortDefault(layout, 'rows', 1);
    b.setPortDefault(layout, 'cols', 1);

    const color = b.addBlock('Const');
    b.setConfig(color, 'value', { r: 1, g: 1, b: 1, a: 1 });
    const colorField = b.addBlock('Broadcast');

    const render = b.addBlock('RenderInstances2D');
    b.wire(ellipse, 'shape', array, 'element');
    b.wire(array, 'elements', layout, 'elements');
    b.wire(layout, 'controlPoints', render, 'controlPoints');
    b.wire(color, 'out', colorField, 'one');
    b.wire(colorField, 'field', render, 'color');

    // [LAW:behavior-not-structure] Assert event behavior through rendered scalar outputs.
    wireScale({ b, time, render });
  });
}

function runScaleFrames(program: CompiledProgramIR, timesMs: readonly number[]): number[] {
  const state = createState(program);
  const values: number[] = [];
  for (const t of timesMs) {
    const frame = executeFrame(program, state, getTestArena(), t);
    expect(frame.ops.length).toBeGreaterThan(0);
    const size = frame.ops[0]!.instances.size;
    values.push(typeof size === 'number' ? size : (size[0] ?? 0));
  }
  return values;
}

describe('EventToOneMask', () => {
  it('emits 1.0 when pulse event fires', () => {
    const patch = buildScalarProbePatch(({ b, time, render }) => {
      const mask = b.addBlock('EventToOneMask');
      b.wire(time, 'pulse', mask, 'event');
      b.wire(mask, 'out', render, 'scale');
    });

    const program = compileOk(patch);
    const values = runScaleFrames(program, [0, 16, 32]);

    expect(values).toEqual([1, 1, 1]);
  });
});

describe('SampleHold', () => {
  it('samples on trigger ticks and holds between triggers', () => {
    const patch = buildScalarProbePatch(({ b, time, render }) => {
      const threshold = b.addBlock('Const');
      b.setConfig(threshold, 'value', 150);
      const edge = b.addBlock('EdgeTrigger');

      const hold = b.addBlock('SampleHold');
      b.setConfig(hold, 'initialValue', 0);

      b.wire(time, 'tMs', edge, 'value');
      b.wire(threshold, 'out', edge, 'threshold');
      b.wire(time, 'tMs', hold, 'value');
      b.wire(edge, 'rising', hold, 'trigger');
      b.wire(hold, 'out', render, 'scale');
    });

    const program = compileOk(patch);
    const values = runScaleFrames(program, [0, 100, 200, 300]);

    expect(values[0]).toBeCloseTo(0, 6);
    expect(values[1]).toBeCloseTo(0, 6);
    expect(values[2]).toBeCloseTo(200, 6);
    expect(values[3]).toBeCloseTo(200, 6);
  });
});
