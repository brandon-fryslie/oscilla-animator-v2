import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../../compiler/compile';
import { executeFrame } from '../../runtime/ScheduleExecutor';
import { createRuntimeState } from '../../runtime/RuntimeState';
import type { ScheduleIR } from '../../compiler/backend/schedule-program';
import { computeRuntimeStorageSizes, type CompiledProgramIR } from '../../compiler/ir/program';
import { getTestArena } from '../../runtime/__tests__/test-arena-helper';

function buildSimplePatch(count: number, rows: number, cols: number) {
  return buildPatch((b) => {
    b.addBlock('InfiniteTimeRoot');

    const ellipse = b.addBlock('Ellipse');
    b.setPortDefault(ellipse, 'rx', 0.02);
    b.setPortDefault(ellipse, 'ry', 0.02);

    const array = b.addBlock('Array');
    b.setPortDefault(array, 'count', count);

    const layout = b.addBlock('GridLayoutUV');
    b.setPortDefault(layout, 'rows', rows);
    b.setPortDefault(layout, 'cols', cols);

    const color = b.addBlock('Const');
    b.setConfig(color, 'value', { r: 1.0, g: 1.0, b: 1.0, a: 1.0 });
    const colorField = b.addBlock('Broadcast');

    const render = b.addBlock('RenderInstances2D');

    b.wire(ellipse, 'shape', array, 'element');
    b.wire(array, 'elements', layout, 'elements');
    b.wire(layout, 'position', render, 'pos');
    b.wire(color, 'out', colorField, 'one');
    b.wire(colorField, 'field', render, 'color');
  });
}

function compileOk(count: number, rows: number, cols: number): CompiledProgramIR {
  const result = compile(buildSimplePatch(count, rows, cols));
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
  );
}

describe('Level 5: Assembler Integration', () => {
  it('produces finite screen-space render data from compiled patch', () => {
    const program = compileOk(9, 3, 3);
    const state = createState(program);

    const frame = executeFrame(program, state, getTestArena(), 0);
    expect(frame.ops.length).toBe(1);

    const op = frame.ops[0]!;
    expect(op.instances.count).toBe(9);

    for (const value of op.instances.position) {
      expect(Number.isFinite(value)).toBe(true);
    }
    for (const value of op.instances.size) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
    for (const value of op.instances.depth) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('is deterministic for identical compile+frame inputs', () => {
    const program = compileOk(16, 4, 4);

    const frameA = executeFrame(program, createState(program), getTestArena(), 120);
    const frameB = executeFrame(program, createState(program), getTestArena(), 120);

    // [LAW:one-source-of-truth] Render output equality is the canonical behavior contract.
    expect(frameB.ops.length).toBe(frameA.ops.length);
    expect(frameB.ops[0]!.instances.position).toEqual(frameA.ops[0]!.instances.position);
    expect(frameB.ops[0]!.instances.size).toEqual(frameA.ops[0]!.instances.size);
    expect(frameB.ops[0]!.instances.depth).toEqual(frameA.ops[0]!.instances.depth);
  });
});
