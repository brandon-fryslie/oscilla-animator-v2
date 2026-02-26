import { describe, it, expect } from 'vitest';
import { compile } from '../../compiler/compile';
import { buildPatch, type Patch } from '../../graph';
import type { PatchBuilder } from '../../graph';
import { executeFrame } from '../../runtime/ScheduleExecutor';
import { createRuntimeState } from '../../runtime/RuntimeState';
import type { ScheduleIR } from '../../compiler/backend/schedule-program';
import { computeRuntimeStorageSizes, type CompiledProgramIR } from '../../compiler/ir/program';
import { SCALAR_INSTANCE_ID } from '../../compiler/ir/Indices';
import { materializeValueExpr } from '../../runtime/ValueExprMaterializer';

import { getTestArena } from './test-arena-helper';

type ReduceOpName = 'sum' | 'avg' | 'min' | 'max';

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

function buildReduceProbePatch(opts: {
  op: ReduceOpName;
  sourceCount: number;
  makeField?: (ctx: { b: PatchBuilder; fieldBlock: any; fieldPort: string }) => {
    block: any;
    port: string;
  };
}): Patch {
  const { op, sourceCount, makeField } = opts;

  return buildPatch((b) => {
    b.addBlock('InfiniteTimeRoot');

    const sourceShape = b.addBlock('Ellipse');
    const sourceArray = b.addBlock('Array');
    b.setPortDefault(sourceArray, 'count', sourceCount);
    b.wire(sourceShape, 'shape', sourceArray, 'element');

    const reduce = b.addBlock('Reduce');
    b.setConfig(reduce, 'op', op);

    const reducedFieldInput = makeField
      ? makeField({ b, fieldBlock: sourceArray, fieldPort: 't' })
      : { block: sourceArray, port: 't' };
    b.wire(reducedFieldInput.block, reducedFieldInput.port, reduce, 'field');

    // Independent render lane so output remains observable even when sourceCount=0.
    const renderShape = b.addBlock('Ellipse');
    b.setPortDefault(renderShape, 'rx', 0.03);
    b.setPortDefault(renderShape, 'ry', 0.03);

    const renderArray = b.addBlock('Array');
    b.setPortDefault(renderArray, 'count', 1);
    b.wire(renderShape, 'shape', renderArray, 'element');

    const layout = b.addBlock('GridLayoutUV');
    b.setPortDefault(layout, 'rows', 1);
    b.setPortDefault(layout, 'cols', 1);
    b.wire(renderArray, 'elements', layout, 'elements');

    const color = b.addBlock('Const');
    b.setConfig(color, 'value', { r: 1, g: 1, b: 1, a: 1 });
    const colorField = b.addBlock('Broadcast');
    b.wire(color, 'out', colorField, 'one');

    const render = b.addBlock('RenderInstances2D');
    b.wire(layout, 'controlPoints', render, 'controlPoints');
    b.wire(colorField, 'field', render, 'color');

    // [LAW:behavior-not-structure] Reduce contract is asserted from rendered scale output.
    b.wire(reduce, 'one', render, 'scale');
  });
}

function runReduceScale(program: CompiledProgramIR): number {
  const state = createState(program);
  const frame = executeFrame(program, state, getTestArena(), 0);
  expect(frame.ops.length).toBeGreaterThan(0);
  const size = frame.ops[0]!.instances.size;
  return typeof size === 'number' ? size : (size[0] ?? 0);
}

describe('ReduceOp', () => {
  it('computes sum/min/max/avg over field inputs', () => {
    const sumProgram = compileOk(buildReduceProbePatch({ op: 'sum', sourceCount: 4 }));
    const avgProgram = compileOk(buildReduceProbePatch({ op: 'avg', sourceCount: 4 }));
    const minProgram = compileOk(buildReduceProbePatch({ op: 'min', sourceCount: 4 }));
    const maxProgram = compileOk(buildReduceProbePatch({ op: 'max', sourceCount: 4 }));

    // Array.t for count=4: [0, 1/3, 2/3, 1]
    expect(runReduceScale(sumProgram)).toBeCloseTo(2, 5);
    expect(runReduceScale(avgProgram)).toBeCloseTo(0.5, 5);
    expect(runReduceScale(minProgram)).toBeCloseTo(0, 5);
    expect(runReduceScale(maxProgram)).toBeCloseTo(1, 5);
  });

  it('returns 0 for empty input lanes', () => {
    const program = compileOk(buildReduceProbePatch({ op: 'sum', sourceCount: 1 }));
    const reduceExprId = program.valueExprs.nodes.findIndex(
      (node) => node.kind === 'kernel' && node.kernelKind === 'reduce',
    );
    expect(reduceExprId).toBeGreaterThanOrEqual(0);

    const zeroCountInstances = new Map(
      Array.from((program.schedule as ScheduleIR).instances.entries()).map(([id, decl]) => [
        id,
        typeof decl.count === 'number' ? { ...decl, count: 0 } : decl,
      ]),
    );
    const zeroLaneProgram: CompiledProgramIR = {
      ...program,
      schedule: {
        ...(program.schedule as ScheduleIR),
        instances: zeroCountInstances,
      },
    } as CompiledProgramIR;

    const state = createState(zeroLaneProgram);
    const reduced = materializeValueExpr(
      reduceExprId as any,
      zeroLaneProgram.valueExprs,
      SCALAR_INSTANCE_ID,
      1,
      state,
      zeroLaneProgram,
    );
    const reducedValue = typeof reduced === 'number' ? reduced : reduced[0];
    expect(reducedValue).toBe(0);
  });

  it('propagates NaN when source field contains NaN values', () => {
    const program = compileOk(
      buildReduceProbePatch({
        op: 'sum',
        sourceCount: 4,
        makeField: ({ b, fieldBlock, fieldPort }) => {
          const zero = b.addBlock('Subtract');
          b.wire(fieldBlock, fieldPort, zero, 'a');
          b.wire(fieldBlock, fieldPort, zero, 'b');

          const nanField = b.addBlock('Divide');
          b.wire(zero, 'out', nanField, 'a');
          b.wire(zero, 'out', nanField, 'b');
          return { block: nanField, port: 'out' };
        },
      }),
    );

    expect(Number.isNaN(runReduceScale(program))).toBe(true);
  });
});
