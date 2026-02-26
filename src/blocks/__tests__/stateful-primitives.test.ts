import { describe, it, expect } from 'vitest';
import { compile } from '../../compiler/compile';
import { buildPatch, type Patch } from '../../graph';
import { executeFrame } from '../../runtime/ScheduleExecutor';
import { createRuntimeState } from '../../runtime/RuntimeState';
import type { ScheduleIR } from '../../compiler/backend/schedule-program';
import { computeRuntimeStorageSizes, type CompiledProgramIR } from '../../compiler/ir/program';
import { getTestArena } from '../../runtime/__tests__/test-arena-helper';

function compileOk(patch: Patch): CompiledProgramIR {
  const result = compile(patch);
  if (result.kind === 'error') {
    throw new Error(result.errors.map((err) => `${err.code}: ${err.message}`).join('\n'));
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

function buildScalarProbePatch(
  connectScale: (ctx: { b: Parameters<typeof buildPatch>[0]; time: any; render: any }) => void,
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
    b.wire(layout, 'position', render, 'pos');
    b.wire(color, 'out', colorField, 'one');
    b.wire(colorField, 'field', render, 'color');

    // [LAW:behavior-not-structure] Probe tests assert observable scale in render output.
    connectScale({ b, time, render });
  });
}

function runScaleFrames(program: CompiledProgramIR, frameTimesMs: readonly number[]): number[] {
  const state = createState(program);
  const out: number[] = [];
  for (const t of frameTimesMs) {
    const frame = executeFrame(program, state, getTestArena(), t);
    expect(frame.ops.length).toBeGreaterThan(0);
    out.push(frame.ops[0]!.instances.size[0]!);
  }
  return out;
}

describe('UnitDelay', () => {
  it('outputs previous-frame input value (one-frame lag)', () => {
    const patch = buildScalarProbePatch(({ b, time, render }) => {
      const delay = b.addBlock('UnitDelay');
      b.wire(time, 'tMs', delay, 'in');
      b.wire(delay, 'out', render, 'scale');
    });

    const program = compileOk(patch);
    const values = runScaleFrames(program, [100, 250, 400]);

    expect(values[0]).toBeCloseTo(0, 6);
    expect(values[1]).toBeCloseTo(100, 6);
    expect(values[2]).toBeCloseTo(250, 6);
  });
});

describe('Lag', () => {
  it('converges monotonically to target value', () => {
    const patch = buildScalarProbePatch(({ b, render }) => {
      const one = b.addBlock('Const');
      b.setConfig(one, 'value', 1);
      const lag = b.addBlock('Lag');
      b.setConfig(lag, 'smoothing', 0.5);
      b.setConfig(lag, 'initialValue', 0);
      b.wire(one, 'out', lag, 'target');
      b.wire(lag, 'out', render, 'scale');
    });

    const program = compileOk(patch);
    const values = runScaleFrames(program, [16, 32, 48, 64, 80, 96, 112, 128]);

    for (let i = 1; i < values.length; i++) {
      expect(values[i]!).toBeGreaterThanOrEqual(values[i - 1]!);
      expect(values[i]!).toBeLessThanOrEqual(1);
    }
    expect(values.at(-1)!).toBeGreaterThan(0.99);
  });
});

describe('Phasor', () => {
  it('wraps phase continuously in [0,1)', () => {
    const patch = buildScalarProbePatch(({ b, render }) => {
      const hz = b.addBlock('Const');
      b.setConfig(hz, 'value', 2);
      const phasor = b.addBlock('Phasor');
      b.setConfig(phasor, 'initialPhase', 0);
      b.wire(hz, 'out', phasor, 'frequency');
      b.wire(phasor, 'out', render, 'scale');
    });

    const program = compileOk(patch);
    const values = runScaleFrames(program, [0, 250, 500, 750, 1000]);

    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }

    expect(values[0]).toBeCloseTo(0, 6);
    expect(values[1]).toBeCloseTo(0.5, 5);
    expect(values[2]).toBeCloseTo(0, 5);
    expect(values[3]).toBeCloseTo(0.5, 5);
    expect(values[4]).toBeCloseTo(0, 5);
  });
});

describe('Hash', () => {
  function compileHashProbe(seed: number, value: number): CompiledProgramIR {
    const patch = buildScalarProbePatch(({ b, render }) => {
      const valueBlock = b.addBlock('Const');
      b.setConfig(valueBlock, 'value', value);
      const seedBlock = b.addBlock('Const');
      b.setConfig(seedBlock, 'value', seed);
      const hash = b.addBlock('Hash');
      b.wire(valueBlock, 'out', hash, 'value');
      b.wire(seedBlock, 'out', hash, 'seed');
      b.wire(hash, 'out', render, 'scale');
    });
    return compileOk(patch);
  }

  it('is deterministic for the same value+seed and changes when seed changes', () => {
    const programA = compileHashProbe(7, 42);
    const valuesA = runScaleFrames(programA, [0, 16, 32]);

    expect(valuesA[0]).toBeCloseTo(valuesA[1], 8);
    expect(valuesA[1]).toBeCloseTo(valuesA[2], 8);
    expect(valuesA[0]).toBeGreaterThanOrEqual(0);
    expect(valuesA[0]).toBeLessThan(1);

    const programB = compileHashProbe(8, 42);
    const valuesB = runScaleFrames(programB, [0]);

    expect(valuesB[0]).toBeGreaterThanOrEqual(0);
    expect(valuesB[0]).toBeLessThan(1);
    expect(valuesB[0]).not.toBeCloseTo(valuesA[0], 8);
  });
});
